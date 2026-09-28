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
