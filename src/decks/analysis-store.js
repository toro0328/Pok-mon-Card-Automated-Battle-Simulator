const KEY_PREFIX="pokemon-card-simulator-analysis-";

export function createDeckAnalysisRecord(deck,analysis,missingCardIds=[]){
  const cardTotal=(deck.cards??[]).reduce((sum,entry)=>sum+entry.count,0);
  const complete=cardTotal===60&&missingCardIds.length===0&&analysis.every(card=>card.supported);
  return {schemaVersion:1,deckCode:deck.deckCode??null,sourceUrl:deck.sourceUrl??null,
    name:deck.name??null,cardTotal,cards:deck.cards??[],status:complete?"complete":"needs_review",
    missingCardIds:[...missingCardIds],analysis,recordedAt:new Date().toISOString()};
}

export function saveDeckAnalysis(record,storage=globalThis.localStorage){
  if(!storage)throw new Error("デッキ解析記録を保存できません。");
  if(!record.deckCode)throw new Error("デッキコードのない解析記録は保存できません。");
  storage.setItem(`${KEY_PREFIX}${record.deckCode}`,JSON.stringify(record));
  return record;
}

export function loadDeckAnalysis(deckCode,storage=globalThis.localStorage){
  const raw=storage?.getItem(`${KEY_PREFIX}${deckCode}`);
  return raw?JSON.parse(raw):null;
}
