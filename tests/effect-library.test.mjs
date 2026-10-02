import test from "node:test";
import assert from "node:assert/strict";
import {loadEffectLibrary,recordDeckLearning,restoreLearnedPrograms} from "../src/decks/effect-library.js";

const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
const deck=(deckCode,officialCardId)=>({deckCode,cards:[{officialCardId,count:2}]});
const card=(officialCardId,name="テストカード")=>({officialCardId,name,supported:false,
  program:{abilities:[{name:"テスト特性",text:"自分の番に1回使える。",status:"needs_review",operations:[]}],attacks:[],trainer:null}});
const report=(officialCardId,status="needs_review")=>({officialCardId,name:"テストカード",type:"pokemon",supported:status==="supported",
  details:[{label:"特性：テスト特性",status,text:"自分の番に1回使える。"}]});

test("first deck load adds a deduplicated card and unresolved effect to the shared encyclopedia",()=>{
  const storage=memory(),deckA=deck("AAAAAA-BBBBBB-CCCCCC",101),deckB=deck("DDDDDD-EEEEEE-FFFFFF",102);
  const result=recordDeckLearning([deckA,deckB],[report(101),report(102)],[card(101),card(102)],storage,"2026-09-29T00:00:00Z");
  const library=loadEffectLibrary(storage);
  assert.equal(result.newCards,2);
  assert.equal(result.newEffects,1);
  assert.equal(result.cardCount,2);
  assert.equal(result.effectCount,1);
  assert.equal(result.unresolvedEffectCount,1);
  assert.deepEqual(library.effects["ability:自分の番に1回使える。"].cardIds,[101,102]);
  assert.deepEqual(library.deckCodes,[deckA.deckCode,deckB.deckCode]);
});

test("later deck-code loads reuse effect signatures and upgrade them when the compiler supports them",()=>{
  const storage=memory();
  recordDeckLearning([deck("AAAAAA-BBBBBB-CCCCCC",101)],[report(101)],[card(101)],storage);
  const result=recordDeckLearning([deck("DDDDDD-EEEEEE-FFFFFF",103)],[report(103,"supported")],
    [{...card(103),program:{abilities:[{name:"テスト特性",text:"自分の番に1回使える。",status:"supported",operations:[{type:"DRAW",count:1}]}]}}],storage);
  const library=loadEffectLibrary(storage);
  assert.equal(result.newCards,1);
  assert.equal(result.newEffects,0);
  assert.equal(result.resolvedEffects,1);
  assert.equal(result.effectCount,1);
  assert.equal(result.unresolvedEffectCount,0);
  assert.deepEqual(library.effects["ability:自分の番に1回使える。"].program.operations,[{type:"DRAW",count:1}]);
});

test("re-reading the same code updates its records without duplicating cards or codes",()=>{
  const storage=memory(),input=deck("AAAAAA-BBBBBB-CCCCCC",101),compiled=[card(101)],reports=[report(101)];
  recordDeckLearning([input],reports,compiled,storage);
  const result=recordDeckLearning([input],reports,compiled,storage);
  const library=loadEffectLibrary(storage);
  assert.equal(result.newCards,0);
  assert.equal(result.newEffects,0);
  assert.deepEqual(library.deckCodes,[input.deckCode]);
  assert.equal(library.cards[101].copiesSeen,4);
});

test("a later deck reuses a previously compiled program for the same printed effect text",()=>{
  const storage=memory(),text="自分の番に1回使える。",operation={type:"DRAW",count:1};
  recordDeckLearning([deck("AAAAAA-BBBBBB-CCCCCC",101)],[report(101,"supported")],[{
    ...card(101),program:{abilities:[{name:"テスト特性",text,status:"supported",operations:[operation]}]}
  }],storage);
  const second={officialCardId:102,name:"別名のポケモン",cardType:"pokemon",trainerType:null,
    raw:{abilities:[{name:"別名の特性",effect:text}]}};
  const current={...card(102,"別名のポケモン"),supported:false,unsupported:[{name:"別名の特性",text,status:"needs_review"}],
    program:{abilities:[{name:"別名の特性",text,status:"needs_review",operations:[]}],attacks:[],trainer:null}};
  const engine={deckPrograms:new Map()};
  const restored=restoreLearnedPrograms([current],{get:id=>id===102?second:null},engine,storage);
  assert.deepEqual(restored,{restoredCards:1,restoredEffects:1});
  assert.equal(current.supported,true);
  assert.equal(current.program.abilities[0].name,"別名の特性");
  assert.deepEqual(current.program.abilities[0].operations,[operation]);
  assert.equal(engine.deckPrograms.get(102),current.program);
});

test("bundled AI notes are saved on first deck read but never count as executable support",()=>{
  const storage=memory(),input=deck("PPPPPP-QQQQQQ-RRRRRR",101),memo={summary:"手札を1枚戻して5枚になるまで引く。",
    steps:["手札を1枚山札の下に戻す","5枚になるまで引く"],timing:"自分の番",conditions:[],questions:[],
    confidence:"high",status:"ai_review",officialRulesVerified:false};
  const aiReport={...report(101),details:[{...report(101).details[0],aiAnalysis:memo}]};
  recordDeckLearning([input],[aiReport],[card(101)],storage);
  const effect=loadEffectLibrary(storage).effects["ability:自分の番に1回使える。"];
  assert.deepEqual(effect.aiAnalysis,memo);
  assert.equal(effect.status,"needs_learning");
  assert.equal(effect.program,null);
  const current=card(101),engine={deckPrograms:new Map()};
  assert.deepEqual(restoreLearnedPrograms([current],{get:()=>({cardType:"pokemon",raw:{}})},engine,storage),
    {restoredCards:0,restoredEffects:0});
  assert.equal(current.program.abilities[0].status,"needs_review");
});
