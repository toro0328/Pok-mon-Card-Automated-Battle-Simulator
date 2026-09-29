import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CardRepository } from "../src/card-db/CardRepository.js";
import { MatchEngine } from "../src/engine/MatchEngine.js";

const database=JSON.parse(fs.readFileSync("tests/fixtures/ability-cards.json","utf8"));
const effects=JSON.parse(fs.readFileSync("tests/fixtures/ability-effects.json","utf8"));
const source=database.cards[0];
database.cards.push({...structuredClone(source),officialCardId:60001,name:"試験用ドローグッズ",cardType:"trainer",
  trainerType:"item",energyType:null,raw:{...structuredClone(source.raw),name:"試験用ドローグッズ",
    card_type:"Trainer",abilities:[],attacks:[],effect:"自分の山札を2枚引く。"}});
database.cards.push({...structuredClone(source),officialCardId:60002,name:"試験用エネルギー移動グッズ",cardType:"trainer",
  trainerType:"item",energyType:null,raw:{...structuredClone(source.raw),jp_id:60002,name:"試験用エネルギー移動グッズ",
    card_type:"Trainer",abilities:[],attacks:[],effect:"自分のポケモンについている基本エネルギーを1個、自分の別のポケモンにつけ替える。"}});
database.cards.push({...structuredClone(source),officialCardId:60003,name:"試験用回復グッズ",cardType:"trainer",
  trainerType:"item",energyType:null,raw:{...structuredClone(source.raw),jp_id:60003,name:"試験用回復グッズ",
    card_type:"Trainer",abilities:[],attacks:[],effect:"自分のポケモンを1匹選び、HPを「30」回復する。"}});
database.cards.push({...structuredClone(source),officialCardId:60004,name:"試験用ポケギア",cardType:"trainer",
  trainerType:"item",energyType:null,raw:{...structuredClone(source.raw),jp_id:60004,name:"試験用ポケギア",
    card_type:"Trainer",abilities:[],attacks:[],effect:"自分の山札を上から7枚見る。その中からサポートを1枚選び、相手に見せて、手札に加える。残りのカードは山札にもどして切る。"}});
database.cards.push({...structuredClone(source),officialCardId:60005,name:"試験用サポート",cardType:"trainer",
  trainerType:"supporter",energyType:null,raw:{...structuredClone(source.raw),jp_id:60005,name:"試験用サポート",
    card_type:"Trainer",abilities:[],attacks:[],effect:"自分の山札を1枚引く。"}});
database.cards.push({...structuredClone(source),officialCardId:60006,name:"試験用入れ替え",cardType:"trainer",
  trainerType:"item",energyType:null,raw:{...structuredClone(source.raw),jp_id:60006,name:"試験用入れ替え",
    card_type:"Trainer",abilities:[],attacks:[],effect:"自分のバトルポケモン1匹を、自分のベンチポケモンと入れ替える。"}});
database.cards.push({...structuredClone(source),officialCardId:60007,name:"試験用エネルギー転送",cardType:"trainer",
  trainerType:"item",energyType:null,raw:{...structuredClone(source.raw),jp_id:60007,name:"試験用エネルギー転送",
    card_type:"Trainer",abilities:[],attacks:[],effect:"自分の山札の基本エネルギーを1枚、相手プレイヤーに見せてから、手札に加える。その後、山札を切る。"}});
database.cards.push({...structuredClone(source),officialCardId:60008,name:"試験たね",cardType:"pokemon",trainerType:null,
  energyType:null,raw:{...structuredClone(source.raw),jp_id:60008,name:"試験たね",card_type:"Pokemon",stage:"たね",
    evolve_from:null,hp:60,types:["Grass"],abilities:[],attacks:[]}});
database.cards.push({...structuredClone(source),officialCardId:60009,name:"試験進化1",cardType:"pokemon",trainerType:null,
  energyType:null,raw:{...structuredClone(source.raw),jp_id:60009,name:"試験進化1",card_type:"Pokemon",stage:"1 進化",
    evolve_from:"試験たね",hp:100,types:["Grass"],abilities:[],attacks:[]}});
database.cards.push({...structuredClone(source),officialCardId:60010,name:"試験進化2",cardType:"pokemon",trainerType:null,
  energyType:null,raw:{...structuredClone(source.raw),jp_id:60010,name:"試験進化2",card_type:"Pokemon",stage:"2 進化",
    evolve_from:"試験進化1",hp:150,types:["Grass"],abilities:[],attacks:[]}});
