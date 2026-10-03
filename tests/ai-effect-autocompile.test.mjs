import test from "node:test";
import assert from "node:assert/strict";
import {loadEffectLibrary,recordDeckLearning,restoreLearnedPrograms} from "../src/decks/effect-library.js";

const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};

test("saved AI steps become an executable attack program on the first deck read",()=>{
  const storage=memory(),text="未知のワザ効果文。";
  const deck={deckCode:"AAAAAA-BBBBBB-CCCCCC",cards:[{officialCardId:201,count:1}]};
  const note={summary:"自分の山札を3枚引き、相手のバトルポケモンにダメカンを2個のせる。",
    steps:["自分の山札を3枚引く。","相手のバトルポケモンに、ダメカンを2個のせる。"],
    timing:"ワザの後",conditions:[],questions:[],confidence:"high",status:"ai_review",officialRulesVerified:false};
  const attack={index:0,name:"試験ワザ",text,cost:["Void"],printedDamage:{amount:0,suffix:""},effects:[],status:"needs_review"};
  const compiled={officialCardId:201,name:"試験カード",supported:false,unsupported:[attack],
    program:{abilities:[],attacks:[attack],trainer:null}};
  const report={officialCardId:201,name:"試験カード",type:"pokemon",supported:false,
    details:[{label:"ワザ：試験ワザ（Void／0）",status:"needs_review",text,aiAnalysis:note}]};
  recordDeckLearning([deck],[report],[compiled],storage);
  const source={officialCardId:201,name:"試験カード",cardType:"pokemon",trainerType:null,
    raw:{stage:"たね",types:["Colorless"],abilities:[],attacks:[{name:"試験ワザ",cost:["Void"],
      damage:{amount:0,suffix:""},effect:text}]}};
  const engine={deckPrograms:new Map()},repository={get:id=>id===201?source:null};
  assert.deepEqual(restoreLearnedPrograms([compiled],repository,engine,storage),{restoredCards:1,restoredEffects:1});
  assert.equal(compiled.supported,true);
  assert.equal(engine.deckPrograms.get(201).attacks[0].aiDerived,true);
  assert.deepEqual(engine.deckPrograms.get(201).attacks[0].effects,[
    {type:"DRAW",player:"SELF",count:3},
    {type:"PLACE_DAMAGE_COUNTERS",target:"DEFENDING_ACTIVE",count:2}
  ]);
  const saved=loadEffectLibrary(storage).effects[`attack:${text}`];
  assert.equal(saved.status,"supported");
  assert.equal(saved.aiAnalysis.officialRulesVerified,false);
});

test("low confidence or an unrecognized AI step never compiles to an executable program",()=>{
  const storage=memory(),text="未知のワザ効果文。",deck={deckCode:"DDDDDD-EEEEEE-FFFFFF",cards:[{officialCardId:202,count:1}]};
  const note={summary:"曖昧",steps:["相手の山札から好きなカードを選ぶ。"],timing:"不明",conditions:[],
    questions:[],confidence:"low",status:"ai_review",officialRulesVerified:false};
  const attack={index:0,name:"未知",text,cost:["Void"],printedDamage:{amount:0,suffix:""},effects:[],status:"needs_review"};
  const compiled={officialCardId:202,name:"試験カード",supported:false,unsupported:[attack],
    program:{abilities:[],attacks:[attack],trainer:null}};
  recordDeckLearning([deck],[{officialCardId:202,name:"試験カード",type:"pokemon",supported:false,
    details:[{label:"ワザ：未知",status:"needs_review",text,aiAnalysis:note}]}],[compiled],storage);
  const source={officialCardId:202,name:"試験カード",cardType:"pokemon",trainerType:null,
    raw:{stage:"たね",types:["Colorless"],abilities:[],attacks:[{name:"未知",cost:["Void"],damage:{amount:0,suffix:""},effect:text}]}};
  restoreLearnedPrograms([compiled],{get:()=>source},{deckPrograms:new Map()},storage);
  assert.equal(compiled.program.attacks[0].status,"needs_review");
  assert.equal(compiled.supported,false);
});
