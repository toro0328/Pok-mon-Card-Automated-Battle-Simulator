import { parseAbility } from "../card-db/parse-abilities.js";
import { inspectAttacks } from "../card-db/parse-effects.js";
import { parseTrainerText } from "../card-db/parse-trainers.js";

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
function samePrintedNumbers(original,candidate){
  const digits=value=>(String(value??"").match(/[0-9]+/gu)??[]).join(",");
  const before=digits(original),after=digits(candidate);
  return !!before&&before===after;
}
function safeAiAttackText(original,candidate){
  if(typeof candidate!=="string"||!candidate.endsWith("。"))return false;
  const clauses=candidate.match(/[^。]+。/gu)??[];
  if(!clauses.length||clauses.join("")!==candidate)return false;
  const safeClause=/^(?:自分の山札を[1-9][0-9]*枚引く|相手のバトルポケモンを(?:どく|やけど|ねむり|マヒ|こんらん)にする|コインを1回投げオモテなら、相手のバトルポケモンを(?:どく|やけど|ねむり|マヒ|こんらん)にする|このポケモンにも[1-9][0-9]*ダメージ|相手のバトルポケモンに、ダメカンを[1-9][0-9]*個のせる|このポケモンのHPを「[1-9][0-9]*」回復する)。$/u;
  if(!clauses.every(clause=>safeClause.test(clause)))return false;
  return samePrintedNumbers(original,candidate);
}
function safeAiAbilityText(original,candidate){
  if(typeof candidate!=="string"||!samePrintedNumbers(original,candidate))return false;
  return /^(?:自分の番に1回使える。自分の山札を[1-9][0-9]*枚引く。|自分の番に、自分の手札を1枚トラッシュするなら、1回使える。自分の山札を[1-9][0-9]*枚引く。|自分の番に1回使える。自分の山札から基本エネルギーを1枚選び、手札に加える。そして山札を切る。|自分の番に1回使える。自分の山札からサポートを1枚選び、相手に見せて、手札に加える。そして山札を切る。)$/u.test(candidate);
}
function safeAiTrainerText(original,candidate){
  if(typeof candidate!=="string"||!samePrintedNumbers(original,candidate))return false;
  if(/^自分の山札を[1-6]枚引く。$/u.test(candidate))return true;
  const search=candidate.match(/^自分の山札から(.+?)を([1-6])枚(まで)?選び、相手に見せて、手札に加える。そして山札を切る。$/u);
  if(!search)return false;
  const target=search[1].replace(/[「」『』]/gu,"");
  const printed=String(original??"").replace(/[「」『』]/gu,"");
  return target.length>0&&printed.includes(target);
}
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

export function recordAiEffectAnalyses(analyses,storage=globalThis.localStorage){
  const library=readLibrary(storage);let saved=0;
  for(const analysis of analyses??[]){
    const effect=library.effects[analysis?.key];
    if(!effect||typeof analysis.summary!=="string")continue;
    effect.aiAnalysis={summary:analysis.summary,steps:Array.isArray(analysis.steps)?analysis.steps:[],
      executableText:typeof analysis.executableText==="string"?analysis.executableText:null,
      timing:analysis.timing??"不明",conditions:Array.isArray(analysis.conditions)?analysis.conditions:[],
      questions:Array.isArray(analysis.questions)?analysis.questions:[],confidence:analysis.confidence??"low",
      officialRulesVerified:false,analyzedAt:analysis.analyzedAt??new Date().toISOString()};
    effect.lastSeenAt=new Date().toISOString();saved++;
  }
  storage?.setItem(KEY,JSON.stringify(library));
  return {saved};
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
      if(learned?.status!=="supported"||!learned.program){
        const candidate=learned?.aiAnalysis;
        if(candidate?.confidence!=="high"||candidate.questions?.length||
          !safeAiAbilityText(current.text,candidate.executableText))return current;
        const parsed=parseAbility(current.name,candidate.executableText);
        if(parsed.status!=="supported")return current;
        changed=true;restoredEffects++;
        const learnedProgram={...parsed,name:current.name,index:current.index,text:current.text,
          aiDerived:true,officialRulesVerified:false};
        if(learned){learned.status="supported";learned.program=learnedProgram;}
        return {...current,...learnedProgram};
      }
      changed=true;restoredEffects++;
      return {...current,...learned.program,name:current.name,index:current.index,text:current.text,status:"supported"};
    });
    program.attacks=(program.attacks??[]).map(current=>{
      if(current.status==="supported")return current;
      const learned=library.effects[`attack:${normalize(current.text)}`];
      if(learned?.status!=="supported"||!learned.program){
        const candidate=learned?.aiAnalysis;
        if(candidate?.confidence!=="high"||candidate.questions?.length||
          !safeAiAttackText(current.text,candidate.executableText))return current;
        const cardWithCandidate={...card,raw:{...card.raw,attacks:(card.raw.attacks??[]).map((attack,index)=>
          index===current.index?{...attack,effect:candidate.executableText}:attack)}};
        const parsed=inspectAttacks(cardWithCandidate)[current.index];
        if(parsed?.status!=="supported"||parsed.name!==current.name||
          JSON.stringify(parsed.cost)!==JSON.stringify(current.cost)||
          JSON.stringify(parsed.printedDamage)!==JSON.stringify(current.printedDamage))return current;
        changed=true;restoredEffects++;
        if(learned){learned.status="supported";learned.program={...parsed,text:current.text,aiDerived:true,officialRulesVerified:false};}
        return {...current,...parsed,text:current.text,aiDerived:true,officialRulesVerified:false};
      }
      changed=true;restoredEffects++;
      return {...current,...learned.program,name:current.name,index:current.index,cost:current.cost,
        printedDamage:current.printedDamage,text:current.text,status:"supported"};
    });
    if(!program.trainer&&card.trainerType&&normalize(card.raw?.effect)){
      const learned=library.effects[`${card.trainerType}:${normalize(card.raw.effect)}`];
      if(learned?.status==="supported"&&learned.program){program.trainer=learned.program;changed=true;restoredEffects++;}
      else if(["item","supporter"].includes(card.trainerType)){
        const candidate=learned?.aiAnalysis;
        if(candidate?.confidence==="high"&&!candidate.questions?.length&&
          safeAiTrainerText(card.raw.effect,candidate.executableText)){
          const parsed=parseTrainerText({...card,raw:{...card.raw,effect:candidate.executableText}});
          if(parsed){program.trainer={...parsed,text:card.raw.effect,aiDerived:true,officialRulesVerified:false};
            if(learned){learned.status="supported";learned.program=program.trainer;}
            changed=true;restoredEffects++;}
        }
      }
    }
    if(!changed)continue;
    const unsupported=[...(program.abilities??[]),...(program.attacks??[])].filter(effect=>effect.status!=="supported");
    if(card.trainerType&&!program.trainer)unsupported.push({name:card.name,text:card.raw?.effect??"",status:"needs_review"});
    item.unsupported=unsupported;item.supported=unsupported.length===0;
    if(library.cards[item.officialCardId])library.cards[item.officialCardId].supported=item.supported;
    engine.deckPrograms.set(item.officialCardId,program);restoredCards++;
  }
  storage?.setItem(KEY,JSON.stringify(library));
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
