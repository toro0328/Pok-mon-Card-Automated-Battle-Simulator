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

test("unknown attack text and variable printed damage remain unavailable", () => {
  const talonflame = engine.repository.get(50400);
  assert.equal(inspectAttacks(talonflame)[0].status, "needs_review");
  const game = state(player(card("falcon", 50400, [card("e", 50745), card("f", 50745)])),
    player(card("target", 48466)));
  assert.equal(engine.getLegalAttacks(game).length, 0);
  assert.throws(() => engine.applyAttack(game, { type: "ATTACK", player: 0,
    sourceInstanceId: "falcon", attackIndex: 0 }), /Illegal/);
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
