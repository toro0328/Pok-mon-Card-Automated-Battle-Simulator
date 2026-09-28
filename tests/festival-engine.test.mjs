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
  ...JSON.parse(fs.readFileSync("tests/fixtures/meta-cards.json","utf8")),
  JSON.parse(fs.readFileSync("tests/fixtures/water-energy.json","utf8")),
  JSON.parse(fs.readFileSync("tests/fixtures/psychic-energy.json","utf8")),
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

test("every printed attack in the two loaded decks has an executable effect definition",()=>{
  for(const filename of ["data/decks/self-rayquaza.json","data/decks/opponent-festival.json"]){
    const deck=JSON.parse(fs.readFileSync(filename,"utf8"));
    for(const {officialCardId} of deck.cards){
      const card=engine.repository.get(officialCardId);
      if(!card||card.cardType!=="pokemon")continue;
      assert.ok(engine.attacks({cardId:officialCardId}).every(x=>x.status==="supported"),card.name);
    }
  }
});

test("Pokémon Check applies Poison to both Active Pokémon and clears paralysis after its owner turn",()=>{
  let state=game(player(card("own",50339)),player(card("foe",49956)));
  state.players[0].active.statuses=[{name:"どく",appliedTurnNo:state.turnNo,ownerPlayer:1}];
  state.players[1].active.statuses=[{name:"マヒ",appliedTurnNo:state.turnNo-1,ownerPlayer:0}];
  state=engine.applyMatchAction(state,find(state,"END_TURN"));
  assert.equal(state.players[0].active.damage,10);
  assert.equal(state.players[1].active.statuses.some(x=>(typeof x==="string"?x:x.name)==="マヒ"),true);
  state=engine.applyMatchAction(state,find(state,"END_TURN"));
  assert.equal(state.players[0].active.damage,20);
  assert.equal(state.players[1].active.statuses.some(x=>(typeof x==="string"?x:x.name)==="マヒ"),false);
});

test("Confusion tails cancels the attack and places 30 damage on the attacker",()=>{
  const own=player(card("heracross",50339,[card("grass",50745)]));
  const foe=player(card("defender",49956));
  own.active.statuses=[{name:"こんらん",appliedTurnNo:1,ownerPlayer:0}];
  let state=game(own,foe);
  state.randomState=Array.from({length:100},(_,i)=>i+1).find(seed=>engine.coinSequence(seed,true).heads===0);
  const attack=engine.getMatchActions(state).find(x=>x.type==="ATTACK");
  state=engine.applyMatchAction(state,attack);
  assert.equal(state.players[0].active.damage,30);
  assert.equal(state.players[1].active.damage??0,0);
  assert.equal(state.lastAttack.damage,0);
  assert.match(state.lastAttack.coin,/ウラ/);
});

test("switching recovers confusion sleep paralysis; evolution recovers all special conditions",()=>{
  const pokemon=card("status",49956);
  pokemon.statuses=[{name:"こんらん"},{name:"どく"},{name:"やけど"},{name:"ねむり"}];
  engine.clearSwitchStatuses(pokemon);
  assert.deepEqual(pokemon.statuses.map(x=>x.name),["どく","やけど"]);
  engine.clearSwitchStatuses(pokemon,true);
  assert.deepEqual(pokemon.statuses,[]);
});

test("attack discard-energy effect lets the player choose the exact count",()=>{
  const own=player(card("attacker",50339,[card("e1",50745),card("e2",50745)]));
  let state=game(own,player(card("defender",48466)));
  state.pendingAttack={type:"DISCARD_ENERGY",player:0,side:"own",count:2,sourceInstanceId:"attacker"};
  let actions=engine.getMatchActions(state);
  assert.deepEqual(actions.map(x=>x.choiceInstanceId).sort(),["e1","e2"]);
  state=engine.applyMatchAction(state,actions[0]);
  assert.equal(state.pendingAttack.count,1);
  actions=engine.getMatchActions(state);
  state=engine.applyMatchAction(state,actions[0]);
  assert.equal(state.pendingAttack,undefined);
  assert.deepEqual(state.players[0].trash.map(x=>x.instanceId).sort(),["e1","e2"]);
  assert.equal(state.turn,1);
});

test("attack deck search only benches a Basic and auto-shuffles when no eligible target remains",()=>{
  let state=game(player(card("attacker",50339),[],[],[card("basic",49956),card("energy",50745)]),
    player(card("defender",48466)));
  state.pendingAttack={type:"SEARCH_DECK",player:0,sourceInstanceId:"attacker",max:2,filter:"basicPokemon",destination:"BENCH",chosen:0};
  const actions=engine.getMatchActions(state);
  assert.deepEqual(actions.filter(x=>x.type==="ATTACK_SEARCH").map(x=>x.choiceInstanceId),["basic"]);
  state=engine.applyMatchAction(state,actions.find(x=>x.type==="ATTACK_SEARCH"));
  assert.equal(state.players[0].bench[0].instanceId,"basic");
  assert.equal(state.pendingAttack,undefined);
  assert.equal(state.turn,1);
});

