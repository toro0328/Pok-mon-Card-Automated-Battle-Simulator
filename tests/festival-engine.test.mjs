import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CardRepository } from "../src/card-db/CardRepository.js";
import { parseAbility } from "../src/card-db/parse-abilities.js";
import { MatchEngine } from "../src/engine/MatchEngine.js";

const db=JSON.parse(fs.readFileSync("tests/fixtures/ability-cards.json","utf8"));
db.cards.push(...JSON.parse(fs.readFileSync("tests/fixtures/attack-cards.json","utf8")),
  ...JSON.parse(fs.readFileSync("tests/fixtures/festival-cards.json","utf8")),
  ...JSON.parse(fs.readFileSync("tests/fixtures/trainer-cards.json","utf8")),
  ...JSON.parse(fs.readFileSync("tests/fixtures/rayquaza-cards.json","utf8")),
  JSON.parse(fs.readFileSync("tests/fixtures/grow-grass-energy.json","utf8")));
const catalog={cardCount:db.cards.length,sourceUpdatedAt:db.updatedAt,abilities:{}};
for(const c of db.cards)if(c.raw.abilities?.length)catalog.abilities[c.officialCardId]=
  c.raw.abilities.map((entry,index)=>({index,name:entry.name,text:entry.effect,...parseAbility(entry.name,entry.effect)}));
const engine=new MatchEngine(new CardRepository(db),catalog);
const card=(instanceId,cardId,attached=[])=>({instanceId,cardId,attached});
const pile=(label,count)=>Array.from({length:count},(_,i)=>card(`${label}${i}`,50745));
const player=(active,bench=[],hand=[],deck=pile("deck",8))=>
  ({active,bench,hand,deck,prizes:pile("prize",6),trash:[]});
const game=(own,foe)=>({ruleset:"supported_abilities_v1",stadium:null,stadiumOwner:null,
  phase:"playing",turn:0,turnNo:3,turnsTaken:[1,1],energyAttachedThisTurn:false,
  retreatedThisTurn:false,players:[own,foe],usedAbilities:{instances:[],names:[]},
  knockoutThisTurn:[false,false],previousOpponentTurnKnockout:[false,false],randomState:42});
const find=(state,type)=>engine.getMatchActions(state).find(action=>action.type===type);

test("Rayquaza benches from hand, attaches a Basic Energy from top four and preserves lower deck",()=>{
  const own=player(card("latias",46248),[],[card("ray",50396)],
    [card("fire",47904),card("lillie",49445),card("electric",47906),card("small",45624),card("bottom",50745)]);
  let state=game(own,player(card("mega",48466)));
  const bench=engine.getMatchActions(state).find(x=>x.type==="BENCH_BASIC"&&x.sourceInstanceId==="ray");
  state=engine.applyMatchAction(state,bench);
  assert.equal(state.pendingAbility.name,"はしゃのほうこう");
  assert.deepEqual(engine.getMatchActions(state).filter(x=>x.type==="ABILITY_SELECT").map(x=>x.choiceInstanceId),["fire","electric"]);
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.choiceInstanceId==="electric"));
  assert.equal(state.players[0].bench[0].attached[0].instanceId,"electric");
  assert.equal(state.players[0].deck[0].instanceId,"bottom");
  assert.equal(state.pendingAbility,undefined);
});

test("Rayquaza attack counts Fire and Electric Energy anywhere on own field and records exact damage",()=>{
  const own=player(card("ray",50396,[card("fire",47904),card("electric",47906),card("extra",47904)]),
    [card("latias",46248,[card("benchfire",47904)])]);
  let state=game(own,player(card("mega",48466)));
  assert.equal(engine.attacks(own.active)[0].status,"supported");
  assert.equal(engine.calculateAttackDamage(state,find(state,"ATTACK")),200);
  state=engine.applyMatchAction(state,find(state,"ATTACK"));
  assert.equal(state.lastAttack.damage,200);
  assert.equal(state.lastAttack.hp,300);
  assert.equal(state.players[1].active.damage,200);
});

