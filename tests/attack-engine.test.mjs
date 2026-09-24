import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CardRepository } from "../src/card-db/CardRepository.js";
import { AttackEngine } from "../src/engine/AttackEngine.js";
import { inspectAttacks } from "../src/card-db/parse-effects.js";

const db = JSON.parse(fs.readFileSync("tests/fixtures/ability-cards.json", "utf8"));
db.cards.push(...JSON.parse(fs.readFileSync("tests/fixtures/attack-cards.json", "utf8")));
const abilities = JSON.parse(fs.readFileSync("tests/fixtures/ability-effects.json", "utf8"));
abilities.cardCount = db.cards.length;
const engine = new AttackEngine(new CardRepository(db), abilities);
const card = (instanceId, cardId, attached = []) => ({ instanceId, cardId, attached });
const player = (active, hand = [], deck = []) => ({ active, hand, deck, bench: [], trash: [] });
const state = (own, other) => ({ ruleset: "supported_abilities_v1", stadium: null,
  turn: 0, players: [own, other], usedAbilities: { instances: [], names: [] } });

test("Budew has a zero energy 10 damage attack and locks hand items for one opponent turn", () => {
  const budew = card("budew", 49956);
  const item = card("item", 50742);
  const game = state(player(budew), player(card("target", 48466), [item]));
  assert.equal(engine.attacks(budew)[0].status, "supported");
  assert.equal(engine.attacks(budew)[0].cost[0], "Void");
  const [action] = engine.getLegalAttacks(game);
  assert.equal(engine.calculateAttackDamage(game, action), 10);
  const after = engine.applyAttack(game, action);
  assert.equal(after.players[1].active.damage, 10);
  assert.equal(after.turn, 1);
  assert.equal(engine.canPlayItemFromHand(after, 1, "item"), false);
  const expired = engine.endTurn(after);
  assert.equal(expired.itemLocks[1], false);
  const otherTurn = engine.endTurn(expired);
  assert.equal(engine.canPlayItemFromHand(otherTurn, 1, "item"), true);
  assert.equal(game.players[1].active.damage, undefined);
});

test("Heracross draws two after 20 damage; basic Grass Energy pays Grass cost", () => {
  const grass = card("energy", 50745);
  const game = state(player(card("heracross", 50339, [grass]), [],
    [card("draw-1", 50745), card("draw-2", 50745)]), player(card("target", 48466)));
  const legal = engine.getLegalAttacks(game);
  assert.deepEqual(legal.map(x => x.attackIndex), [0]);
  const after = engine.applyAttack(game, legal[0]);
  assert.equal(after.players[1].active.damage, 20);
  assert.deepEqual(after.players[0].hand.map(x => x.instanceId), ["draw-1", "draw-2"]);
  assert.equal(engine.getLegalAttacks(state(player(card("heracross", 50339, [grass]), [],
    [card("only-one", 50745)]), player(card("target", 48466)))).length, 0);
});

test("Heracross self damage is an attack effect and does not gain weakness", () => {
  const energies = [card("energy-1", 50745), card("energy-2", 50745), card("energy-3", 50745)];
  const game = state(player(card("heracross", 50339, energies)), player(card("target", 47069)));
  const strong = engine.getLegalAttacks(game).find(x => x.attackIndex === 1);
  assert.ok(strong);
  assert.equal(engine.calculateAttackDamage(game, strong), 260); // Grass weakness
  const after = engine.applyAttack(game, strong);
  assert.equal(after.players[0].active.damage, 30);
  assert.equal(after.players[1].active.damage, 260);
  assert.equal(after.turn, 1);
});

test("Ogerpon three Grass Energy enables Manyō Shigure and counts both active Pokémon's Energy", () => {
  const grass = index => card(`grass-${index}`, 50745);
  const ogerpon = count => card("ogerpon", 45707, Array.from({ length: count }, (_, i) => grass(i)));
  assert.equal(engine.attacks(ogerpon(3))[0].status, "supported");
  assert.equal(engine.getLegalAttacks(state(player(ogerpon(2)), player(card("target", 50339)))).length, 0);
  const game = state(player(ogerpon(3)), player(card("target", 48466, [grass(4), grass(5)])));
  const [action] = engine.getLegalAttacks(game);
  assert.equal(action.attackIndex, 0);
  assert.equal(engine.calculateAttackDamage(game, action), 180); // 30 + (3 + 2) × 30
  const after = engine.applyAttack(game, action);
  assert.equal(after.players[1].active.damage, 180);
  assert.equal(after.players[0].active.attached.length, 3);
  assert.equal(engine.calculateAttackDamage(state(player(ogerpon(3)),
    player(card("target", 47069))), engine.getLegalAttacks(state(player(ogerpon(3)),
    player(card("target", 47069))))[0]), 240); // Grass weakness, 120 × 2
});