test("Applin search and Talonflame search finish immediately after the maximum selections",()=>{
  let state=game(player(card("applin",45624,[card("e",50745)]),[],[],
    [card("pokemon",45699),card("extra",50745)]),player(card("mega",48466)));
  state=engine.applyMatchAction(state,find(state,"ATTACK"));
  assert.equal(state.pendingAttack.type,"SEARCH_DECK");
  state=engine.applyMatchAction(state,find(state,"ATTACK_SEARCH"));
  assert.equal(state.pendingAttack,undefined);
  assert.equal(state.players[0].hand[0].instanceId,"pokemon");
  assert.equal(state.turn,1);
  state=game(player(card("talon",50400,[card("a",50745),card("b",50745)]),[],[],
    [card("one",50745),card("two",50745),card("three",50745)]),player(card("mega",48466)));
  state=engine.applyMatchAction(state,find(state,"ATTACK"));
  assert.equal(state.players[1].active.damage,150);
  state=engine.applyMatchAction(state,find(state,"ATTACK_SEARCH"));
  assert.equal(state.turn,0);
  state=engine.applyMatchAction(state,find(state,"ATTACK_SEARCH"));
  assert.equal(state.pendingAttack,undefined);
  assert.equal(state.turn,1);
});

test("Kangaskhan coin damage is deterministic; Seaking bonus uses defending Energy",()=>{
  const own=player(card("kang",47847,[card("a",50745),card("b",50745),card("c",50745)]));
  let state=game(own,player(card("target",46027)));
  const attack=find(state,"ATTACK"),expected=engine.calculateAttackDamage(state,attack);
  state=engine.applyMatchAction(state,attack);
  assert.equal(state.lastAttack.damage,expected);
  assert.match(state.lastAttack.coin,/オモテ/);
  const seaking=player(card("beetle",46675,[card("grass",50745)]));
  const defending=player(card("target",47847,[card("fire",47904),card("electric",47906)]));
  assert.equal(engine.calculateAttackDamage(game(seaking,defending),find(game(seaking,defending),"ATTACK")),70);
});

test("Goldeen heads discards a chosen opposing Energy after applying damage",()=>{
  const own=player(card("goldeen",45717,[card("a",50745),card("b",50745)]));
  const foe=player(card("mega",47847,[card("fire",47904),card("electric",47906)]));
  let state=game(own,foe);
  state.randomState=123456789;
  state=engine.applyMatchAction(state,find(state,"ATTACK"));
  assert.equal(state.players[1].active.damage,10);
  assert.equal(state.pendingAttack.type,"DISCARD_ENERGY");
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.choiceInstanceId==="electric"));
  assert.equal(state.players[1].active.attached.length,1);
  assert.equal(state.players[1].trash[0].instanceId,"electric");
});

test("Terapagos forbids the first second-player Union Beat and blocks the specified next-turn attack",()=>{
  let state=game(player(card("enemy",45699,[card("grass",50745)])),
    player(card("tera",46027,[card("a",50745),card("b",47906)])));
  state.turn=1;state.turnNo=2;state.turnsTaken=[1,0];
  assert.equal(engine.getMatchActions(state).some(x=>x.type==="ATTACK"&&x.attackIndex===0),false);
  state=game(player(card("tera",46027,[card("grass",50745),card("water",50747),card("electric",47906)])),
    player(card("enemy",47315,[card("f1",47904),card("f2",47904),card("f3",47904),card("f4",47904)])));
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="ATTACK"&&x.attackIndex===1));
  assert.equal(state.turn,1);
  const response=engine.getMatchActions(state).find(x=>x.type==="ATTACK");
  assert.equal(engine.calculateAttackDamage(state,response),0);
});

test("Kichikigisu hits a Bench target and resolves its prize without forcing promotion",()=>{
  const own=player(card("bird",45913,[card("a",50745),card("b",50745),card("c",50745)]));
  const foe=player(card("active",47847),[card("bench",45699)]);
  let state=game(own,foe);
  const shot=engine.getMatchActions(state).find(x=>x.type==="ATTACK"&&x.targetInstanceId==="bench");
  state=engine.applyMatchAction(state,shot);
  assert.equal(state.players[1].bench.length,0);
  assert.equal(state.players[1].active.instanceId,"active");
  assert.equal(state.pendingKnockout.remaining,1);
  state=engine.applyMatchAction(state,find(state,"TAKE_PRIZE"));
  state=engine.applyMatchAction(state,find(state,"RESOLVE_KNOCKOUT"));
  assert.equal(state.turn,1);
});

test("Meowth returns itself and attachments to hand, then promotes a Bench Pokémon",()=>{
  let state=game(player(card("cat",49694,[card("fire",47904)]),[card("ray",50396)]),
    player(card("foe",47847)));
  state.players[0].active.attached.push(card("a",47906),card("b",47906));
  state=engine.applyMatchAction(state,find(state,"ATTACK"));
  assert.equal(state.players[0].hand.length,4);
  assert.equal(state.players[0].active,null);
  state=engine.applyMatchAction(state,find(state,"ATTACK_PROMOTE"));
  assert.equal(state.players[0].active.instanceId,"ray");
  assert.equal(state.turn,1);
});

test("Latias attack prevents itself from attacking on its next own turn",()=>{
  let state=game(player(card("latias",46248,[card("p1",50749),card("p2",50749),card("p3",50745)])),
    player(card("foe",47847)));
  state=engine.applyMatchAction(state,find(state,"ATTACK"));
  state=engine.applyMatchAction(state,find(state,"END_TURN"));
  assert.equal(state.turn,0);
  assert.equal(engine.getMatchActions(state).some(x=>x.type==="ATTACK"),false);
  state=engine.applyMatchAction(state,find(state,"END_TURN"));
  state=engine.applyMatchAction(state,find(state,"END_TURN"));
  assert.equal(engine.getMatchActions(state).some(x=>x.type==="ATTACK"),true);
});

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