database.cards.push({...structuredClone(source),officialCardId:60011,name:"試験用ふしぎなアメ",cardType:"trainer",
  trainerType:"item",energyType:null,raw:{...structuredClone(source.raw),jp_id:60011,name:"試験用ふしぎなアメ",
    card_type:"Trainer",abilities:[],attacks:[],effect:"自分の手札から2進化ポケモンを1枚選び、そのポケモンへと進化する自分の場のたねポケモンにのせ、1進化をとばして進化させる。（最初の自分の番と、この番出したばかりのポケモンには使えない。）"}});
database.cards.push({...structuredClone(source),officialCardId:60012,name:"試験用エネルギー回収",cardType:"trainer",
  trainerType:"item",energyType:null,raw:{...structuredClone(source.raw),jp_id:60012,name:"試験用エネルギー回収",
    card_type:"Trainer",abilities:[],attacks:[],effect:"自分のトラッシュから基本エネルギーを2枚まで選び、相手に見せて、手札に加える。"}});
effects.cardCount=database.cards.length;

test("deck load compiles an unregistered Trainer from its printed text for match use",async()=>{
  const engine=new MatchEngine(new CardRepository(database),effects);
  const compiled=await engine.compileDeck([
    {cards:[{officialCardId:60001,count:2}]},
    {cards:[{officialCardId:60001,count:1}]}
  ]);
  assert.equal(compiled.length,1);
  assert.equal(compiled[0].supported,true);
  assert.equal(compiled[0].copies[0],2);
  assert.equal(compiled[0].copies[1],1);
  assert.equal(engine.trainerSpec({cardId:60001}).effect,"draw");
  assert.equal(engine.trainerSpec({cardId:60001}).count,2);
  const state={players:[
    {hand:[{instanceId:"trainer",cardId:60001}],deck:[{instanceId:"a"},{instanceId:"b"},{instanceId:"c"}],trash:[],active:null,bench:[]},
    {hand:[],deck:[],trash:[],active:null,bench:[]}
  ],randomState:7,turn:0};
  const after=engine.applyTrainer(state,{type:"PLAY_TRAINER",player:0,sourceInstanceId:"trainer"});
  assert.deepEqual(after.players[0].hand.map(x=>x.instanceId),["a","b"]);
  assert.equal(after.players[0].deck.length,1);
  assert.equal(after.players[0].trash[0].instanceId,"trainer");
});

test("deck compilation connects Energy Switch text variants to legal Basic Energy movement",async()=>{
  const engine=new MatchEngine(new CardRepository(database),effects);
  const compiled=await engine.compileDeck([
    {cards:[{officialCardId:60002,count:1}]},{cards:[{officialCardId:60002,count:1}]}
  ]);
  assert.equal(compiled[0].supported,true);
  assert.equal(engine.trainerSpec({cardId:60002}).effect,"transfer");
  const card=(instanceId,cardId,attached=[])=>({instanceId,cardId,attached});
  const state={ruleset:"supported_abilities_v1",phase:"playing",turn:0,turnNo:2,turnsTaken:[1,1],
    energyAttachedThisTurn:false,retreatedThisTurn:false,stadium:null,
    players:[
      {active:card("from",50400,[card("basic",50745)]),bench:[card("to",50537)],hand:[card("switch",60002)],
        deck:[],prizes:Array.from({length:6},(_,i)=>card(`own-prize-${i}`,50745)),trash:[]},
      {active:card("foe",50400),bench:[],hand:[],deck:[],prizes:Array.from({length:6},(_,i)=>card(`foe-prize-${i}`,50745)),trash:[]}
    ],usedAbilities:{instances:[],names:[]},knockoutThisTurn:[false,false],previousOpponentTurnKnockout:[false,false]};
  const action=engine.getMatchActions(state).find(x=>x.type==="PLAY_TRAINER"&&x.choiceInstanceId==="basic"&&
    x.targetInstanceId==="to");
  assert.ok(action);
  const next=engine.applyMatchAction(state,action);
  assert.deepEqual(next.players[0].active.attached,[]);
  assert.equal(next.players[0].bench[0].attached[0].instanceId,"basic");
  assert.equal(next.players[0].trash[0].instanceId,"switch");
});