test("Talonflame search attack is supported while unrelated unknown attacks stay unavailable", () => {
  const talonflame = engine.repository.get(50400);
  assert.equal(inspectAttacks(talonflame)[0].status, "supported");
  const game = state(player(card("falcon", 50400, [card("e", 50745), card("f", 50745)])),
    player(card("target", 48466)));
  assert.equal(engine.getLegalAttacks(game).length, 1);
  assert.equal(inspectAttacks(engine.repository.get(46008))[0].status,"needs_review");
});

test("damage reduction and resistance do not drop below zero", () => {
  const grass = card("energy", 50745);
  const game = state(player(card("heracross", 50339, [grass]), [],
    [card("a", 50745), card("b", 50745)]), player(card("klinklang", 46008)));
  const [action] = engine.getLegalAttacks(game);
  assert.equal(engine.calculateAttackDamage(game, action), 0);
  const reduced = state(player(card("heracross", 50339, [grass]), [],
    [card("a", 50745), card("b", 50745)]), player(card("tangrowth", 45578)));
  assert.equal(engine.calculateAttackDamage(reduced, engine.getLegalAttacks(reduced)[0]), 0);
});

const prizes = (prefix, count) => Array.from({ length: count }, (_, i) =>
  card(`${prefix}-${i}`, 50745));

test("knockout trashes the Pokémon and attached Energy; prize choice precedes promotion", () => {
  const own = player(card("heracross", 50339, [card("grass", 50745)]), [], prizes("deck", 2));
  own.prizes = prizes("own-prize", 3);
  const foe = player(card("budew", 49956));
  foe.active.damage = 10;
  foe.bench = [card("kichikigisu", 45913)];
  foe.prizes = prizes("foe-prize", 3);
  foe.deck = prizes("foe-deck", 3);
  const game = state(own, foe);
  const after = engine.applyAttack(game, engine.getLegalAttacks(game)[0]);
  assert.equal(after.players[1].active, null);
  assert.deepEqual(after.players[1].trash.map(x => x.instanceId), ["budew"]);
  assert.equal(after.turn, 0);
  assert.deepEqual(engine.getKnockoutActions(after).map(x => x.type), ["TAKE_PRIZE", "TAKE_PRIZE", "TAKE_PRIZE"]);
  assert.equal(engine.getLegalActions(after).length, 0);
  assert.throws(() => engine.endTurn(after), /Resolve knockout/);
  assert.throws(() => engine.applyKnockoutAction(after, { type: "PROMOTE_BENCH", player: 1,
    sourceInstanceId: "kichikigisu" }), /Illegal/);
  const taken = engine.applyKnockoutAction(after, { type: "TAKE_PRIZE", player: 0, prizeIndex: 1 });
  assert.equal(taken.players[0].hand.at(-1).instanceId, "own-prize-1");
  assert.equal(taken.players[0].prizes.length, 2);
  const [promote] = engine.getKnockoutActions(taken);
  assert.equal(promote.sourceInstanceId, "kichikigisu");
  const resumed = engine.applyKnockoutAction(taken, promote);
  assert.equal(resumed.turn, 1);
  assert.equal(resumed.players[1].active.instanceId, "kichikigisu");
  assert.deepEqual(resumed.previousOpponentTurnKnockout, [false, true]);
  assert.equal(engine.getLegalActions(resumed).some(x => x.sourceInstanceId === "kichikigisu"), true);
  assert.equal(game.players[1].active.instanceId, "budew");
});