test("Rayquaza ability text compiles and works on a reprinted card ID",()=>{
  const own=player(card("latias",46248),[],[card("ray-reprint",50536)],
    [card("fire",47904),card("lillie",49445),card("electric",47906),card("small",45624),card("bottom",50745)]);
  let state=game(own,player(card("mega",48466)));
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="BENCH_BASIC"));
  assert.equal(state.pendingAbility.name,"はしゃのほうこう");
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="ABILITY_SELECT"&&x.choiceInstanceId==="fire"));
  assert.equal(state.players[0].bench[0].attached[0].instanceId,"fire");
  assert.equal(state.players[0].deck[0].instanceId,"bottom");
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
  const own=player(card("latias",46248),[],[card("meowth",49694),card("meowth-reprint-1",50067),
    card("meowth-reprint-2",50081),card("ak",49412)],
    [card("lillie",49445),card("fire",47904),card("electric",47906)]);
  let state=game(own,player(card("mega",48466)));
  for(const id of [49694,50067,50081])assert.equal(engine.entries(card("m"+id,id))[0].status,"supported");
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="BENCH_BASIC"&&x.sourceInstanceId==="meowth"));
  assert.equal(state.pendingAbility.name,"おくのてキャッチ");
  state=engine.applyMatchAction(state,find(state,"ABILITY_SELECT"));
  assert.equal(state.players[0].hand.some(x=>x.instanceId==="lillie"),true);
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="BENCH_BASIC"&&x.sourceInstanceId==="meowth-reprint-1"));
  assert.equal(state.pendingAbility,undefined);
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="BENCH_BASIC"&&x.sourceInstanceId==="meowth-reprint-2"));
  assert.equal(state.pendingAbility,undefined);
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="PLAY_TRAINER"&&x.sourceInstanceId==="ak"));
  state=engine.applyMatchAction(state,find(state,"AKAMATSU_PICK"));
  state=engine.applyMatchAction(state,find(state,"AKAMATSU_PICK"));
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="AKAMATSU_HAND"&&x.choiceInstanceId==="fire"));
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="AKAMATSU_ATTACH"&&x.targetInstanceId==="latias"));
  assert.equal(state.players[0].active.attached[0].instanceId,"electric");
  assert.equal(state.players[0].hand.some(x=>x.instanceId==="fire"),true);
});

test("Munkidori moves up to three damage counters from an own Pokémon to an opposing Pokémon",()=>{
  let state=game(player(card("munkidori",49074,[card("dark",50483)]),[card("hurt",49956)]),player(card("foe",50339)));
  state.players[0].bench[0].damage=50;
  let actions=engine.getMatchActions(state).filter(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId==="munkidori");
  assert.deepEqual(actions.map(x=>x.counterCount),[1,2,3]);
  assert.equal(engine.getMatchActions(game(player(card("no-dark",49074)),player(card("foe",50339))))
    .some(x=>x.type==="USE_ABILITY"),false);
  state=engine.applyMatchAction(state,actions.find(x=>x.counterCount===3));
  assert.equal(state.players[0].bench[0].damage,20);
  assert.equal(state.players[1].active.damage,30);
  assert.equal(engine.getMatchActions(state).some(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId==="munkidori"),false);
});

test("Munkidori knockout from transferred damage enters prize resolution",()=>{
  let state=game(player(card("munkidori",49074,[card("dark",50483)]),[card("hurt",50339)]),player(card("foe",49956),[card("reserve",50339)]));
  state.players[0].bench[0].damage=20;
  state.players[1].active.damage=10;
  const action=engine.getMatchActions(state).find(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId==="munkidori"&&x.targetInstanceId==="foe"&&x.counterCount===2);
  state=engine.applyMatchAction(state,action);
  assert.equal(state.pendingKnockout.owner,1);
  assert.equal(state.players[1].active,null);
  assert.equal(state.players[0].prizes.length,6);
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="TAKE_PRIZE"));
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="PROMOTE_BENCH"));
  assert.equal(state.players[1].active.instanceId,"reserve");
  assert.equal(state.turn,0);
  assert.equal(state.pendingAbilityResolution,undefined);
});

test("Drakloak Recon Directive adds one of the top two cards and puts the other on the bottom",()=>{
  let own=player(card("drakloak",49263),[],[],[card("top1",50745),card("top2",50745),card("tail",50745)]);
  let state=game(own,player(card("foe",50339)));
  const actions=engine.getMatchActions(state).filter(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId==="drakloak");
  assert.deepEqual(actions.map(x=>x.choiceInstanceId),["top1","top2"]);
  state=engine.applyMatchAction(state,actions.find(x=>x.choiceInstanceId==="top2"));
  assert.ok(state.players[0].hand.some(x=>x.instanceId==="top2"));
  assert.deepEqual(state.players[0].deck.map(x=>x.instanceId),["tail","top1"]);
});

test("Dudunsparce draws three, returns its stack and attachments, then shuffles",()=>{
  let own=player(card("active",50339),[card("dudunsparce",45203,[card("attached",50483)])],[],
    [card("top1",50745),card("top2",50745),card("top3",50745),card("tail1",50745),card("tail2",50745)]);
  let state=game(own,player(card("foe",50339)));
  const action=engine.getMatchActions(state).find(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId==="dudunsparce");
  state=engine.applyMatchAction(state,action);
  assert.deepEqual(state.players[0].hand.map(x=>x.instanceId),["top1","top2","top3"]);
  assert.ok(state.players[0].deck.some(x=>x.instanceId==="dudunsparce"));
  assert.ok(state.players[0].deck.some(x=>x.instanceId==="attached"));
  assert.equal(state.players[0].bench.some(x=>x.instanceId==="dudunsparce"),false);
});