test("Meowth searches a Supporter on bench entry once per turn; Akamatsu attaches a distinct second energy",()=>{
  const own=player(card("latias",46248),[],[card("meowth",49694),card("ak",49412)],
    [card("lillie",49445),card("fire",47904),card("electric",47906)]);
  let state=game(own,player(card("mega",48466)));
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="BENCH_BASIC"&&x.sourceInstanceId==="meowth"));
  assert.equal(state.pendingAbility.name,"おくのてキャッチ");
  state=engine.applyMatchAction(state,find(state,"ABILITY_SELECT"));
  assert.equal(state.players[0].hand.some(x=>x.instanceId==="lillie"),true);
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="PLAY_TRAINER"&&x.sourceInstanceId==="ak"));
  state=engine.applyMatchAction(state,find(state,"AKAMATSU_PICK"));
  state=engine.applyMatchAction(state,find(state,"AKAMATSU_PICK"));
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="AKAMATSU_HAND"&&x.choiceInstanceId==="fire"));
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="AKAMATSU_ATTACH"&&x.targetInstanceId==="latias"));
  assert.equal(state.players[0].active.attached[0].instanceId,"electric");
  assert.equal(state.players[0].hand.some(x=>x.instanceId==="fire"),true);
});

test("Ho-Oh attaches up to two Fire Energy to benched Hibiki Pokémon and heals 50 with its attack",()=>{
  const own=player(card("hooh",47315,[card("a",47904),card("b",47904),card("c",47904),card("d",47904)]),
    [card("benchhooh",47315)],[card("first",47904),card("second",47904)]);
  let state=game(own,player(card("mega",48466)));
  state.players[0].active.damage=70;
  state=engine.applyMatchAction(state,find(state,"USE_HOOH"));
  state=engine.applyMatchAction(state,find(state,"ABILITY_SELECT"));
  state=engine.applyMatchAction(state,find(state,"ABILITY_SELECT"));
  assert.equal(state.players[0].bench[0].attached.length,2);
  assert.equal(engine.getMatchActions(state).some(x=>x.type==="USE_HOOH"&&x.sourceInstanceId==="hooh"),false);
  state=engine.applyMatchAction(state,find(state,"ATTACK"));
  assert.equal(state.lastAttack.damage,160);
  assert.equal(state.players[0].active.damage,20);
});

test("Energy Switch moves a Basic Energy and Red Card respects prize threshold",()=>{
  const own=player(card("latias",46248,[card("fire",47904)]),
    [card("ray",50396)],[card("shift",42714),card("red",50156)]);
  let state=game(own,player(card("mega",48466),[],[card("held",50745)],pile("opdeck",4)));
  let shift=engine.getMatchActions(state).find(x=>x.type==="PLAY_TRAINER"&&x.sourceInstanceId==="shift");
  state=engine.applyMatchAction(state,shift);
  assert.equal(state.players[0].bench[0].attached[0].instanceId,"fire");
  assert.equal(state.players[0].active.attached.length,0);
  assert.equal(engine.getMatchActions(state).some(x=>x.sourceInstanceId==="red"),false);
  state.players[1].prizes.splice(0,3);
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.sourceInstanceId==="red"));
  assert.equal(state.players[1].hand.length,3);
});

test("Hyper Ball pays two distinct hand cards, searches a Pokémon and shuffles reproducibly",()=>{
  const own=player(card("dip",45703),[],[card("ball",49600),card("one",50745),card("two",50745)],
    [card("mon",45699),card("energy",50745)]);
  let state=game(own,player(card("mega",48466)));
  state=engine.applyMatchAction(state,find(state,"PLAY_TRAINER"));
  assert.deepEqual(engine.getMatchActions(state).map(x=>x.type),["TRAINER_DISCARD","TRAINER_DISCARD"]);
  state=engine.applyMatchAction(state,find(state,"TRAINER_DISCARD"));
  assert.equal(engine.getMatchActions(state).filter(x=>x.type==="TRAINER_DISCARD").length,1);
  state=engine.applyMatchAction(state,find(state,"TRAINER_DISCARD"));
  state=engine.applyMatchAction(state,find(state,"TRAINER_SELECT"));
  state=engine.applyMatchAction(state,find(state,"TRAINER_FINISH"));
  assert.equal(state.players[0].hand[0].instanceId,"mon");
  assert.equal(state.players[0].trash.length,3);
  assert.equal(state.pendingTrainer,undefined);
});

