#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { CardRepository } from "../src/card-db/CardRepository.js";
import { MatchEngine } from "../src/engine/MatchEngine.js";

const dbPath=process.argv[2]??"data/cards/cards.json";
const outputPath=process.argv[3]??"reports/card-effect-audit.json";
const db=JSON.parse(fs.readFileSync(dbPath,"utf8"));
const catalog=JSON.parse(fs.readFileSync("data/cards/ability-effects.json","utf8"));
const repository=new CardRepository(db);
const engine=new MatchEngine(repository,catalog);
const decks=[{cards:db.cards.map(card=>({officialCardId:card.officialCardId,count:1}))},{cards:[]}];
const compiled=await engine.compileDeck(decks);
const compiledById=new Map(compiled.map(card=>[card.officialCardId,card]));

const blocks=[];
for(const card of db.cards){
  const program=compiledById.get(card.officialCardId)?.program;
  if(card.cardType==="pokemon"){
    for(const [index,ability] of (card.raw.abilities??[]).entries()){
      const parsed=program?.abilities?.[index];
      blocks.push({cardId:card.officialCardId,cardName:card.name,kind:"ability",name:ability.name??"",text:ability.effect??"",
        status:parsed?.status==="supported"?"compiled":"needs_review"});
    }
    for(const [index,attack] of (card.raw.attacks??[]).entries()){
      const parsed=program?.attacks?.[index];
      blocks.push({cardId:card.officialCardId,cardName:card.name,kind:"attack",name:attack.name??"",
        text:attack.effect??"",cost:attack.cost??[],damage:attack.damage??null,
        status:parsed?.status==="supported"?"compiled":"needs_review"});
    }
    if(card.raw.rule_box){
      const known=new Set(["ポケモンexがきぜつしたとき、相手はサイドを2枚とる。","メガシンカexがきぜつしたとき、相手はサイドを3枚とる。"]);
      blocks.push({cardId:card.officialCardId,cardName:card.name,kind:"rule_box",name:"カード固有ルール",text:card.raw.rule_box,
        status:known.has(card.raw.rule_box)?"compiled":"needs_review"});
    }
  }else if(card.cardType==="trainer"){
    let supported=false;
    if(card.trainerType==="stadium")supported=engine.isSupportedStadium({cardId:card.officialCardId});
    else if(card.trainerType==="tool")supported=engine.isSupportedTool({cardId:card.officialCardId});
    else supported=!!engine.trainerSpec({cardId:card.officialCardId});
    blocks.push({cardId:card.officialCardId,cardName:card.name,kind:card.trainerType??"trainer",name:card.name,
      text:card.raw.effect??"",status:supported?"compiled":"needs_review"});
  }else if(card.cardType==="energy"){
    const supported=engine.isSupportedEnergy({cardId:card.officialCardId});
    blocks.push({cardId:card.officialCardId,cardName:card.name,kind:`${card.energyType??"unknown"}_energy`,name:card.name,
      text:card.raw.effect??"",status:supported?"compiled":"needs_review"});
  }else{
    blocks.push({cardId:card.officialCardId,cardName:card.name,kind:"unknown_card_type",name:card.name,
      text:card.raw.effect??"",status:"needs_review"});
  }
}

const unresolvedGroups=new Map();
for(const block of blocks){
  if(block.status==="compiled")continue;
  const key=JSON.stringify([block.kind,block.name,block.text,JSON.stringify(block.cost??[]),JSON.stringify(block.damage??null)]);
  const group=unresolvedGroups.get(key)??{kind:block.kind,name:block.name,text:block.text,cost:block.cost??null,
    damage:block.damage??null,officialCardIds:[]};
  group.officialCardIds.push(block.cardId);
  unresolvedGroups.set(key,group);
}
const counts={};
for(const block of blocks){
  counts[block.kind]??={total:0,compiled:0,needs_review:0};
  counts[block.kind].total++;
  counts[block.kind][block.status]++;
}
const report={schemaVersion:1,generatedAt:new Date().toISOString(),database:{path:dbPath,updatedAt:db.updatedAt,cardCount:db.cards.length},
  totals:{effectBlocks:blocks.length,compiled:blocks.filter(x=>x.status==="compiled").length,
    needsReview:blocks.filter(x=>x.status==="needs_review").length,uniqueUnresolved:unresolvedGroups.size},
  byKind:counts,unresolved:[...unresolvedGroups.values()].map(group=>({ ...group,
    officialCardIds:[...new Set(group.officialCardIds)].sort((a,b)=>a-b)
  })).sort((a,b)=>a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name)),
  note:"compiled means the current text compiler recognizes the printed block; runtime behavior and official ruling coverage require separate verification."};

if(outputPath){
  fs.mkdirSync(path.dirname(outputPath),{recursive:true});
  fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+"\n");
}
console.log(`Audited ${db.cards.length} cards and ${report.totals.effectBlocks} printed effect blocks.`);
console.log(`Compiler recognized ${report.totals.compiled}; ${report.totals.needsReview} need review across ${report.totals.uniqueUnresolved} unique entries.`);
for(const [kind,count] of Object.entries(counts).sort(([a],[b])=>a.localeCompare(b)))
  console.log(`${kind}: ${count.compiled}/${count.total} compiled; ${count.needs_review} need review`);
if(outputPath)console.log(`Wrote unresolved-effect inventory to ${outputPath}.`);