test("Dudunsparce returning from Active forces a Bench promotion before play continues",()=>{
  let active=card("dudunsparce-active",45203,[card("attached",50483)]);
  active.stack=[card("dunsparce",45202)];
  let state=game(player(active,[card("promote",45910)]),player(card("foe",50339)));
  const action=engine.getMatchActions(state).find(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId==="dudunsparce-active");
  state=engine.applyMatchAction(state,action);
  assert.equal(state.players[0].active,null);
  assert.equal(state.pendingAbility.name,"にげあしドロー");
  for(const returned of ["dudunsparce-active","dunsparce","attached"])
    assert.ok(state.players[0].deck.some(x=>x.instanceId===returned));
  const promote=engine.getMatchActions(state).find(x=>x.type==="ABILITY_SELECT");
  state=engine.applyMatchAction(state,promote);
  assert.equal(state.players[0].active.instanceId,"promote");
  assert.equal(state.pendingAbility,undefined);
  assert.equal(state.turn,0);
});

test("Lillie's Clefairy changes opposing Dragon weakness to Psychic for double damage",()=>{
  const own=player(card("spectrier",48602,[card("psychic",50749)]),[card("clefairy",49003)]);
  const foe=player(card("dragapult",45772));
  let state=game(own,foe);
  const attack=engine.getLegalAttacks(state).find(x=>x.type==="ATTACK");
  assert.ok(attack);
  state=engine.applyMatchAction(state,attack);
  assert.equal(state.players[1].active.damage,60);

  state=game(player(card("spectrier",48602,[card("psychic",50749)])),player(card("dragapult",45772)));
  assert.equal(engine.calculateAttackDamage(state,{player:0,attackIndex:0}),30);
});

test("Chien-Pao discards the in-play Stadium when benched from hand",()=>{
  const own=player(card("active",50339),[],[card("chien-pao",46372)]);
  let state=game(own,player(card("foe",49956)));
  state.stadium=card("stadium",45790);
  state.stadiumOwner=1;
  const action=engine.getMatchActions(state).find(x=>x.type==="BENCH_BASIC"&&x.sourceInstanceId==="chien-pao");
  assert.ok(action);
  state=engine.applyMatchAction(state,action);
  assert.equal(state.stadium,null);
  assert.equal(state.stadiumOwner,null);
  assert.ok(state.players[1].trash.some(x=>x.instanceId==="stadium"));
  assert.equal(state.players[0].bench[0].instanceId,"chien-pao");
});

test("Tatsugiri selects a Supporter from the top six, shuffles the rest, and handles no hit",()=>{
  const own=player(card("tatsugiri",49265),[],[],[
    card("supporter",46110),card("e1",50745),card("e2",50745),card("e3",50745),
    card("e4",50745),card("e5",50745),card("outside",49445),card("tail",50745)]);
  let state=game(own,player(card("foe",50339)));
  const actions=engine.getMatchActions(state).filter(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId==="tatsugiri");
  assert.deepEqual(actions.map(x=>x.choiceInstanceId),["supporter"]);
  state=engine.applyMatchAction(state,actions[0]);
  assert.ok(state.players[0].hand.some(x=>x.instanceId==="supporter"));
  assert.deepEqual(new Set(state.players[0].deck.map(x=>x.instanceId)),new Set(["e1","e2","e3","e4","e5","outside","tail"]));

  state=game(player(card("tatsugiri2",49265),[],[],[
    card("e1",50745),card("e2",50745),card("e3",50745),card("e4",50745),
    card("e5",50745),card("e6",50745),card("outside",49445)]),player(card("foe",50339)));
  const noHit=engine.getMatchActions(state).find(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId==="tatsugiri2");
  assert.equal(noHit.choiceInstanceId,undefined);
  state=engine.applyMatchAction(state,noHit);
  assert.ok(state.players[0].deck.some(x=>x.instanceId==="outside"));
  assert.equal(state.players[0].hand.some(x=>x.instanceId==="outside"),false);
});

test("Blaziken ex attaches a chosen Basic Energy from the discard pile to a chosen Pokémon",()=>{
  const own=player(card("blaziken",46470),[card("target",50339)]);
  own.trash.push(card("discarded-dark",50483),card("discarded-item",49600));
  const state=game(own,player(card("foe",50339)));
  const actions=engine.getMatchActions(state).filter(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId==="blaziken");
  assert.equal(actions.length,2);
  assert.ok(actions.every(x=>x.choiceInstanceId==="discarded-dark"));
  const next=engine.applyMatchAction(state,actions.find(x=>x.targetInstanceId==="target"));
  assert.equal(next.players[0].bench[0].attached[0].instanceId,"discarded-dark");
  assert.equal(next.players[0].trash.some(x=>x.instanceId==="discarded-dark"),false);
  assert.equal(next.energyAttachedThisTurn,false);
});

test("Bloodmoon Ursaluna reduces Blood Moon's Colorless cost by opponent prizes taken",()=>{
  const own=player(card("ursaluna",47146,[card("e1",50745),card("e2",50745)]));
  const foe=player(card("foe",50339));
  foe.prizes=pile("prize",3);
  const state=game(own,foe);
  assert.ok(engine.getLegalAttacks(state).some(x=>x.attackIndex===0));

  const noPrizesTaken=game(player(card("ursaluna2",47146,[card("e1",50745),card("e2",50745)])),player(card("foe2",50339)));
  assert.equal(engine.getLegalAttacks(noPrizesTaken).some(x=>x.attackIndex===0),false);
});

