import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CardRepository } from "../src/card-db/CardRepository.js";
import { MatchEngine } from "../src/engine/MatchEngine.js";

const db = JSON.parse(fs.readFileSync("tests/fixtures/ability-cards.json", "utf8"));
db.cards.push(...JSON.parse(fs.readFileSync("tests/fixtures/attack-cards.json", "utf8")));
const loadCards=JSON.parse(fs.readFileSync("tests/fixtures/deck-effect-coverage.json","utf8"));
db.cards.push(...loadCards.filter(item=>!db.cards.some(card=>card.officialCardId===item.officialCardId)));
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
const opponentDeck = JSON.parse(fs.readFileSync("data/decks/opponent-festival.json", "utf8"));

test("official festival deck retains its exact 60-card counts, including evolution and special Energy", () => {
  const byId = new Map(opponentDeck.cards.map(x=>[x.officialCardId,x.count]));
  assert.equal(opponentDeck.deckCode,"nnNNLn-xCvlKh-69gNPQ");
  assert.equal(opponentDeck.cards.reduce((sum,x)=>sum+x.count,0),60);
  assert.equal(byId.get(45703),4); // Dipplin
  assert.equal(byId.get(45790),4); // Festival Grounds
  assert.equal(byId.get(49711),3); // Grow Grass Energy
  assert.equal(byId.get(42779),3); // printed Basic Grass Energy
  assert.equal(new Set(opponentDeck.cards.map(x=>x.officialCardId)).size,opponentDeck.cards.length);
});

test("opening hand always includes a Basic with an executable ability state", () => {
  const restrictive=[...Array(4).fill(45233),...Array(56).fill(50745)];
  const blockedDb=structuredClone(db),blockedCard=blockedDb.cards.find(x=>x.officialCardId===45233);
  blockedCard.raw.abilities[0].effect="未知の特性効果。";
  const blockedCatalog=structuredClone(catalog);blockedCatalog.cardCount=blockedDb.cards.length;
  const blockedEngine=new MatchEngine(new CardRepository(blockedDb),blockedCatalog);
  assert.throws(()=>blockedEngine.createMatch([sample,restrictive],9),/supported Basic/);
  const usable=[49956,...Array(4).fill(45233),...Array(55).fill(50745)];
  const game=blockedEngine.createMatch([sample,usable],9);
  assert.ok(game.players[1].hand.some(x=>x.cardId===49956));
  assert.ok(blockedEngine.getMatchActions(game).some(x=>x.player===1&&x.type==="SET_ACTIVE"));
});

test("deck-rule gate allows a legal 60-card pair and rejects multiple ACE SPEC cards", () => {
  assert.deepEqual(engine.deckRuleChecks([{cards:sample.map(officialCardId=>({officialCardId,count:1}))},
    {cards:sample.map(officialCardId=>({officialCardId,count:1}))}]),[]);
  const illegal=[...sample.slice(0,58),45783,45783];
  const issues=engine.deckRuleChecks([{cards:sample.map(officialCardId=>({officialCardId,count:1}))},
    {cards:illegal.map(officialCardId=>({officialCardId,count:1}))}]);
  assert.ok(issues.some(issue=>issue.side===1&&issue.rule==="ace_spec_limit"));
  assert.throws(()=>engine.createMatch([sample,illegal],23),/ACE SPECは1デッキ1枚まで/);
});

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

test("Mushitori Set searches only the top seven for up to two Grass Pokémon or Basic Grass Energy",()=>{
  const own=player(card("active",49956),[card("mushi",45785)],
    [card("grass-pokemon",50339),...Array.from({length:5},(_,i)=>card(`other-${i}`,50742)),
      card("grass-energy",50745),
      card("grass-energy-2",50745)]);
  const other=player(card("target",50339));let game=state(own,other,2);
  const play=engine.getMatchActions(game).find(x=>x.type==="PLAY_TRAINER"&&x.sourceInstanceId==="mushi");
  assert.ok(play);game=engine.applyMatchAction(game,play);
  assert.deepEqual(game.pendingTrainer.lookedInstanceIds,game.players[0].deck.slice(0,7).map(x=>x.instanceId));
  const first=engine.getMatchActions(game);
  assert.equal(first.some(x=>x.type==="TRAINER_SELECT"&&x.choiceInstanceId==="grass-pokemon"),true);
  assert.equal(first.some(x=>x.type==="TRAINER_SELECT"&&x.choiceInstanceId==="grass-energy-2"),false);
  game=engine.applyMatchAction(game,first.find(x=>x.type==="TRAINER_SELECT"&&x.choiceInstanceId==="grass-pokemon"));
  assert.equal(engine.getMatchActions(game).some(x=>x.type==="TRAINER_SELECT"&&x.choiceInstanceId==="other-0"),false);
  const grassEnergy=game.pendingTrainer.lookedInstanceIds.map(id=>game.players[0].deck.find(x=>x.instanceId===id))
    .find(x=>x&&engine.card(x).energyType==="basic");
  assert.ok(grassEnergy);
  game=engine.applyMatchAction(game,engine.getMatchActions(game).find(x=>x.type==="TRAINER_SELECT"&&
    x.choiceInstanceId===grassEnergy.instanceId));
  assert.equal(game.pendingTrainer,undefined);
  assert.ok(game.players[0].hand.some(x=>x.instanceId==="grass-pokemon"));
  assert.ok(game.players[0].hand.some(x=>x.instanceId===grassEnergy.instanceId));
  assert.equal(game.players[0].deck.length,6);
});

