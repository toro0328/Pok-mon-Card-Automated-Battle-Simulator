#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const inputPath=process.argv[2]??"reports/effect-ai-review.json";
const outputPath=process.argv[3]??"data/effect-ai-review.json.gz.b64";
const report=JSON.parse(fs.readFileSync(inputPath,"utf8"));
const normalize=text=>String(text??"").replace(/\s+/gu," ").trim();
const kindAliases={special_energy:"energy",unspecified:"card_effect"};
const analyses=[];
const keys=new Set();
for(const item of report.analyses??[]){
  if(item.status!=="ai_review"||item.officialRulesVerified!==false||
    item.aiAnalysis?.status!=="ai_review"||item.aiAnalysis?.officialRulesVerified!==false)
    throw new Error(`AI-only safety flags are missing for ${item.key}`);
  const kind=kindAliases[item.kind]??item.kind,text=normalize(item.text),key=`${kind}:${text}`;
  if(!text||keys.has(key))throw new Error(`Missing or duplicate runtime key: ${key}`);
  keys.add(key);
  analyses.push({key,kind,name:item.name??"",text,officialCardIds:item.officialCardIds??[],
    aiAnalysis:{summary:item.aiAnalysis.summary,steps:item.aiAnalysis.steps??[],timing:item.aiAnalysis.timing??"不明",
      conditions:item.aiAnalysis.conditions??[],questions:item.aiAnalysis.questions??[],
      confidence:item.aiAnalysis.confidence??"low",status:"ai_review",officialRulesVerified:false,
      analyzedAt:item.analyzedAt??item.aiAnalysis.analyzedAt??null}});
}
if(report.totals?.remaining!==0||analyses.length!==report.totals?.queued)
  throw new Error(`Incomplete AI review report: ${analyses.length}/${report.totals?.queued}`);
fs.mkdirSync(path.dirname(outputPath),{recursive:true});
const catalog=JSON.stringify({schemaVersion:1,sourceGeneratedAt:report.generatedAt,sourceTotals:report.totals,analyses});
fs.writeFileSync(outputPath,gzipSync(catalog,{level:9,mtime:0}).toString("base64")+"\n");
console.log(`Built ${analyses.length} reusable AI review notes: ${outputPath}`);
