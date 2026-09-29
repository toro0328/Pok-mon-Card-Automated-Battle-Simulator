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
