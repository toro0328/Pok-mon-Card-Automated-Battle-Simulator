#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const DEFAULT_AUDIT="reports/card-effect-audit.json";
const DEFAULT_OUTPUT="reports/effect-ai-review.json";
const OPENAI_ENDPOINT="https://api.openai.com/v1/responses";
const OUTPUT_SCHEMA={type:"object",additionalProperties:false,properties:{analyses:{type:"array",items:{type:"object",additionalProperties:false,
  properties:{key:{type:"string"},summary:{type:"string"},steps:{type:"array",items:{type:"string"}},timing:{type:"string"},
    conditions:{type:"array",items:{type:"string"}},questions:{type:"array",items:{type:"string"}},confidence:{type:"string",enum:["high","medium","low"]}},
  required:["key","summary","steps","timing","conditions","questions","confidence"]}}},required:["analyses"]};
const INSTRUCTIONS="あなたはポケモンカードゲームのカード効果文を構造化して読み解く補助者です。入力された日本語の効果文だけを根拠に、処理の意味・順序・条件・タイミングを簡潔に整理してください。カード文に明記されていないルールを補わないでください。公式ルールや裁定を検索・照合したと主張してはいけません。曖昧な点はquestionsに残し、推測はconfidenceをlowまたはmediumにします。返答は指定JSONのみです。";

const normalize=text=>String(text??"").replace(/\s+/gu," ").trim();

export function buildEffectQueue(audit){
  const queue=new Map();
  for(const effect of audit?.unresolved??[]){
    const text=normalize(effect.text);
    if(!text)continue;
    const key=`${effect.kind}:${createHash("sha256").update(text).digest("hex").slice(0,32)}`;
    const entry=queue.get(key)??{key,kind:effect.kind,name:effect.name??"",text,officialCardIds:[]};
    entry.officialCardIds.push(...(effect.officialCardIds??[]));
    queue.set(key,entry);
  }
  return [...queue.values()].map(entry=>({...entry,
    officialCardIds:[...new Set(entry.officialCardIds)].sort((a,b)=>a-b)}));
}

function readJson(file,fallback){
  try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch(error){
    if(error.code==="ENOENT")return fallback;
    throw error;
  }
}

function writeCheckpoint(file,report){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temporary=`${file}.tmp`;
  fs.writeFileSync(temporary,JSON.stringify(report,null,2)+"\n");
  fs.renameSync(temporary,file);
}

function responseText(data){return (data?.output??[]).flatMap(item=>item?.type==="message"?(item.content??[]):[])
  .filter(item=>item?.type==="output_text").map(item=>item.text??"").join("\n");}

async function analyzeBatch(batch,{apiKey,model,fetcher=fetch,maxRetries=4}){
  let lastError;
  for(let attempt=0;attempt<=maxRetries;attempt++){
    let response;
    try{
      response=await fetcher(OPENAI_ENDPOINT,{method:"POST",headers:{"content-type":"application/json",
        authorization:`Bearer ${apiKey}`},body:JSON.stringify({model,store:false,instructions:INSTRUCTIONS,
          input:JSON.stringify(batch.map(({key,name,kind,text})=>({key,name,kind,effect_text:text}))),
          text:{format:{type:"json_schema",name:"pokemon_card_effect_analysis",strict:true,schema:OUTPUT_SCHEMA}}}),
        signal:AbortSignal.timeout(90_000)});
    }catch(error){
      lastError=error;
      if(attempt===maxRetries)break;
    }
    if(response?.ok){
      const data=await response.json();
      let parsed;
      try{parsed=JSON.parse(responseText(data));}catch{throw new Error("OpenAI response has no valid structured output");}
      if(!Array.isArray(parsed.analyses))throw new Error("OpenAI response has no analyses array");
      const expected=new Set(batch.map(effect=>effect.key));
      if(parsed.analyses.length!==batch.length||parsed.analyses.some(item=>!expected.has(item.key))||
        new Set(parsed.analyses.map(item=>item.key)).size!==parsed.analyses.length)
        throw new Error("OpenAI response did not match the requested batch");
      return parsed.analyses;
    }
    if(response){
      let message=`HTTP ${response.status}`;
      try{message=(await response.json()).error??message;}catch{}
      lastError=new Error(message);
      if(response.status<500&&response.status!==429)throw lastError;
      const retryAfter=Number(response.headers?.get?.("retry-after"));
      if(Number.isFinite(retryAfter)&&retryAfter>0)await new Promise(resolve=>setTimeout(resolve,Math.min(retryAfter*1000,60_000)));
    }
    if(attempt<maxRetries)await new Promise(resolve=>setTimeout(resolve,Math.min(1000*2**attempt,15_000)));
  }
  throw lastError??new Error("Worker request failed");
}