test("Poffin puts eligible Basics on Bench and Budew blocks items",()=>{
  const own=player(card("dip",45703),[],[card("poffin",45209)],
    [card("small",45624),card("big",48466),card("second",45699)]);
  let state=game(own,player(card("mega",48466)));
  state=engine.applyMatchAction(state,find(state,"PLAY_TRAINER"));
  assert.deepEqual(engine.getMatchActions(state).filter(x=>x.type==="TRAINER_SELECT")
    .map(x=>x.choiceInstanceId),["small","second"]);
  state=engine.applyMatchAction(state,find(state,"TRAINER_SELECT"));
  assert.equal(state.players[0].bench.length,1);
  assert.equal(state.players[0].bench[0].enteredTurn,3);
  state=engine.applyMatchAction(state,find(state,"TRAINER_FINISH"));
  assert.equal(state.players[0].deck.length,2);
  const locked=game(own,player(card("mega",48466)));
  locked.itemLocks=[true,false];
  assert.equal(engine.getMatchActions(locked).some(x=>x.type==="PLAY_TRAINER"),false);
});

test("Lillie shuffles remaining hand and draws eight with six prizes, only once per turn",()=>{
  const own=player(card("dip",45703),[],[card("lillie",49445),card("extra",50745)],pile("draw",10));
  let state=game(own,player(card("mega",48466)));
  state=engine.applyMatchAction(state,find(state,"PLAY_TRAINER"));
  assert.equal(state.players[0].hand.length,8);
  assert.equal(state.players[0].trash[0].instanceId,"lillie");
  assert.equal(state.supporterUsedThisTurn,true);
  own.hand=[card("lillie",49445)];state=game(own,player(card("mega",48466)));
  state.turnNo=1;
  assert.equal(engine.getMatchActions(state).some(x=>x.type==="PLAY_TRAINER"),false);
});

test("festival abilities compile as reusable primitives while unknown text still needs review",()=>{
  for(const id of [45703,45700,45717,46690,46675,47301])
    assert.ok(catalog.abilities[id].every(x=>x.status==="supported"));
  assert.equal(parseAbility("未知","未知の特性。").status,"needs_review");
  assert.equal(engine.attacks(card("dip",45703))[0].status,"supported");
  assert.equal(engine.attacks(card("goldeen",45717))[0].status,"needs_review");
});

test("festival Pokémon evolves from the printed Basic only after its placement turn",()=>{
  const own=player(card("applin",45624),[],[card("dip",45703)]);
  own.active.enteredTurn=1;
  let current=game(own,player(card("mega",48466)));
  const evolve=find(current,"EVOLVE");
  assert.equal(evolve.targetInstanceId,"applin");
  current=engine.applyMatchAction(current,evolve);
  assert.equal(current.players[0].active.cardId,45703);
  assert.equal(current.players[0].active.stack[0].cardId,45624);
  own.active.enteredTurn=3;
  assert.equal(find(game(own,player(card("mega",48466))),"EVOLVE"),undefined);
});

test("Thwackey searches any one deck card only with Festival ability active, then shuffles reproducibly",()=>{
  const own=player(card("dip",45703,[card("grass",50745)]),[card("thwackey",45700)],[],
    [card("first",45699),card("wanted",45790),card("last",50745)]);
  const initial=game(own,player(card("mega",48466)));
  const choices=engine.getMatchActions(initial).filter(x=>x.type==="USE_ABILITY");
  assert.deepEqual(choices.map(x=>x.choiceInstanceId),["first","wanted","last"]);
  const chosen=choices.find(x=>x.choiceInstanceId==="wanted");
  const after=engine.applyMatchAction(initial,chosen);
  assert.equal(after.players[0].hand[0].instanceId,"wanted");
  assert.equal(after.players[0].deck.length,2);
  assert.equal(engine.getMatchActions(after).some(x=>x.type==="USE_ABILITY"),false);
  assert.deepEqual(after,engine.applyMatchAction(initial,chosen));
  own.active=card("applin",45624);
  assert.equal(engine.getMatchActions(game(own,player(card("mega",48466))))
    .some(x=>x.type==="USE_ABILITY"),false);
});

