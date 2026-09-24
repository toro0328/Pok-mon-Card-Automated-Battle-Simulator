import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CardRepository } from "../src/card-db/CardRepository.js";
import { MatchEngine } from "../src/engine/MatchEngine.js";

const db = JSON.parse(fs.readFileSync("tests/fixtures/ability-cards.json", "utf8"));
db.cards.push(...JSON.parse(fs.readFileSync("tests/fixtures/attack-cards.json", "utf8")));
const catalog = JSON.parse(fs.readFileSync("tests/fixtures/ability-effects.json", "utf8"));
catalog.cardCount = db.cards.length;
const engine = new MatchEngine(new CardRepository(db), catalog);
const card = (instanceId, cardId, attached = []) => ({ instanceId, cardId, attached });
const prizes = (prefix, n) => Array.from({length:n}, (_,i)=>card(`${prefix}-${i}`,50745));
const player = (active, hand=[], deck=[], bench=[]) =>
  ({ active, hand, deck, bench, prizes:prizes("side",6), trash:[] });
const state = (own, other, turnNo=1) => ({ruleset:"supported_abilities_v1",stadium:null,
  phase:"playing",turn:0,turnNo,turnsTaken:turnNo===1?[0,0]:[1,1],
  energyAttachedThisTurn:false,retreatedThisTurn:false,
  players:[own,other],usedAbilities:{instances:[],names:[]},
  knockoutThisTurn:[false,false],previousOpponentTurnKnockout:[false,false]});
const sample = [...[49956,50339,45913,45707,48466,46248].flatMap(id=>Array(4).fill(id)),
  ...Array(36).fill(50745)];

test("seeded 60-card setup deals 7 and 6, requires both Basics, then draws the first turn", () => {
  const first = engine.createMatch([sample,sample],17);
  assert.deepEqual(first,engine.createMatch([sample,sample],17));
  assert.equal(first.players[0].hand.length,7);
  assert.equal(first.players[0].prizes.length,6);
  assert.equal(first.players[0].deck.length,47);
  assert.equal(first.phase,"setup");
  assert.equal(engine.getMatchActions(first).some(x=>x.type==="ATTACK"),false);
  const ownActive=engine.getMatchActions(first).find(x=>x.type==="SET_ACTIVE"&&x.player===0);
  let current=engine.applyMatchAction(first,ownActive);
  const otherActive=engine.getMatchActions(current).find(x=>x.type==="SET_ACTIVE"&&x.player===1);
  current=engine.applyMatchAction(current,otherActive);
  for(let i=0;i<2;i++) current=engine.applyMatchAction(current,
    engine.getMatchActions(current).find(x=>x.type==="READY_SETUP"&&x.player===i));
  assert.equal(current.phase,"playing");
  assert.equal(current.turnNo,1);
  assert.equal(current.players[0].hand.length,7); // 7 - active + turn draw
  assert.equal(current.players[0].deck.length,46);
  assert.equal(engine.getMatchActions(current).some(x=>x.type==="ATTACK"),false);
  assert.equal(first.players[0].active,null);
  assert.throws(()=>engine.createMatch([sample.slice(1),sample],1),/60 cards/);
});

test("Basic placement, one manual Energy, attack and automatic turn draw", () => {
  const own=player(card("budew",49956),[card("grass",50745),card("bench",50339)],prizes("own-deck",4));
  const other=player(card("target",50339),[],prizes("other-deck",4));
  let game=state(own,other);
  const bench=engine.getMatchActions(game).find(x=>x.type==="BENCH_BASIC");
  game=engine.applyMatchAction(game,bench);
  assert.equal(game.players[0].bench[0].instanceId,"bench");
  const energy=engine.getMatchActions(game).find(x=>x.type==="ATTACH_ENERGY"&&x.targetInstanceId==="bench");
  game=engine.applyMatchAction(game,energy);
  assert.equal(game.players[0].bench[0].attached[0].instanceId,"grass");
  assert.equal(engine.getMatchActions(game).some(x=>x.type==="ATTACH_ENERGY"),false);
  assert.equal(engine.getMatchActions(game).some(x=>x.type==="ATTACK"),false);
  game=engine.applyMatchAction(game,engine.getMatchActions(game).find(x=>x.type==="END_TURN"));
  assert.equal(game.turn,1);
  assert.equal(game.turnNo,2);
  assert.equal(game.players[1].hand.length,1);
  assert.equal(game.players[1].deck.length,3);
  assert.equal(engine.getMatchActions(game).some(x=>x.type==="ATTACK"),false); // no Energy
  assert.equal(own.hand.length,2);
});