test("deck compilation connects generic healing text to the selected damaged Pokémon",async()=>{
  const engine=new MatchEngine(new CardRepository(database),effects);
  const compiled=await engine.compileDeck([
    {cards:[{officialCardId:60003,count:1}]},{cards:[{officialCardId:60003,count:1}]}
  ]);
  assert.equal(compiled[0].supported,true);
  assert.equal(engine.trainerSpec({cardId:60003}).amount,30);
  const card=(instanceId,cardId)=>({instanceId,cardId,attached:[]});
  const state={ruleset:"supported_abilities_v1",phase:"playing",turn:0,turnNo:2,turnsTaken:[1,1],
    energyAttachedThisTurn:false,retreatedThisTurn:false,stadium:null,
    players:[
      {active:{...card("active",50400),damage:50},bench:[{...card("bench",50537),damage:20}],
        hand:[card("potion",60003)],deck:[],prizes:Array.from({length:6},(_,i)=>card(`own-prize-${i}`,50745)),trash:[]},
      {active:card("foe",50400),bench:[],hand:[],deck:[],prizes:Array.from({length:6},(_,i)=>card(`foe-prize-${i}`,50745)),trash:[]}
    ],usedAbilities:{instances:[],names:[]},knockoutThisTurn:[false,false],previousOpponentTurnKnockout:[false,false]};
  const actions=engine.getMatchActions(state).filter(x=>x.type==="PLAY_TRAINER"&&x.sourceInstanceId==="potion");
  assert.deepEqual(new Set(actions.map(x=>x.targetInstanceId)),new Set(["active","bench"]));
  const next=engine.applyMatchAction(state,actions.find(x=>x.targetInstanceId==="active"));
  assert.equal(next.players[0].active.damage,20);
  assert.equal(next.players[0].bench[0].damage,20);
});

test("deck compilation executes a Pokégear print variant against the top seven cards",async()=>{
  const engine=new MatchEngine(new CardRepository(database),effects);
  const compiled=await engine.compileDeck([{cards:[{officialCardId:60004,count:1}]},{cards:[]}]);
  assert.equal(compiled[0].supported,true);
  assert.equal(engine.trainerSpec({cardId:60004}).effect,"pokegear");
  const cards=Array.from({length:7},(_,i)=>({instanceId:`top-${i}`,cardId:50745}));
  cards[4]={instanceId:"supporter",cardId:60005};
  const state={ruleset:"supported_abilities_v1",phase:"playing",turn:0,turnNo:2,turnsTaken:[1,1],
    energyAttachedThisTurn:false,retreatedThisTurn:false,stadium:null,randomState:7,
    players:[{active:null,bench:[],hand:[{instanceId:"gear",cardId:60004}],deck:cards,trash:[],prizes:[]},
      {active:null,bench:[],hand:[],deck:[],trash:[],prizes:[]}],usedAbilities:{instances:[],names:[]}};
  const play=engine.getMatchActions(state).find(action=>action.type==="PLAY_TRAINER"&&action.sourceInstanceId==="gear"&&action.choiceInstanceId==="supporter");
  assert.ok(play);
  const next=engine.applyMatchAction(state,play);
  assert.ok(next.players[0].hand.some(card=>card.instanceId==="supporter"));
  assert.equal(next.players[0].deck.length,6);
  assert.equal(next.players[0].trash[0].instanceId,"gear");
});

test("deck compilation executes Switch and searches only Basic Energy from the deck",async()=>{
  const engine=new MatchEngine(new CardRepository(database),effects);
  const compiled=await engine.compileDeck([{cards:[{officialCardId:60006,count:1},{officialCardId:60007,count:1}]},{cards:[]}]);
  assert.ok(compiled.every(card=>card.supported));
  assert.equal(engine.trainerSpec({cardId:60006}).effect,"switch");
  assert.equal(engine.trainerSpec({cardId:60007}).filter,"basicEnergy");
  const card=(instanceId,cardId,attached=[])=>({instanceId,cardId,attached});
  const state={ruleset:"supported_abilities_v1",phase:"playing",turn:0,turnNo:2,turnsTaken:[1,1],
    energyAttachedThisTurn:false,retreatedThisTurn:false,stadium:null,randomState:13,
    players:[{active:card("active",50400),bench:[card("bench",50400)],hand:[card("switch",60006)],
      deck:[],trash:[],prizes:[]},{active:card("foe",50400),bench:[],hand:[],deck:[],trash:[],prizes:[]}],
    usedAbilities:{instances:[],names:[]}};
  const switchAction=engine.getMatchActions(state).find(action=>action.type==="PLAY_TRAINER"&&action.sourceInstanceId==="switch");
  assert.equal(switchAction.choiceInstanceId,"bench");
  const switched=engine.applyMatchAction(state,switchAction);
  assert.equal(switched.players[0].active.instanceId,"bench");

  state.players[0].hand=[card("energy-search",60007)];
  state.players[0].deck=[card("pokemon",50400),card("basic-energy",50745)];
  const playSearch=engine.getMatchActions(state).find(action=>action.type==="PLAY_TRAINER"&&action.sourceInstanceId==="energy-search");
  const pending=engine.applyMatchAction(state,playSearch);
  const selectEnergy=engine.getMatchActions(pending).find(action=>action.type==="TRAINER_SELECT");
  assert.equal(selectEnergy.choiceInstanceId,"basic-energy");
  const searched=engine.applyMatchAction(pending,selectEnergy);
  assert.ok(searched.players[0].hand.some(item=>item.instanceId==="basic-energy"));
  assert.equal(searched.players[0].deck.length,1);
});