test("Pecharunt applies six poison counters only while its ability is Active",()=>{
  let state=game(player(card("pecharunt",49206)),player(card("poisoned",50339)));
  state.players[1].active.statuses=[{name:"どく",appliedTurnNo:state.turnNo,ownerPlayer:0}];
  state=engine.pokemonCheck(state,0).state;
  assert.equal(state.players[1].active.damage,60);

  state=game(player(card("other-active",50339),[card("pecharunt-bench",49206)]),player(card("poisoned",50339)));
  state.players[1].active.statuses=[{name:"どく",appliedTurnNo:state.turnNo,ownerPlayer:0}];
  state=engine.pokemonCheck(state,0).state;
  assert.equal(state.players[1].active.damage,10);
});

test("Lunatone discards Basic Fighting Energy, draws three with Solrock, and shares its name limit",()=>{
  const own=player(card("lunatone",47759),[card("solrock",47760),card("lunatone2",47759)],
    [card("fighting",50750)],[card("top1",50745),card("top2",50745),card("top3",50745),card("tail",50745)]);
  const state=game(own,player(card("foe",50339)));
  const actions=engine.getMatchActions(state).filter(x=>x.type==="USE_ABILITY");
  assert.equal(actions.length,2);
  const next=engine.applyMatchAction(state,actions.find(x=>x.sourceInstanceId==="lunatone"));
  assert.equal(next.players[0].trash[0].instanceId,"fighting");
  assert.deepEqual(next.players[0].hand.map(x=>x.instanceId),["top1","top2","top3"]);
  assert.ok(next.usedAbilities.names.includes("ルナサイクル"));
  assert.equal(engine.getMatchActions(next).some(x=>x.type==="USE_ABILITY"),false);
});

test("Pecharunt switches in a Benched Dark Pokémon, poisons it, and shares its name limit",()=>{
  let state=game(player(card("pecharunt",49207),[card("yveltal",45910),card("pecharunt2",49207)]),player(card("foe",50339)));
  const action=engine.getMatchActions(state).find(x=>x.type==="USE_ABILITY"&&x.targetInstanceId==="yveltal");
  assert.ok(action);
  state=engine.applyMatchAction(state,action);
  assert.equal(state.players[0].active.instanceId,"yveltal");
  assert.equal(state.players[0].active.statuses[0].name,"どく");
  assert.equal(engine.getMatchActions(state).some(x=>x.type==="USE_ABILITY"),false);
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

test("Golden Flame ability text compiles for a reprint and keeps the per-card use limit",()=>{
  const own=player(card("hooh-reprint",47378),[card("hibiki",47310)],
    [card("first",47904),card("second",47904)]);
  let state=game(own,player(card("mega",48466)));
  assert.ok(engine.getMatchActions(state).some(x=>x.type==="USE_HOOH"&&x.sourceInstanceId==="hooh-reprint"));
  state=engine.applyMatchAction(state,find(state,"USE_HOOH"));
  state=engine.applyMatchAction(state,find(state,"ABILITY_SELECT"));
  state=engine.applyMatchAction(state,find(state,"ABILITY_SELECT"));
  assert.equal(state.players[0].bench[0].attached.length,2);
  assert.equal(engine.getMatchActions(state).some(x=>x.type==="USE_HOOH"&&x.sourceInstanceId==="hooh-reprint"),false);
});

test("Metal Signal searches up to two Steel Evolution Pokémon and shuffles the rest",()=>{
  const own=player(card("genesect",47988),[],[],
    [card("metang",45264),card("energy",50750),card("metagross",45265),card("basic",45202)]);
  let state=game(own,player(card("mega",48466)));
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId==="genesect"));
  const select=engine.getMatchActions(state).filter(x=>x.type==="ABILITY_SELECT");
  assert.deepEqual(select.map(x=>x.choiceInstanceId),["metang","metagross"]);
  state=engine.applyMatchAction(state,select.find(x=>x.choiceInstanceId==="metang"));
  assert.ok(engine.getMatchActions(state).some(x=>x.type==="ABILITY_SELECT"&&x.choiceInstanceId==="metagross"));
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="ABILITY_SELECT"&&x.choiceInstanceId==="metagross"));
  assert.deepEqual(state.players[0].hand.map(x=>x.instanceId),["metang","metagross"]);
  assert.equal(state.players[0].deck.length,2);
  assert.equal(state.pendingAbility,undefined);
  assert.equal(engine.getMatchActions(state).some(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId==="genesect"),false);
});

test("Metal Maker attaches selected Basic Steel Energy to chosen Pokémon and returns the rest to the bottom",()=>{
  const own=player(card("metang",49213),[card("bench",45264)],[],
    [card("steel1",8),card("viewed",50750),card("steel2",8),card("viewed2",45202),card("tail",50745)]);
  let state=game(own,player(card("mega",48466)));
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId==="metang"));
  const actions=engine.getMatchActions(state).filter(x=>x.type==="ABILITY_SELECT");
  assert.deepEqual(actions.map(x=>[x.choiceInstanceId,x.targetInstanceId]),[
    ["steel1","metang"],["steel1","bench"],["steel2","metang"],["steel2","bench"]]);
  state=engine.applyMatchAction(state,actions.find(x=>x.choiceInstanceId==="steel1"&&x.targetInstanceId==="metang"));
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="ABILITY_SELECT"&&
    x.choiceInstanceId==="steel2"&&x.targetInstanceId==="bench"));
  assert.deepEqual(state.players[0].active.attached.map(x=>x.instanceId),["steel1"]);
  assert.deepEqual(state.players[0].bench[0].attached.map(x=>x.instanceId),["steel2"]);
  assert.equal(state.players[0].deck[0].instanceId,"tail");
  assert.deepEqual(new Set(state.players[0].deck.slice(1).map(x=>x.instanceId)),new Set(["viewed","viewed2"]));
  assert.equal(state.pendingAbility,undefined);
});

