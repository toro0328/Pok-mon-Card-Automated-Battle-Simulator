import test from "node:test";
import assert from "node:assert/strict";
import {createDeckAnalysisRecord,loadDeckAnalysis,saveDeckAnalysis} from "../src/decks/analysis-store.js";

const code="9HnLnH-dqvzJ5-6PQngL";
const deck={deckCode:code,name:"test",sourceUrl:"https://example.test/deck",cards:[{officialCardId:1,count:60}]};
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};

test("analysis record is complete only for a 60-card deck with no missing or unresolved cards",()=>{
  assert.equal(createDeckAnalysisRecord(deck,[{supported:true}]).status,"complete");
  assert.equal(createDeckAnalysisRecord(deck,[{supported:false}]).status,"needs_review");
  assert.equal(createDeckAnalysisRecord(deck,[{supported:true}],[9]).status,"needs_review");
});

test("saving the same deck code updates one persistent local record",()=>{
  const storage=memory(),first=createDeckAnalysisRecord(deck,[{supported:false}]);
  saveDeckAnalysis(first,storage);
  const latest=createDeckAnalysisRecord(deck,[{supported:true}]);
  saveDeckAnalysis(latest,storage);
  assert.deepEqual(loadDeckAnalysis(code,storage),latest);
});
