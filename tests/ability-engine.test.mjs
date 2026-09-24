import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CardRepository } from "../src/card-db/CardRepository.js";
import { AbilityEngine } from "../src/engine/AbilityEngine.js";

const db = JSON.parse(fs.readFileSync("tests/fixtures/ability-cards.json", "utf8"));
const catalog = JSON.parse(fs.readFileSync("tests/fixtures/ability-effects.json", "utf8"));
const engine = new AbilityEngine(new CardRepository(db), catalog);
const instance = (instanceId, cardId) => ({ instanceId, cardId, attached: [] });
const player = ({ hand = [], deck = [], active = null, bench = [] } = {}) =>
  ({ hand, deck, active, bench, trash: [] });
const state = (own, opponent = player()) => ({
  ruleset: "supported_abilities_v1", stadium: null, turn: 0,
  players: [own, opponent], usedAbilities: { instances: [], names: [] }
});

test("Talonflame can bench directly from hand only with own Colorless Mega ex", () => {
  const falcon = instance("falcon", 50400);
  const mega = instance("mega", 48466);
  const game = state(player({ hand: [falcon], active: mega }));
  const actions = engine.getLegalActions(game);
  assert.equal(actions.length, 1); // Kangaskhan cannot draw from an empty demo deck
  const fly = actions.find(x => x.sourceInstanceId === "falcon");
  const result = engine.applyAction(game, fly);
  assert.equal(result.players[0].bench[0].cardId, 50400);
  assert.equal(result.players[0].hand.length, 0);
  assert.equal(game.players[0].hand.length, 1);
  assert.equal(engine.getLegalActions(result).some(x => x.sourceInstanceId === "falcon"), false);
  assert.equal(engine.getLegalActions(state(player({ hand: [falcon] }),
    player({ active: mega }))).length, 0);
  assert.equal(engine.getLegalActions(state(player({ hand: [falcon], active: mega,
    bench: Array.from({length: 5}, (_, i) => instance("b"+i, 47309)) })))
    .some(x => x.sourceInstanceId === "falcon"), false);
});

test("active Mega Kangaskhan draws two and locks same named ability this turn", () => {
  const game = state(player({ active: instance("mega", 48466),
    bench: [instance("other-mega", 47847)],
    deck: [instance("a", 50745), instance("b", 50745)] }));
  const action = engine.getLegalActions(game).find(x => x.sourceInstanceId === "mega");
  const after = engine.applyAction(game, action);
  assert.deepEqual(after.players[0].hand.map(x => x.instanceId), ["a", "b"]);
  assert.equal(engine.getLegalActions(after).some(x => x.sourceInstanceId === "other-mega"), false);
  assert.throws(() => engine.applyAction(after, action), /Illegal/);
});

test("Zoroark discards selected hand card, then draws two", () => {
  const game = state(player({ active: instance("z", 47069),
    hand: [instance("cost", 50745)], deck: [instance("a", 50745), instance("b", 50745)] }));
  const [action] = engine.getLegalActions(game);
  assert.equal(action.choiceInstanceId, "cost");
  const after = engine.applyAction(game, action);
  assert.deepEqual(after.players[0].trash.map(x => x.instanceId), ["cost"]);
  assert.deepEqual(after.players[0].hand.map(x => x.instanceId), ["a", "b"]);
  assert.equal(engine.getLegalActions(after).length, 0);
});

test("Ogerpon attaches a selected basic Grass Energy and draws", () => {
  const game = state(player({ active: instance("og", 45707),
    hand: [instance("grass", 50745)], deck: [instance("a", 50745)] }));
  const [action] = engine.getLegalActions(game);
  const after = engine.applyAction(game, action);
  assert.equal(after.players[0].active.attached[0].instanceId, "grass");
  assert.equal(after.players[0].hand[0].instanceId, "a");
  assert.equal(engine.getLegalActions(state(player({active: instance("og", 45707),
    hand: [instance("wrong", 47309)], deck: [instance("a", 50745)]}))).length, 0);
});

test("second stage opposing Pokémon enables Klinklang hand ability", () => {
  const game = state(player({ hand: [instance("g", 46008)] }),
    player({ active: instance("opponent", 50400) }));
  const [action] = engine.getLegalActions(game);
  assert.equal(engine.applyAction(game, action).players[0].bench[0].cardId, 46008);
});

test("passive reduction affects attack damage only; unknown field ability stops sandbox", () => {
  const game = state(player({ active: instance("tank", 45578) }));
  assert.equal(engine.incomingAttackDamage(game, "tank", 20), 0);
  assert.equal(engine.incomingAttackDamage(game, "tank", 100), 70);
  assert.throws(() => engine.getLegalActions(state(player({ active: instance("unknown", 45233) }))),
    /Unsupported ability/);
});