test("Rare Candy skips exactly one evolution stage and enforces timing and lineage",async()=>{
  const engine=new MatchEngine(new CardRepository(database),effects);
  const compiled=await engine.compileDeck([{cards:[{officialCardId:60011,count:1}]},{cards:[]}]);
  assert.equal(compiled[0].supported,true);
  assert.equal(engine.trainerSpec({cardId:60011}).effect,"rareCandy");
  const card=(instanceId,cardId,extra={})=>({instanceId,cardId,attached:[],...extra});
  const state={ruleset:"supported_abilities_v1",phase:"playing",turn:0,turnNo:2,turnsTaken:[1,1],
    energyAttachedThisTurn:false,retreatedThisTurn:false,stadium:null,
    players:[{active:card("basic",60008,{enteredTurn:1,damage:20,attached:[card("energy",50745)]}),bench:[],
      hand:[card("candy",60011),card("stage2",60010)],deck:[],trash:[],prizes:[]},
      {active:card("foe",60008),bench:[],hand:[],deck:[],trash:[],prizes:[]}],
    usedAbilities:{instances:[],names:[]},knockoutThisTurn:[false,false],previousOpponentTurnKnockout:[false,false]};
  const action=engine.getMatchActions(state).find(item=>item.type==="PLAY_TRAINER"&&item.sourceInstanceId==="candy");
  assert.equal(action?.choiceInstanceId,"stage2");
  assert.equal(action?.targetInstanceId,"basic");
  const next=engine.applyMatchAction(state,action);
  assert.equal(next.players[0].active.cardId,60010);
  assert.equal(next.players[0].active.damage,20);
  assert.equal(next.players[0].active.attached[0].instanceId,"energy");
  assert.equal(next.players[0].active.stack.at(-1).instanceId,"basic");
  assert.equal(next.players[0].hand.length,0);
  assert.equal(next.players[0].trash[0].instanceId,"candy");

  const noAction=copy=>engine.getMatchActions(copy).some(item=>item.type==="PLAY_TRAINER"&&item.sourceInstanceId==="candy");
  const playedThisTurn=structuredClone(state);playedThisTurn.players[0].active.enteredTurn=2;
  assert.equal(noAction(playedThisTurn),false);
  const firstTurn=structuredClone(state);firstTurn.turnsTaken[0]=0;
  assert.equal(noAction(firstTurn),false);
  const wrongLine=structuredClone(state);wrongLine.players[0].active.cardId=60009;
  assert.equal(noAction(wrongLine),false);
});

test("Energy Retrieval returns at most two Basic Energy from the discard pile",async()=>{
  const engine=new MatchEngine(new CardRepository(database),effects);
  const compiled=await engine.compileDeck([{cards:[{officialCardId:60012,count:1}]},{cards:[]}]);
  assert.equal(compiled[0].supported,true);
  assert.equal(engine.trainerSpec({cardId:60012}).effect,"recoverEnergy");
  const card=(instanceId,cardId)=>({instanceId,cardId,attached:[]});
  const state={ruleset:"supported_abilities_v1",phase:"playing",turn:0,turnNo:2,turnsTaken:[1,1],
    energyAttachedThisTurn:false,retreatedThisTurn:false,stadium:null,
    players:[{active:null,bench:[],hand:[card("retrieval",60012)],deck:[],
      trash:[card("basic-a",50745),card("not-energy",50400),card("basic-b",50745),card("basic-c",50745)],prizes:[]},
      {active:null,bench:[],hand:[],deck:[],trash:[],prizes:[]}],
    usedAbilities:{instances:[],names:[]},knockoutThisTurn:[false,false],previousOpponentTurnKnockout:[false,false]};
  const play=engine.getMatchActions(state).find(action=>action.type==="PLAY_TRAINER"&&action.sourceInstanceId==="retrieval");
  let next=engine.applyMatchAction(state,play);
  assert.deepEqual(engine.getMatchActions(next).filter(action=>action.type==="ENERGY_RECOVERY_SELECT")
    .map(action=>action.choiceInstanceId),["basic-a","basic-b","basic-c"]);
  next=engine.applyMatchAction(next,engine.getMatchActions(next).find(action=>action.choiceInstanceId==="basic-a"));
  next=engine.applyMatchAction(next,engine.getMatchActions(next).find(action=>action.choiceInstanceId==="basic-b"));
  assert.equal(next.pendingTrainer,undefined);
  assert.deepEqual(next.players[0].hand.map(item=>item.instanceId),["basic-a","basic-b"]);
  assert.deepEqual(next.players[0].trash.map(item=>item.instanceId),["not-energy","basic-c","retrieval"]);
});