test("Secret Box pays three cards and fetches one card from each printed Trainer category",()=>{
  const own=player(card("active",49956),[card("box",45783),card("cost1",50745),card("cost2",50339),card("cost3",49956)],
    [card("item",50742),card("tool",45932),card("supporter",50604),card("stadium",45790)]);
  let game=state(own,player(card("target",50339)),2);
  game=engine.applyMatchAction(game,engine.getMatchActions(game).find(x=>x.type==="PLAY_TRAINER"&&x.sourceInstanceId==="box"));
  for(const id of ["cost1","cost2","cost3"]){
    const discard=engine.getMatchActions(game).find(x=>x.type==="TRAINER_DISCARD"&&x.choiceInstanceId===id);
    assert.ok(discard);game=engine.applyMatchAction(game,discard);
  }
  const selected=[];
  for(const type of ["item","tool","supporter","stadium"]){
    const action=engine.getMatchActions(game).find(x=>x.type==="TRAINER_SELECT"&&engine.card(
      game.players[0].deck.find(y=>y.instanceId===x.choiceInstanceId)).trainerType===type);
    assert.ok(action,`missing ${type} selection`);selected.push(action.choiceInstanceId);
    game=engine.applyMatchAction(game,action);
  }
  assert.equal(game.pendingTrainer,undefined);
  assert.deepEqual(new Set(selected),new Set(["item","tool","supporter","stadium"]));
  assert.deepEqual(new Set(game.players[0].hand.map(x=>x.instanceId)),new Set(selected));
  assert.equal(game.players[0].trash.length,4);
  assert.equal(game.players[0].deck.length,0);
});

test("the newer Judge text variant is recognized and resolves both hands",()=>{
  let game=state(player(card("active",49956),[card("judge",50604),card("old-hand",50339)],
    Array.from({length:6},(_,i)=>card(`own-${i}`,50745))),
    player(card("target",50339),[card("opponent-hand",49956)],
      Array.from({length:6},(_,i)=>card(`opp-${i}`,50745))),2);
  const play=engine.getMatchActions(game).find(x=>x.type==="PLAY_TRAINER"&&x.sourceInstanceId==="judge");
  assert.ok(play);
  game=engine.applyMatchAction(game,play);
  assert.equal(game.players[0].hand.length,4);
  assert.equal(game.players[1].hand.length,4);
  assert.ok(game.players[0].trash.some(x=>x.instanceId==="judge"));
});

test("Zero's Great Hole permits eight with Tera and orders bench cleanup by Stadium owner",()=>{
  const own=player(card("tera-own",45856),[card("replacement",45790),card("extra1",49956),card("extra2",49956)],[],Array.from({length:6},(_,i)=>card(`own-b${i}`,49956)));
  const other=player(card("tera-opponent",45856),[],[],Array.from({length:6},(_,i)=>card(`opp-b${i}`,49956)));
  let game=state(own,other,2);
  game.stadium=card("zero",46041);game.stadiumOwner=1;
  assert.equal(engine.isSupportedStadium(game.stadium),true);
  assert.equal(engine.benchLimit(game,0),8);
  assert.equal(engine.benchLimit(game,1),8);
  for(const id of ["extra1","extra2"]){
    const bench=engine.getMatchActions(game).find(x=>x.type==="BENCH_BASIC"&&x.sourceInstanceId===id);
    assert.ok(bench);game=engine.applyMatchAction(game,bench);
  }
  assert.equal(game.players[0].bench.length,8);
  assert.equal(engine.getMatchActions(game).some(x=>x.type==="BENCH_BASIC"),false);
  const play=engine.getMatchActions(game).find(x=>x.type==="PLAY_STADIUM"&&x.sourceInstanceId==="replacement");
  assert.ok(play);
  game=engine.applyMatchAction(game,play);
  assert.equal(engine.getMatchActions(game)[0].player,1);
  while(game.pendingBenchCleanup){
    const action=engine.getMatchActions(game)[0];
    game=engine.applyMatchAction(game,action);
  }
  assert.equal(game.players[0].bench.length,5);
  assert.equal(game.players[1].bench.length,5);
  assert.equal(game.players[1].trash.length,2); // replaced Stadium plus one excess Pokémon
  assert.equal(game.players[0].trash.length,3);
});

test("losing the last Tera Pokémon triggers Zero's Great Hole bench cleanup after prize selection",()=>{
  const own=player(card("tera",45856),[],[],Array.from({length:6},(_,i)=>card(`bench-${i}`,49956)));
  const other=player(card("target",50339),[],Array.from({length:2},(_,i)=>card(`prize-deck-${i}`,50745)));
  let game=state(own,other,2);game.stadium=card("zero",46041);game.stadiumOwner=1;
  game=engine.beginKnockout(game,[0]);
  assert.equal(game.pendingBenchCleanup.players[0],0);
  let actions=engine.getMatchActions(game);
  assert.ok(actions.every(x=>x.type==="TAKE_PRIZE"));
  while(game.pendingKnockout?.remaining>0){
    actions=engine.getMatchActions(game);
    game=engine.applyMatchAction(game,actions[0]);
  }
  actions=engine.getMatchActions(game);
  assert.ok(actions.every(x=>x.type==="DISCARD_EXCESS_BENCH"));
  while(game.pendingBenchCleanup){game=engine.applyMatchAction(game,engine.getMatchActions(game)[0]);}
  assert.equal(game.players[0].bench.length,5);
  assert.equal(game.players[0].trash.filter(x=>x.cardId===49956).length,1);
});