test("retreat pays from attached Energy once, then a valid attack ends the turn", () => {
  const own=player(card("heracross",50339,
    [card("e1",50745),card("e2",50745),card("e3",50745)]),[],prizes("own-deck",4),
    [card("budew",49956)]);
  const other=player(card("target",50339),[],prizes("other-deck",4));
  let game=state(own,other,3);
  const retreat=engine.getMatchActions(game).find(x=>x.type==="RETREAT"&&
    x.targetInstanceId==="budew"&&x.paymentInstanceIds.join(",")==="e1,e2,e3");
  assert.ok(retreat);
  game=engine.applyMatchAction(game,retreat);
  assert.equal(game.players[0].active.instanceId,"budew");
  assert.equal(game.players[0].bench[0].attached.length,0);
  assert.deepEqual(game.players[0].trash.map(x=>x.instanceId),["e1","e2","e3"]);
  assert.equal(engine.getMatchActions(game).some(x=>x.type==="RETREAT"),false);
  game=engine.applyMatchAction(game,engine.getMatchActions(game).find(x=>x.type==="ATTACK"));
  assert.equal(game.turn,1);
  assert.equal(game.players[1].active.damage,10);
  assert.equal(game.energyAttachedThisTurn,false);
  assert.equal(game.retreatedThisTurn,false);
});

test("Latias aura allows zero-cost retreat with no Energy", () => {
  const own=player(card("mega",48466),[],prizes("own-deck",4),[card("latias",46248)]);
  const other=player(card("budew",49956),[],prizes("other-deck",4));
  const game=state(own,other,3);
  const retreat=engine.getMatchActions(game).find(x=>x.type==="RETREAT");
  assert.deepEqual(retreat.paymentInstanceIds,[]);
  const next=engine.applyMatchAction(game,retreat);
  assert.equal(next.players[0].active.instanceId,"latias");
  assert.equal(next.players[0].bench[0].instanceId,"mega");
});

test("knockout resolves prizes and replacement in the same match action list", () => {
  const own=player(card("heracross",50339,[card("grass",50745)]),[],prizes("own-deck",4));
  const other=player(card("budew",49956),[],prizes("other-deck",4),[card("kichikigisu",45913)]);
  other.active.damage=10;
  let game=state(own,other,3);
  game=engine.applyMatchAction(game,engine.getMatchActions(game).find(x=>x.type==="ATTACK"));
  assert.equal(engine.getMatchActions(game)[0].type,"TAKE_PRIZE");
  game=engine.applyMatchAction(game,engine.getMatchActions(game)[0]);
  assert.equal(engine.getMatchActions(game)[0].type,"PROMOTE_BENCH");
  game=engine.applyMatchAction(game,engine.getMatchActions(game)[0]);
  assert.equal(game.turn,1);
  assert.equal(game.previousOpponentTurnKnockout[1],true);
  assert.equal(game.players[1].active.instanceId,"kichikigisu");
});

test("empty deck at turn start loses, not when drawing the final card", () => {
  const own=player(card("budew",49956));
  const other=player(card("budew-2",49956),[],[card("last",50745)]);
  let game=state(own,other);
  game=engine.applyMatchAction(game,engine.getMatchActions(game).find(x=>x.type==="END_TURN"));
  assert.equal(game.winner,undefined);
  assert.equal(game.players[1].deck.length,0);
  game=engine.applyMatchAction(game,engine.getMatchActions(game).find(x=>x.type==="END_TURN"));
  assert.equal(game.winner,1);
  assert.equal(game.winReason,"DECK_OUT");
  assert.deepEqual(engine.getMatchActions(game),[]);
});
