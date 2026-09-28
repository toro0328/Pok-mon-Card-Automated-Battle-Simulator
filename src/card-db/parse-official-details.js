import { parseAbility } from "./parse-abilities.js";
import { inspectAttacks } from "./parse-effects.js";

const TYPE_MAP=[["草","Grass"],["炎","Fire"],["水","Water"],["雷","Electric"],["超","Psychic"],["闘","Fighting"],["悪","Dark"],["鋼","Metal"],["ドラゴン","Dragon"],["無","Colorless"]];
const ENERGY_MAP={草:"Grass",炎:"Fire",水:"Water",雷:"Electric",超:"Psychic",闘:"Fighting",悪:"Dark",鋼:"Metal",無:"Colorless"};

export function parseOfficialCardDetails(html,expectedId,fetchedAt=new Date().toISOString()){
  const doc=new DOMParser().parseFromString(html,"text/html"),id=Number(expectedId);
  const name=doc.querySelector("h1")?.textContent?.trim();
  if(!Number.isInteger(id)||id<=0||!name)throw new Error(`公式カードID ${expectedId} のカード情報を読み取れませんでした。`);
  const detailUrl=`https://www.pokemon-card.com/card-search/details.php/card/${id}`;
  const bodyText=doc.body?.innerText??doc.body?.textContent??"";
  const text=bodyText.replaceAll("　"," ").replace(/[ \\t]+/g," ").replace(/\\n+/g,"\\n").trim();
  const imageUrl=doc.querySelector('meta[property="og:image"]')?.content??doc.querySelector(`img[alt="${name}"]`)?.src??null;
  const hpMatch=text.match(/HP\\s*(\\d+)/i);
  let cardType=hpMatch?"pokemon":"trainer",trainerType=null,energyType=null;
  const raw={jp_id:id,url:detailUrl,name,img:imageUrl};
  if(hpMatch){
    raw.card_type="Pokémon";raw.hp=Number(hpMatch[1]);
    raw.stage=text.match(/(?:^|\\n)(たね|1\\s*進化|2\\s*進化)(?:\\n|$)/)?.[1]?.replace(/\\s/g,"")??null;
    raw.types=TYPE_MAP.filter(([jp])=>text.includes(`タイプ\\n${jp}`)||new RegExp(`タイプ.{0,12}${jp}`).test(text)).map(([,en])=>en);
    raw.attacks=[];
    const root=doc.querySelector(".RightContent")??doc.body;
    const headings=[...root.querySelectorAll("h4")];
    for(let i=0;i<headings.length;i++){
      const value=headings[i].textContent.trim(),m=value.match(/^(.+?)\\s*(\\d+)?([×＋+]?)$/u);
      if(!m)continue;
      const next=headings[i+1];
      const section=headings[i].parentElement?.parentElement;
      const effect=section?.innerText?.split(value).slice(1).join(value).split(/弱点|抵抗力|にげる/)[0].trim()??"";
      const images=[...(headings[i].parentElement?.querySelectorAll("img")??[])];
      const cost=images.flatMap(img=>Object.entries(ENERGY_MAP).filter(([jp])=>(img.alt+" "+img.src).includes(jp)).map(([,en])=>en));
      raw.attacks.push({name:m[1].trim(),cost:cost.length?cost:["Void"],damage:m[2]?{amount:Number(m[2]),suffix:m[3]==="＋"?"+":m[3]}:null,effect});
    }
    raw.retreat=Number(text.match(/にげる[^0-9]{0,30}([0-4])(?:個)?/u)?.[1]??0);
    const from=text.match(/「([^」]+)」から進化/u);if(from)raw.evolve_from=from[1];
    const abilityName=text.match(/特性\\n([^\\n]+)\\n/);
    if(abilityName){
      const at=text.indexOf(abilityName[0]),tail=text.slice(at+abilityName[0].length);
      const effect=tail.split(/\\n(?:ワザ|弱点|抵抗力|にげる)/)[0].trim();
      if(effect)raw.abilities=[{name:abilityName[1].trim(),effect}];
    }
  }else{
    const kind=text.match(/(基本エネルギー|特殊エネルギー|グッズ|サポート|スタジアム|ポケモンのどうぐ|トレーナー)/u)?.[1];
    if(kind==="基本エネルギー"||kind==="特殊エネルギー"){
      cardType="energy";energyType=kind==="基本エネルギー"?"basic":"special";raw.card_type=kind;
    }else{
      const types={"グッズ":"item","サポート":"supporter","スタジアム":"stadium","ポケモンのどうぐ":"tool","トレーナー":"unspecified"};
      trainerType=types[kind]??"unspecified";raw.card_type=kind??"トレーナー";
      const section=doc.querySelector(".RightContent")??doc.body;
      const lines=(section.innerText??text).split("\\n").map(x=>x.trim()).filter(Boolean);
      const at=lines.indexOf(name);
      raw.effect=lines.slice(at+1).filter(x=>!["グッズ","サポート","スタジアム","ポケモンのどうぐ","トレーナー"].includes(x))
        .filter(x=>!/^サポーターは|^グッズは|^スタジアムは|^ポケモンのどうぐは/u.test(x)).join("\\n").trim();
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
    abilities:card.compiled?.abilities??[],attacks:card.compiled?.attacks??[],trainer:null,
    sourceText:{abilities:(card.raw.abilities??[]).map(x=>x.effect),attacks:(card.raw.attacks??[]).map(x=>x.effect??""),trainer:""}
  });
}