test("ordinary ex takes two prizes; Mega ex takes three, stopping when prizes run out", () => {
  const energy = () => prizes("grass", 3);
  const attacker = () => player(card("heracross", 50339, energy()));
  const ex = player(card("ex", 45913));
  ex.active.damage = 80;
  ex.bench = [card("reserve", 49956)];
  ex.prizes = prizes("their", 6);
  const own = attacker(); own.prizes = prizes("ours", 6);
  const game = state(own, ex);
  let after = engine.applyAttack(game, engine.getLegalAttacks(game).find(x => x.attackIndex === 1));
  assert.equal(after.pendingKnockout.remaining, 2);
  after = engine.applyKnockoutAction(after, engine.getKnockoutActions(after)[0]);
  assert.equal(after.pendingKnockout.remaining, 1);
  after = engine.applyKnockoutAction(after, engine.getKnockoutActions(after)[0]);
  assert.equal(after.players[0].prizes.length, 4);
  const mega = player(card("mega", 48466));
  mega.active.damage = 180;
  mega.bench = [card("reserve", 49956)];
  mega.prizes = prizes("their", 6);
  const megaOwn = attacker(); megaOwn.prizes = prizes("ours", 2);
  const megaGame = state(megaOwn, mega);
  let megaAfter = engine.applyAttack(megaGame,
    engine.getLegalAttacks(megaGame).find(x => x.attackIndex === 1));
  assert.equal(megaAfter.pendingKnockout.remaining, 2); // 3 printed, 2 left
  megaAfter = engine.applyKnockoutAction(megaAfter, engine.getKnockoutActions(megaAfter)[0]);
  megaAfter = engine.applyKnockoutAction(megaAfter, engine.getKnockoutActions(megaAfter)[0]);
  assert.equal(megaAfter.winner, 0);
  assert.equal(megaAfter.winReason, "PRIZES");
  assert.equal(megaAfter.players[0].prizes.length, 0);
  assert.equal(engine.getKnockoutActions(megaAfter).length, 0);
});

test("opponent with no Bench loses after prize selection", () => {
  const own = player(card("heracross", 50339, [card("grass", 50745)]), [], prizes("deck", 2));
  own.prizes = prizes("own", 3);
  const foe = player(card("budew", 49956));
  foe.active.damage = 10;
  foe.prizes = prizes("their", 3);
  const game = state(own, foe);
  const after = engine.applyAttack(game, engine.getLegalAttacks(game)[0]);
  const done = engine.applyKnockoutAction(after, engine.getKnockoutActions(after)[0]);
  assert.equal(done.winner, 0);
  assert.equal(done.winReason, "NO_POKEMON");
  assert.equal(engine.getLegalAttacks(done).length, 0);
});

test("self knockout awards opponent a prize but does not trigger own previous opponent turn condition", () => {
  const own = player(card("heracross", 50339, prizes("grass", 3)));
  own.active.damage = 100;
  own.bench = [card("kichikigisu", 45913)];
  own.prizes = prizes("own", 3);
  const foe = player(card("mega", 48466)); foe.prizes = prizes("their", 3);
  const game = state(own, foe);
  let after = engine.applyAttack(game, engine.getLegalAttacks(game).find(x => x.attackIndex === 1));
  assert.equal(after.pendingKnockout.owner, 0);
  assert.deepEqual(after.players[0].trash.map(x => x.instanceId),
    ["heracross", "grass-0", "grass-1", "grass-2"]);
  after = engine.applyKnockoutAction(after, engine.getKnockoutActions(after)[0]);
  after = engine.applyKnockoutAction(after, engine.getKnockoutActions(after)[0]);
  assert.equal(after.turn, 1);
  assert.deepEqual(after.previousOpponentTurnKnockout, [false, false]);
  assert.equal(after.players[0].active.instanceId, "kichikigisu");
});

test("simultaneous knockouts and missing special prize rules stop safely", () => {
  const own = player(card("heracross", 50339, prizes("grass", 3)));
  own.active.damage = 100; own.prizes = prizes("own", 3);
  const foe = player(card("budew", 49956)); foe.prizes = prizes("their", 3);
  const game = state(own, foe);
  const after = engine.applyAttack(game, engine.getLegalAttacks(game).find(x => x.attackIndex === 1));
  assert.equal(after.pendingKnockout.reason, "SIMULTANEOUS_KNOCKOUT_NEEDS_REVIEW");
  assert.equal(engine.getKnockoutActions(after).length, 0);
  const unknown = player(card("zoroark", 47069));
  unknown.active.damage = 200; unknown.prizes = prizes("their", 3);
  const safeAttacker = structuredClone(own);
  safeAttacker.active.damage = 0;
  const uncertain = state(safeAttacker, unknown);
  assert.equal(engine.getLegalAttacks(uncertain).some(x => x.attackIndex === 1), false);
  assert.throws(() => engine.prizeValue(unknown.active), /Unsupported prize rule/);
  assert.equal(uncertain.players[1].active.damage, 200);
});
