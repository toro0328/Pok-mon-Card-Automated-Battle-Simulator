import { parseAbility } from "./parse-abilities.js";
import { inspectAttacks } from "./parse-effects.js";

const TYPE_MAP=[["草","Grass"],["炎","Fire"],["水","Water"],["雷","Electric"],["超","Psychic"],["闘","Fighting"],["悪","Dark"],["鋼","Metal"],["ドラゴン","Dragon"],["無","Colorless"]];
const ENERGY_MAP={草:"Grass",炎:"Fire",水:"Water",雷:"Electric",超:"Psychic",闘:"Fighting",悪:"Dark",鋼:"Metal",無:"Colorless"};

export function parseOfficialCardDetails(html,expectedId,fetchedAt=new Date().toISOString()){
  const doc=new DOMParser().parseFromString(html,"text/html"),id=Number(expectedId);
  const name=doc.querySelector("h1")?.textContent?.trim();
  if(!Number.isInteger(id)||id<=0||!name)throw new Error(`公式カードID ${expectedId} のカード情報を読み取れませんでした。`);
  const detailUrl=`https://www.pokemon-card.com/card-search/details.php/card/${id}`;
  const bodyText=(doc.body?.innerText??doc.body?.textContent??"");
  const text=bodyText.replace(/\\u3000/g," ").replace(/[ \\t]+/g," ").replace(/\\n+/g,"\\n").trim();
  const imageUrl=doc.querySelector('meta[property="og:image"]')?.content??doc.querySelector('img[alt="'+name+'"]')?.src??null;
  const hpMatch=text.match(/HP\\s*(\\d+)/i);
  let cardType=hpMatch?"pokemon":"trainer",trainerType=null,energyType=null;
  const raw={jp_id:id,url:detailUrl,name,img:imageUrl};
  if(hpMatch){
    raw.card_type="Pokémon";raw.hp=Number(hpMatch[1]);
    const stage=text.match(/(?:^|\\n)(たね|1\\s*進化|2\\s*進化)(?:\\n|$)/)?.[1]?.replace(/\\s/g,"")??null;
    raw.stage=stage;
    raw.types=TYPE_MAP.filter(([jp])=>new RegExp(`(?:タイプ|\\\\bType)[^\\\\n]{0,45}${jp}`).test(text)).map(([,en])=>en);
    raw.attacks=[];
    const root=doc.querySelector(".RightContent")??doc.body;
    for(const heading of root.querySelectorAll("h4")){
      const value=heading.textContent.trim(),match=value.match(/^(.+?)\\s*(\\d+)?([×＋+]?)$/u);
      if(!match)continue;
      let container=heading.parentElement;
      for(let i=0;i<2&&container?.parentElement;i++)container=container.parentElement;
      const cost=[...(container?.querySelectorAll("img")??[])].flatMap(img=>
        Object.entries(ENERGY_MAP).filter(([jp])=>(img.alt||img.src||"").includes(jp)).map(([,en])=>en));
      const block=container?.innerText??heading.parentElement?.innerText??value;
      const effect=block.split(value).slice(1).join(value).split(/弱点|抵抗力|にげる/)[0].trim();
      raw.attacks.push({name:match[1].trim(),cost:cost.length?cost:["Void"],
        damage:match[2]?{amount:Number(match[2]),suffix:match[3]==="＋"?"+":match[3]}:null,effect});
    }
    raw.retreat=Number(text.match(/にげる\\s*(?:\\n\\s*([0-4]))?/)?.[1]??0);
    const from=text.match(/「([^」]+)」から進化/);if(from)raw.evolve_from=from[1];
    const effectNodes=[...root.querySelectorAll("p, h2, h3, h4")];
    const abilityIndex=effectNodes.findIndex(node=>node.textContent.trim()==="特性");
    if(abilityIndex>=0){
      const abilityName=effectNodes[abilityIndex+1]?.textContent.trim();
      const abilityText=effectNodes[abilityIndex+2]?.textContent.trim();
      if(abilityName&&abilityText)raw.abilities=[{name:abilityName,effect:abilityText}];
    }
  }else{
    const kind=text.match(/(基本エネルギー|特殊エネルギー|グッズ|サポート|スタジアム|ポケモンのどうぐ|トレーナー)/u)?.[1];
    if(kind==="基本エネルギー"||kind==="特殊エネルギー"){
      cardType="energy";energyType=kind==="基本エネルギー"?"basic":"special";raw.card_type=kind;
    }else{
      const typeMap={"グッズ":"item","サポート":"supporter","スタジアム":"stadium","ポケモンのどうぐ":"tool","トレーナー":"unspecified"};
      trainerType=typeMap[kind]??"unspecified";raw.card_type=kind??"トレーナー";
      const heading=doc.querySelector("h1"),container=heading?.parentElement?.parentElement;
      raw.effect=(container?.innerText??text).split(name).slice(1).join(name)
        .replace(/^\\s*(?:グッズ|サポート|スタジアム|ポケモンのどうぐ|トレーナー)\\s*/u,"")
        .replace(/\\n(?:グッズ|サポート|スタジアム|ポケモンのどうぐ)は[^\\n]*$/u,"").trim();
    }
  }
  const card={officialCardId:id,name,regulation:null,cardType,trainerType,energyType,
    source:{detailUrl,imageUrl,fetchedAt,source:"official-card-detail"},raw,
    engine:{status:"unparsed",effects:[],handler:null,notes:["Fetched from official Japanese detail page while importing this deck."]}};
  card.compiled={
    abilities:(raw.abilities??[]).map(x=>({name:x.name,text:x.effect,...parseAbility(x.name,x.effect)})),
    attacks:inspectAttacks(card)
  };
  return card;
}

export function applyOfficialCardCompile(engine,card){
  if(card.cardType==="pokemon")engine.deckPrograms.set(card.officialCardId,{
    abilities:card.compiled?.abilities??[],
    attacks:card.compiled?.attacks??[],
    trainer:null,
    sourceText:{abilities:(card.raw.abilities??[]).map(x=>x.effect),
      attacks:(card.raw.attacks??[]).map(x=>x.effect??""),trainer:""}
  });
  if(card.cardType==="trainer"||card.cardType==="energy"){
    engine.deckPrograms.set(card.officialCardId,{abilities:[],attacks:[],
      trainer:card.cardType==="trainer"?engine.trainerSpec({cardId:card.officialCardId,instanceId:`compile-${card.officialCardId}`}):null,
      sourceText:{abilities:[],attacks:[],trainer:card.raw.effect??""}});
  }
}