test("Rapid Vernier switches itself Active and can move Energy from multiple Pokémon",()=>{
  const own=player(card("old-active",45202,[card("old-energy",47904)]),
    [card("other-bench",45202,[card("bench-energy",47906)])],[card("iron-leaves",48793)]);
  own.active.statuses=["ねむり"];
  let state=game(own,player(card("mega",48466)));
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="BENCH_BASIC"&&x.sourceInstanceId==="iron-leaves"));
  assert.equal(state.players[0].active.instanceId,"iron-leaves");
  assert.equal(state.players[0].active.statuses?.length??0,0);
  assert.equal(state.players[0].bench.find(x=>x.instanceId==="old-active").statuses.length,0);
  assert.deepEqual(new Set(engine.getMatchActions(state).filter(x=>x.type==="ABILITY_SELECT").map(x=>x.choiceInstanceId)),
    new Set(["old-energy","bench-energy"]));
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="ABILITY_SELECT"&&x.choiceInstanceId==="old-energy"));
  state=engine.applyMatchAction(state,engine.getMatchActions(state).find(x=>x.type==="ABILITY_SELECT"&&x.choiceInstanceId==="bench-energy"));
  assert.deepEqual(state.players[0].active.attached.map(x=>x.instanceId),["old-energy","bench-energy"]);
  assert.equal(state.pendingAbility,undefined);
});

test("Bad Upper searches Basic Darkness Energy, attaches it to a Benched Dark Pokémon, and adds two counters",()=>{
  const own=player(card("stunfisk",48397),[card("poochyena",45194)],[],[card("dark-energy",7),card("tail",50745)]);
  let state=game(own,player(card("mega",48466)));
  const action=engine.getMatchActions(state).find(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId==="stunfisk"&&
    x.targetInstanceId==="poochyena"&&x.choiceInstanceId==="dark-energy");
  assert.ok(action);
  state=engine.applyMatchAction(state,action);
  assert.equal(state.players[0].bench[0].attached[0].instanceId,"dark-energy");
  assert.equal(state.players[0].bench[0].damage,20);
  assert.equal(state.pendingKnockout,undefined);
  assert.equal(state.players[0].deck[0].instanceId,"tail");
});

test("Bad Upper damage resolves a knockout on its own Bench target",()=>{
  const own=player(card("stunfisk",48397),[card("poochyena",45194)],[],[card("dark-energy",7)]);
  own.bench[0].damage=50;
  let state=game(own,player(card("mega",48466)));
  const action=engine.getMatchActions(state).find(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId==="stunfisk");
  state=engine.applyMatchAction(state,action);
  assert.equal(state.pendingKnockout.owner,0);
  assert.equal(state.players[0].bench.length,0);
  assert.ok(state.players[0].trash.some(x=>x.instanceId==="poochyena"));
  assert.equal(state.players[0].trash.some(x=>x.instanceId==="dark-energy"),true);
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
  assert.equal(state.players[0].hand[0].instanceId,"mon");
  assert.equal(state.players[0].trash.length,3);
  assert.equal(state.pendingTrainer,undefined);
});