async function analyzeBatchWithSplit(batch,options){
  try{return await analyzeBatch(batch,options);}
  catch(error){
    const recoverableOutput=/structured output|analyses array|did not match the requested batch/iu.test(error.message);
    if(batch.length<2||!recoverableOutput)throw error;
    const middle=Math.ceil(batch.length/2);
    const first=await analyzeBatchWithSplit(batch.slice(0,middle),options);
    const second=await analyzeBatchWithSplit(batch.slice(middle),options);
    return [...first,...second];
  }
}

export async function runEffectBatch({auditPath=DEFAULT_AUDIT,outputPath=DEFAULT_OUTPUT,
  apiKey=process.env.OPENAI_API_KEY,model=process.env.OPENAI_MODEL??"gpt-6-luna",fetcher=fetch,
  onProgress=()=>{},delayMs=250}={}){
  if(!apiKey)throw new Error("Set OPENAI_API_KEY in the GitHub Actions repository secrets.");
  const audit=readJson(auditPath,null);
  if(!audit)throw new Error(`Audit report not found: ${auditPath}`);
  const queue=buildEffectQueue(audit),previous=readJson(outputPath,{analyses:[],failures:[]});
  const currentKeys=new Set(queue.map(item=>item.key));
  // Ignore historical checkpoint entries that are no longer unresolved. This
  // keeps completed totals aligned with the current queue and lets new effects
  // enter the queue without being hidden by stale notes.
  const saved=new Map((previous.analyses??[]).filter(item=>currentKeys.has(item.key)).map(item=>[item.key,item]));
  const failures=new Map((previous.failures??[]).filter(item=>currentKeys.has(item.key)).map(item=>[item.key,item]));
  const pending=queue.filter(item=>!saved.has(item.key));
  const report={schemaVersion:1,generatedAt:new Date().toISOString(),sourceAudit:audit.generatedAt??auditPath,
    totals:{queued:queue.length,completed:saved.size,remaining:pending.length},analyses:[...saved.values()],failures:[...failures.values()]};
  writeCheckpoint(outputPath,report);
  for(let offset=0;offset<pending.length;offset+=12){
    const batch=pending.slice(offset,offset+12);
    try{
      const results=await analyzeBatchWithSplit(batch,{apiKey,model,fetcher});
      const sourceByKey=new Map(batch.map(item=>[item.key,item]));
      for(const result of results){
        const source=sourceByKey.get(result.key);
        saved.set(result.key,{...source,aiAnalysis:{...result,status:"ai_review",officialRulesVerified:false},
          status:"ai_review",officialRulesVerified:false,analyzedAt:new Date().toISOString()});
        failures.delete(result.key);
      }
    }catch(error){
      for(const item of batch)if(!saved.has(item.key))failures.set(item.key,{key:item.key,error:error.message,
        at:new Date().toISOString()});
      // A malformed or temporarily failed batch is checkpointed and processing continues.
    }
    report.generatedAt=new Date().toISOString();
    report.totals={queued:queue.length,completed:saved.size,remaining:queue.length-saved.size};
    report.analyses=[...saved.values()];report.failures=[...failures.values()];
    writeCheckpoint(outputPath,report);
    onProgress({completed:saved.size,total:queue.length,failed:failures.size,outputPath});
    if(offset+12<pending.length&&delayMs>0)await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
  return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const auditPath=process.argv[2]??DEFAULT_AUDIT,outputPath=process.argv[3]??DEFAULT_OUTPUT;
  try{
    const result=await runEffectBatch({auditPath,outputPath,onProgress:progress=>
      console.log(`AI読み取りメモ ${progress.completed}/${progress.total}件（失敗 ${progress.failed}件）`)});
    console.log(`Saved ${result.totals.completed}/${result.totals.queued} AI review notes to ${outputPath}.`);
    if(result.failures.length)process.exitCode=1;
  }catch(error){console.error(error.message);process.exitCode=1;}
}
