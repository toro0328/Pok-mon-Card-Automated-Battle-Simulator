import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildEffectQueue, runEffectBatch } from "../scripts/analyze-all-effects.mjs";

test("batch queue merges reprints by normalized effect text and preserves card IDs",()=>{
  const queue=buildEffectQueue({unresolved:[
    {kind:"attack",name:"test A",text:"  自分の山札を2枚引く。\n",officialCardIds:[5,3]},
    {kind:"attack",name:"test B",text:"自分の山札を2枚引く。",officialCardIds:[3,8]},
    {kind:"ability",name:"test C",text:"自分の山札を2枚引く。",officialCardIds:[11]},
    {kind:"attack",name:"empty",text:"  ",officialCardIds:[12]}
  ]});
  assert.equal(queue.length,2);
  assert.match(queue[0].key,/^attack:[0-9a-f]{32}$/u);
  assert.deepEqual({...queue[0],key:undefined},{key:undefined,kind:"attack",name:"test A",
    text:"自分の山札を2枚引く。",officialCardIds:[3,5,8]});
  assert.match(queue[1].key,/^ability:[0-9a-f]{32}$/u);
});

test("batch review checkpoints in groups of twelve and resumes without duplicate requests",async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"effect-review-"));
  try{
    const auditPath=path.join(directory,"audit.json"),outputPath=path.join(directory,"review.json");
    fs.writeFileSync(auditPath,JSON.stringify({generatedAt:"test",unresolved:Array.from({length:14},(_,index)=>({
      kind:"ability",name:`effect ${index}`,text:`effect text ${index}`,officialCardIds:[index+1]}))}));
    const batches=[];
    const fetcher=async(_url,request)=>{
      const body=JSON.parse(request.body),effects=JSON.parse(body.input);batches.push(effects);
      assert.equal(_url,"https://api.openai.com/v1/responses");
      assert.equal(request.headers.authorization,"Bearer test-key");
      return new Response(JSON.stringify({output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({
        analyses:effects.map(effect=>({key:effect.key,summary:"read",steps:[],timing:"",conditions:[],questions:[],confidence:"high"}))})}]}]}),{status:200});
    };
    const first=await runEffectBatch({auditPath,outputPath,apiKey:"test-key",
      fetcher,delayMs:0});
    assert.deepEqual(batches.map(batch=>batch.length),[12,2]);
    assert.equal(first.totals.completed,14);
    assert.ok(first.analyses.every(item=>item.status==="ai_review"&&item.officialRulesVerified===false));
    const resumed=await runEffectBatch({auditPath,outputPath,apiKey:"test-key",
      fetcher:async()=>{throw new Error("completed work should not be sent again");},delayMs:0});
    assert.equal(resumed.totals.completed,14);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test("splits a malformed model batch and recovers all effects in smaller requests",async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"effect-review-split-"));
  try{
    const auditPath=path.join(directory,"audit.json"),outputPath=path.join(directory,"review.json");
    fs.writeFileSync(auditPath,JSON.stringify({unresolved:Array.from({length:12},(_,index)=>({
      kind:"item",name:`effect ${index}`,text:`effect text ${index}`,officialCardIds:[index+1]}))}));
    const batchSizes=[];
    const fetcher=async(_url,request)=>{
      const body=JSON.parse(request.body),effects=JSON.parse(body.input);batchSizes.push(effects.length);
      const analyses=effects.map(effect=>({key:effect.key,summary:"read",steps:[],timing:"",conditions:[],questions:[],confidence:"high"}));
      if(effects.length===12)analyses.pop();
      return new Response(JSON.stringify({output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({analyses})}]}]}),{status:200});
    };
    const result=await runEffectBatch({auditPath,outputPath,apiKey:"test-key",fetcher,delayMs:0});
    assert.deepEqual(batchSizes,[12,6,6]);
    assert.equal(result.totals.completed,12);
    assert.equal(result.failures.length,0);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