test("Poké Pad searches one ruleless Pokémon and shuffles without a finish action",()=>{
  let state=game(player(card("dip",45703),[],[card("pad",49601)],
    [card("ruleless",45699),card("ex",47847),card("other",50745)]),
    player(card("mega",48466)));
  state=engine.applyMatchAction(state,find(state,"PLAY_TRAINER"));
  assert.deepEqual(engine.getMatchActions(state).filter(x=>x.type==="TRAINER_SELECT")
    .map(x=>x.choiceInstanceId),["ruleless"]);
  state=engine.applyMatchAction(state,find(state,"TRAINER_SELECT"));
  assert.equal(state.pendingTrainer,undefined);
  assert.equal(state.players[0].hand[0].instanceId,"ruleless");
  assert.equal(engine.getMatchActions(state).some(x=>x.type==="TRAINER_FINISH"),false);
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
  assert.equal(engine.attacks(card("goldeen",45717))[0].status,"supported");
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

test("Crown Opal protects Terapagos for the opponent's whole turn, then expires",()=>{
  const tera=card("tera",46027,[card("grass",50745),card("water",50747),card("electric",47906)]);
  const hooh=card("hooh",47315,[0,1,2,3].map(i=>card(`fire-${i}`,47904)));
  let current=game(player(tera),player(hooh));
  const crown=engine.getMatchActions(current).find(x=>x.type==="ATTACK"&&x.attackIndex===1);
  assert.ok(crown);
  current=engine.applyMatchAction(current,crown);
  assert.equal(current.turn,1);
  assert.equal(current.players[1].active.damage,180);
  assert.deepEqual(current.attackProtection,[{owner:0,instanceId:"tera"}]);
  const counterattack=engine.getMatchActions(current).find(x=>x.type==="ATTACK");
  assert.ok(counterattack);
  assert.equal(engine.calculateAttackDamage(current,counterattack),0);
  current=engine.applyMatchAction(current,counterattack);
  assert.equal(current.players[0].active.damage,0);
  assert.equal(current.turn,0);
  assert.deepEqual(current.attackProtection,[]);
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

test("Cursed Bomb's five counters knock out the source and preserve the opponent target damage",()=>{
  const own=player(card("own-active",45202),[card("samayoru",45894)]);
  let current=game(own,player(card("foe-active",45202)));
  const action=engine.getMatchActions(current).find(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId==="samayoru"&&x.targetInstanceId==="foe-active");
  assert.ok(action);
  current=engine.applyMatchAction(current,action);
  assert.equal(current.players[1].active.damage,50);
  assert.equal(current.players[0].bench.length,0);
  assert.ok(current.players[0].trash.some(x=>x.instanceId==="samayoru"));
  assert.equal(current.pendingKnockout.owner,0);
  current=engine.applyMatchAction(current,find(current,"TAKE_PRIZE"));
  current=engine.applyMatchAction(current,find(current,"RESOLVE_KNOCKOUT"));
  assert.equal(current.turn,0);
  assert.equal(current.pendingAbilityResolution,undefined);
});

test("Cursed Bomb's thirteen counters uses ordinary self-knockout promotion handling",()=>{
  const own=player(card("dusknoir",45895),[card("own-bench",45202)]);
  let current=game(own,player(card("foe-active",46027)));
  current=engine.applyMatchAction(current,engine.getMatchActions(current).find(x=>x.type==="USE_ABILITY"&&
    x.sourceInstanceId==="dusknoir"&&x.targetInstanceId==="foe-active"));
  assert.equal(current.players[1].active.damage,130);
  assert.equal(current.pendingKnockout.owner,0);
  current=engine.applyMatchAction(current,find(current,"TAKE_PRIZE"));
  current=engine.applyMatchAction(current,find(current,"PROMOTE_BENCH"));
  assert.equal(current.players[0].active.instanceId,"own-bench");
  assert.equal(current.turn,0);
});

test("Cursed Bomb stops for review when its selected target is also knocked out",()=>{
  const own=player(card("samayoru",45894));
  const foe=player(card("foe-active",45202));
  foe.active.damage=10;
  let current=game(own,foe);
  current=engine.applyMatchAction(current,engine.getMatchActions(current).find(x=>x.type==="USE_ABILITY"&&
    x.sourceInstanceId==="samayoru"&&x.targetInstanceId==="foe-active"));
  assert.deepEqual(current.pendingKnockout.reason,"SIMULTANEOUS_KNOCKOUT_NEEDS_REVIEW");
  assert.deepEqual(current.pendingKnockout.victims,[0,1]);
  assert.equal(current.players[0].active.instanceId,"samayoru");
  assert.equal(current.players[1].active.damage,60);
  assert.deepEqual(engine.getMatchActions(current),[]);
});

test("Damp suppresses Cursed Bomb on either side of the field",()=>{
  const own=player(card("damp",48554));
  const foe=player(card("dusknoir",45895));
  const current=game(own,foe);
  current.turn=1;
  assert.equal(engine.getMatchActions(current).some(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId==="dusknoir"),false);
});

test("Initialize suppresses field Rule Box abilities while sparing Future and opposing ability-protected Pokémon",()=>{
  const own=player(card("iron-thorns",45676),[card("future",45253)]);
  const foe=player(card("protected",49663),[card("ray",50396)]);
  const current=game(own,foe);
  assert.equal(engine.entries(own.bench[0],current).length,1);
  assert.equal(engine.entries(foe.active,current).length,1);
  assert.equal(engine.entries(foe.bench[0],current).length,0);
  current.players[0].active=card("iron-thorns-reprint",48998);
  assert.equal(engine.entries(current.players[0].bench[0],current).length,1);
});

test("Noctowl Jewel Seeker searches a Trainer after evolving with a Tera Pokémon in play",()=>{
  const own=player(card("hoothoot",45200),[card("terapagos",46027)],[card("noctowl",46016)],
    [card("supporter",49445),card("bottom",50745)]);
  own.active.enteredTurn=2;
  let current=game(own,player(card("foe",49956)));
  const evolve=engine.getMatchActions(current).find(x=>x.type==="EVOLVE");
  assert.ok(evolve);
  current=engine.applyMatchAction(current,evolve);
  assert.equal(current.pendingAbility.name,"ほうせきさがし");
  assert.ok(engine.getMatchActions(current).some(x=>x.type==="ABILITY_SELECT"&&x.choiceInstanceId==="supporter"));
  current=engine.applyMatchAction(current,engine.getMatchActions(current).find(x=>x.type==="ABILITY_SELECT"));
  assert.equal(current.pendingAbility,undefined);
  assert.ok(current.players[0].hand.some(x=>x.instanceId==="supporter"));
});

test("Cynthia Gabite searches only a Cynthia Pokémon and shuffles the deck",()=>{
  let state=game(player(card("gabite",47338),[],[],[card("roselia",47300),card("budew",49956)]),
    player(card("foe",48466)));
  let actions=engine.getMatchActions(state).filter(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId==="gabite");
  assert.deepEqual(actions.map(x=>x.choiceInstanceId),["roselia"]);
  state=engine.applyMatchAction(state,actions[0]);
  assert.equal(state.players[0].hand.at(-1).instanceId,"roselia");
  assert.equal(state.players[0].deck.some(x=>x.instanceId==="budew"),true);
});

test("Yamawalk from discard benches up to three Yamask and finishes automatically",()=>{
  let state=game(player(card("yamask-attacker",49024,[card("psychic",50749)]),[],[],pile("deck",2)),
    player(card("foe",48466)));
  state.players[0].trash=[card("yamask-1",49024),card("yamask-2",49024),card("yamask-3",49024)];
  let action=engine.getMatchActions(state).find(x=>x.type==="ATTACK");
  assert.ok(action);
  state=engine.applyMatchAction(state,action);
  assert.equal(state.pendingAttack.type,"SEARCH_TRASH_TO_BENCH");
  for(let i=0;i<3;i++){
    action=engine.getMatchActions(state).find(x=>x.type==="ATTACK_SEARCH");
    assert.ok(action);
    state=engine.applyMatchAction(state,action);
  }
  assert.equal(state.players[0].bench.length,3);
  assert.equal(state.players[0].trash.length,0);
  assert.equal(state.pendingAttack,undefined);
  assert.equal(state.turn,1);
});

test("Wave Strike attaches up to three discarded basic Fighting Energy across own Bench",()=>{
  let state=game(player(card("mega-lucario",47762,[card("attached",6)]),
    [card("target-1",48466),card("target-2",45202)],[],pile("deck",2)),player(card("foe",48466)));
  state.players[0].trash=[card("fighting-1",6),card("fighting-2",6),card("fighting-3",6)];
  let action=engine.getMatchActions(state).find(x=>x.type==="ATTACK"&&x.attackIndex===0);
  assert.ok(action);
  state=engine.applyMatchAction(state,action);
  for(const targetInstanceId of ["target-1","target-2","target-1"]){
    action=engine.getMatchActions(state).find(x=>x.type==="ATTACK_SEARCH"&&x.targetInstanceId===targetInstanceId);
    assert.ok(action);
    state=engine.applyMatchAction(state,action);
  }
  assert.equal(state.players[0].bench[0].attached.length,2);
  assert.equal(state.players[0].bench[1].attached.length,1);
  assert.equal(state.players[0].trash.length,0);
  assert.equal(state.pendingAttack,undefined);
});

test("Torrent Pump can return three attached Energy and deal 120 to one Benched Pokémon",()=>{
  let state=game(player(card("ogrepon",45729,[card("water",50747),card("fighting-1",6),card("fighting-2",6)]),[],[],pile("deck",2)),
    player(card("foe",48466),[card("bench-target",49003)]));
  let action=engine.getMatchActions(state).find(x=>x.type==="ATTACK"&&x.attackIndex===1);
  assert.ok(action);
  state=engine.applyMatchAction(state,action);
  const returned=engine.getMatchActions(state).find(x=>x.type==="ATTACK_RETURN_ENERGY");
  assert.ok(returned);
  state=engine.applyMatchAction(state,returned);
  assert.equal(state.players[0].active.attached.length,0);
  assert.equal(state.players[0].deck.length,5);
  action=engine.getMatchActions(state).find(x=>x.type==="ATTACK_BENCH_DAMAGE_TARGET");
  assert.equal(action.targetInstanceId,"bench-target");
  state=engine.applyMatchAction(state,action);
  assert.equal(state.players[1].bench[0].damage,120);
  assert.equal(state.players[1].active.damage,100);
  assert.equal(state.turn,1);
});

test("Metagross forces the opponent to choose which Benched Pokémon becomes Active",()=>{
  let state=game(player(card("metagross",50143,[card("steel",8)])),
    player(card("active",48466),[card("choice-1",49003),card("choice-2",45202)]));
  const attack=engine.getMatchActions(state).find(x=>x.type==="ATTACK"&&x.attackIndex===0);
  assert.ok(attack);
  state=engine.applyMatchAction(state,attack);
  const choices=engine.getMatchActions(state).filter(x=>x.type==="ATTACK_OPPONENT_PROMOTE");
  assert.deepEqual(choices.map(x=>x.player),[1,1]);
  state=engine.applyMatchAction(state,choices[1]);
  assert.equal(state.players[1].active.instanceId,"choice-2");
  assert.ok(state.players[1].bench.some(x=>x.instanceId==="active"));
  assert.equal(state.turn,1);
});

test("Dragapult Phantom Dive places six selected counters and resolves a Benched knockout",()=>{
  const own=player(card("dragapult",45772,[card("fire",47904),card("psychic",50749)]));
  const foe=player(card("foe-active",45772),[card("bench-target",45202)]);
  let current=game(own,foe);
  const attack=engine.attacks(own.active).find(x=>x.name==="ファントムダイブ");
  assert.equal(attack.status,"supported");
  let action=engine.getMatchActions(current).find(x=>x.type==="ATTACK"&&x.attackIndex===attack.index);
  current=engine.applyMatchAction(current,action);
  assert.equal(current.pendingAttack.remaining,6);
  for(let i=0;i<6;i++){
    action=engine.getMatchActions(current).find(x=>x.type==="ATTACK_COUNTER_PLACE"&&x.targetInstanceId==="bench-target");
    assert.ok(action);
    current=engine.applyMatchAction(current,action);
  }
  assert.equal(current.pendingKnockout.owner,1);
  assert.equal(current.players[1].bench.length,0);
  current=engine.applyMatchAction(current,engine.getMatchActions(current).find(x=>x.type==="TAKE_PRIZE"));
  current=engine.applyMatchAction(current,engine.getMatchActions(current).find(x=>x.type==="RESOLVE_KNOCKOUT"));
  assert.equal(current.turn,1);
  assert.equal(current.pendingAttack,undefined);
});