test("Festival Grounds enables two same attacks, each using own current Bench size",()=>{
  const own=player(card("dip",45703,[card("grass",50745)]),
    [card("thwackey",45700),card("applin",46669)],[card("stadium",45790)]);
  let current=game(own,player(card("mega",48466)));
  assert.equal(find(current,"ATTACK").attackIndex,0);
  current=engine.applyMatchAction(current,find(current,"PLAY_STADIUM"));
  assert.equal(current.stadium.cardId,45790);
  current=engine.applyMatchAction(current,find(current,"ATTACK"));
  assert.equal(current.players[1].active.damage,40);
  assert.ok(current.pendingSecondAttack);
  assert.deepEqual(engine.getMatchActions(current).map(x=>x.type),["ATTACK"]);
  current=engine.applyMatchAction(current,find(current,"ATTACK"));
  assert.equal(current.players[1].active.damage,80);
  assert.equal(current.pendingSecondAttack,undefined);
  assert.equal(current.turn,1);
});

test("when the first festival attack knocks out, second attack waits for prize and promotion",()=>{
  const own=player(card("dip",45703,[card("grass",50745)]),
    [card("thwackey",45700),card("applin",46669)],[card("stadium",45790)]);
  const foe=player(card("budew",49956),[card("mega",48466)]);
  let current=game(own,foe);
  current=engine.applyMatchAction(current,find(current,"PLAY_STADIUM"));
  current=engine.applyMatchAction(current,find(current,"ATTACK"));
  assert.equal(current.pendingKnockout.remaining,1);
  current=engine.applyMatchAction(current,find(current,"TAKE_PRIZE"));
  current=engine.applyMatchAction(current,find(current,"PROMOTE_BENCH"));
  assert.equal(current.turn,0);
  assert.equal(current.players[1].active.cardId,48466);
  assert.deepEqual(engine.getMatchActions(current).map(x=>x.type),["ATTACK"]);
  current=engine.applyMatchAction(current,find(current,"ATTACK"));
  assert.equal(current.players[1].active.damage,40);
  assert.equal(current.turn,1);
});

test("bench protection from Rabsca and Shaymin respects rule box",()=>{
  const own=player(card("applin",46669),[card("rabsca",46675),card("mega",48466)]);
  let state=game(own,player(card("dip",45703)));
  assert.equal(engine.incomingAttackDamage(state,"mega",70),0);
  own.bench=[card("shaymin",47301),card("mega",48466),card("applin2",46669)];
  state=game(own,player(card("dip",45703)));
  assert.equal(engine.incomingAttackDamage(state,"applin2",70),0);
  assert.equal(engine.incomingAttackDamage(state,"mega",70),70);
});

test("Grow Grass Energy pays Grass cost and raises a Grass Pokémon's maximum HP by 20",()=>{
  const own=player(card("dip",45703),[],[card("grow",49711)]);
  let current=game(own,player(card("mega",48466)));
  const attach=engine.getMatchActions(current).find(x=>x.type==="ATTACH_ENERGY");
  assert.equal(attach.sourceInstanceId,"grow");
  current=engine.applyMatchAction(current,attach);
  assert.equal(engine.effectiveHP(current.players[0].active),100);
  assert.equal(engine.energyPaysCost(current.players[0].active,["Grass"]),true);
  current.players[0].active.damage=90;
  assert.equal(current.players[0].active.damage<engine.effectiveHP(current.players[0].active),true);
  assert.equal(engine.effectiveHP(card("mega",48466,[card("grow2",49711)])),300);
});
