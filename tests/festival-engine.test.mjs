import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CardRepository } from "../src/card-db/CardRepository.js";
import { parseAbility } from "../src/card-db/parse-abilities.js";
import { MatchEngine } from "../src/engine/MatchEngine.js";

const db=JSON.parse(fs.readFileSync("tests/fixtures/ability-cards.json","utf8"));
db.cards.push(...JSON.parse(fs.readFileSync("tests/fixtures/attack-cards.json","utf8")),
  ...JSON.parse(fs.readFileSync("tests/fixtures/festival-cards.json","utf8")),
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
