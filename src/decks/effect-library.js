const KEY="pokemon-card-simulator-effect-library-v1";

function emptyLibrary(){return {schemaVersion:1,cards:{},effects:{},deckCodes:[]};}
function readLibrary(storage){
  const raw=storage?.getItem(KEY);
  if(!raw)return emptyLibrary();
  let parsed;
  try{parsed=JSON.parse(raw);}catch{return emptyLibrary();}
  if(parsed?.schemaVersion!==1||!parsed.cards||!parsed.effects||!Array.isArray(parsed.deckCodes))return emptyLibrary();
  return parsed;
}
function normalize(text){return String(text??"").replace(/\s+/gu," ").trim();}
function kindFor(label=""){
  if(label.startsWith("特性："))return "ability";
  if(label.startsWith("ワザ："))return "attack";
  if(label.includes("エネルギー"))return "energy";
  if(label.includes("ルール"))return "rule";
  if(["item","supporter","stadium","tool"].includes(label))return label;
  return "card_effect";
}
function programFor(detail,program){
  const label=detail.label??"";
  if(label.startsWith("特性："))return program?.abilities?.find(x=>x.name===label.slice(3))??null;
  if(label.startsWith("ワザ："))return program?.attacks?.find(x=>x.name===label.slice(3).split("（")[0])??null;
  return program?.trainer??null;
}

export function loadEffectLibrary(storage=globalThis.localStorage){
  return readLibrary(storage);
}

export function restoreLearnedPrograms(compiled,repository,engine,storage=globalThis.localStorage){
  const library=readLibrary(storage);let restoredCards=0,restoredEffects=0;
  for(const item of compiled){
    const card=repository.get(item.officialCardId),program=item.program;
    if(!card||!program)continue;
    let changed=false;
    program.abilities=(program.abilities??[]).map(current=>{
      if(current.status==="supported")return current;
      const learned=library.effects[`ability:${normalize(current.text)}`];
      if(learned?.status!=="supported"||!learned.program)return current;
      changed=true;restoredEffects++;
      return {...current,...learned.program,name:current.name,index:current.index,text:current.text,status:"supported"};
    });
    program.attacks=(program.attacks??[]).map(current=>{
      if(current.status==="supported")return current;
      const learned=library.effects[`attack:${normalize(current.text)}`];
      if(learned?.status!=="supported"||!learned.program)return current;
      changed=true;restoredEffects++;
      return {...current,...learned.program,name:current.name,index:current.index,cost:current.cost,
        printedDamage:current.printedDamage,text:current.text,status:"supported"};
    });
    if(!program.trainer&&card.trainerType&&normalize(card.raw?.effect)){
      const learned=library.effects[`${card.trainerType}:${normalize(card.raw.effect)}`];
      if(learned?.status==="supported"&&learned.program){program.trainer=learned.program;changed=true;restoredEffects++;}
    }
    if(!changed)continue;
    const unsupported=[...(program.abilities??[]),...(program.attacks??[])].filter(effect=>effect.status!=="supported");
    if(card.trainerType&&!program.trainer)unsupported.push({name:card.name,text:card.raw?.effect??"",status:"needs_review"});
    item.unsupported=unsupported;item.supported=unsupported.length===0;
    engine.deckPrograms.set(item.officialCardId,program);restoredCards++;
  }
  return {restoredCards,restoredEffects};
}

export function recordDeckLearning(decks,reports,compiled,storage=globalThis.localStorage,now=new Date().toISOString()){
  const library=readLibrary(storage),reportById=new Map(reports.map(report=>[report.officialCardId,report]));
  const compiledById=new Map(compiled.map(card=>[card.officialCardId,card]));
  const deckIds=new Map();
  for(const deck of decks)for(const entry of deck.cards??[]){
    const id=Number(entry.officialCardId),copies=deckIds.get(id)??[];
    copies.push({deckCode:deck.deckCode??null,count:entry.count});deckIds.set(id,copies);
  }
  let newCards=0,newEffects=0,resolvedEffects=0;
  const encounteredKeys=new Set(),unresolvedKeys=new Set();
  for(const [id,occurrences] of deckIds){
    const report=reportById.get(id),compiledCard=compiledById.get(id),program=compiledCard?.program;
    const cardEffects=(report?.details??[]).filter(detail=>normalize(detail.text)&&!detail.label?.startsWith("未対応効果")).map(detail=>{
      const kind=kindFor(detail.label),text=normalize(detail.text),key=`${kind}:${text}`;
      const prior=library.effects[key],supported=detail.status==="supported";
      if(!prior){
        library.effects[key]={kind,text,status:supported?"supported":"needs_learning",cardIds:[],names:[],
          firstSeenAt:now,lastSeenAt:now,seenCount:0,program:null};
        newEffects++;
      }
      const effect=library.effects[key];
      if(supported){
        if(effect.status!=="supported")resolvedEffects++;
        effect.status="supported";
        effect.program=programFor(detail,program)??effect.program;
      }
      effect.lastSeenAt=now;effect.seenCount++;
      if(!effect.cardIds.includes(id))effect.cardIds.push(id);
      if(report?.name&&!effect.names.includes(report.name))effect.names.push(report.name);
      encounteredKeys.add(key);
      if(!supported)unresolvedKeys.add(key);
      return key;
    });
    let record=library.cards[id];
    if(!record){
      record={officialCardId:id,name:report?.name??compiledCard?.name??`カードID ${id}`,
        type:report?.type??"unknown",firstSeenAt:now,lastSeenAt:now,seenDeckCodes:[],copiesSeen:0,
        effects:[],supported:!!report?.supported};
      library.cards[id]=record;newCards++;
    }
    record.name=report?.name??compiledCard?.name??record.name;
    record.type=report?.type??record.type;record.lastSeenAt=now;
    record.copiesSeen+=occurrences.reduce((sum,x)=>sum+x.count,0);
    record.supported=!!report?.supported;
    record.effects=[...new Set([...record.effects,...cardEffects])];
    for(const occurrence of occurrences)if(occurrence.deckCode&&!record.seenDeckCodes.includes(occurrence.deckCode))
      record.seenDeckCodes.push(occurrence.deckCode);
    record.seenDeckCodes=record.seenDeckCodes.slice(-50);
  }
  for(const deck of decks)if(deck.deckCode&&!library.deckCodes.includes(deck.deckCode))library.deckCodes.push(deck.deckCode);
  library.deckCodes=library.deckCodes.slice(-500);
  storage?.setItem(KEY,JSON.stringify(library));
  return {newCards,newEffects,resolvedEffects,cardCount:Object.keys(library.cards).length,
    effectCount:Object.keys(library.effects).length,unresolvedEffectCount:Object.values(library.effects)
      .filter(effect=>effect.status!=="supported").length,deckCodeCount:library.deckCodes.length,
    currentUnresolvedEffectCount:unresolvedKeys.size,encounteredEffectCount:encounteredKeys.size};
}
