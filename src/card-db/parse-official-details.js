import { parseAbility } from "./parse-abilities.js";
import { inspectAttacks } from "./parse-effects.js";

const TYPES={grass:"Grass",fire:"Fire",water:"Water",electric:"Electric",psychic:"Psychic",fighting:"Fighting",dark:"Dark",metal:"Metal",steel:"Metal",dragon:"Dragon",none:"Colorless"};
const STAGES={"たね":"たね","1 進化":"1 進化","2 進化":"2 進化"};
const TRAINERS={"グッズ":["trainer","item"],"サポート":["trainer","supporter"],"スタジアム":["trainer","stadium"],"ポケモンのどうぐ":["trainer","tool"],"基本エネルギー":["energy",null,"basic"],"特殊エネルギー":["energy",null,"special"],"トレーナー":["trainer","unspecified"]};

export function parseOfficialCardDetails(html,expectedId,fetchedAt=new Date().toISOString()){
  const doc=new DOMParser().parseFromString(html,"text/html"),id=Number(expectedId),root=doc.querySelector(".PopupMain");
  const name=root?.querySelector("h1")?.textContent?.trim();
  if(!Number.isInteger(id)||id<=0||!name||!root)throw new Error(`公式カードID ${expectedId} のカード詳細を読み取れませんでした。`);
  const url=`https://www.pokemon-card.com/card-search/details.php/card/${id}`;
  const right=root.querySelector(".RightBox-inner"),heading=right?.querySelector("h2")?.textContent?.trim()??"";
  const image=root.querySelector(".LeftBox img.fit")?.getAttribute("src");
  const imageUrl=image?new URL(image,"https://www.pokemon-card.com").href:null;
  const typeText=right?.querySelector(".TopInfo .type")?.textContent?.trim();
  const hp=Number(right?.querySelector(".TopInfo .hp-num")?.textContent?.trim());
  const isPokemon=!!typeText&&Number.isFinite(hp)&&hp>0;
  const raw={jp_id:id,url,name,img:imageUrl};
  let cardType,trainerType=null,energyType=null;

  if(isPokemon){
    cardType="pokemon";raw.card_type="Pokémon";raw.stage=STAGES[typeText]??typeText;raw.hp=hp;
    raw.types=[...new Set([...right.querySelectorAll(".TopInfo .icon")].map(el=>el.className.match(/icon-([a-z]+)/)?.[1]).map(x=>TYPES[x]).filter(Boolean))];
    raw.tags=[];
    if(/ex$/u.test(name)){raw.tags.push("ex");raw.rule_box="ポケモンexがきぜつしたとき、相手はサイドを2枚とる。";}
    const headings=[...right.querySelectorAll("h4")];
    raw.attacks=headings.map(h=>{
      const damageNode=h.querySelector(".f_right"),damageText=damageNode?.textContent?.trim()??"";
      const damageMatch=damageText.match(/^(\\d+)([×＋+]?)$/u);
      const attackName=[...h.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join("").trim();
      const cost=[...h.querySelectorAll(".icon")].map(el=>TYPES[el.className.match(/icon-([a-z]+)/)?.[1]]).filter(Boolean);
      let effect="",next=h.nextElementSibling;
      while(next&&next.tagName!=="H4"&&next.tagName!=="H2"){if(next.tagName==="P")effect+=(effect?"\\n":"")+next.textContent.trim();next=next.nextElementSibling;}
      return {name:attackName,cost:cost.length?cost:["Void"],
        damage:damageMatch?{amount:Number(damageMatch[1]),suffix:damageMatch[2]==="＋"?"+":damageMatch[2]}:null,effect};
    }).filter(a=>a.name);
    raw.abilities=[];
    const abilityHeading=headings.find(h=>h.textContent.trim()==="特性");
    if(abilityHeading){const abilityName=abilityHeading.nextElementSibling?.textContent?.trim();const effect=abilityHeading.nextElementSibling?.nextElementSibling?.textContent?.trim();
      if(abilityName&&effect)raw.abilities.push({name:abilityName,effect});}
    const evolution=root.querySelector(".card")?.textContent?.match(/「([^」]+)」から進化/u);if(evolution)raw.evolve_from=evolution[1];
    raw.retreat=right.querySelectorAll("table .escape .icon").length;
  }else{
    const mapped=TRAINERS[heading];
    if(!mapped)throw new Error(`ID ${id} のカード種別「${heading||"不明"}」は未対応です。`);
    [cardType,trainerType,energyType]=mapped;raw.card_type=heading;
    const paragraphs=[...right.querySelectorAll(":scope > p")].map(p=>p.textContent.trim()).filter(Boolean);
    raw.effect=paragraphs.filter(text=>!/^サポート(?:は|ーターは)|^(?:グッズ|スタジアム|ポケモンのどうぐ)は/u.test(text)).join("\\n");
    if(heading==="基本エネルギー")raw.energy_type="basic";
    if(heading==="特殊エネルギー")raw.energy_type="special";
  }
  const card={officialCardId:id,name,regulation:null,cardType,trainerType,energyType,
    source:{detailUrl:url,imageUrl,fetchedAt,source:"official-card-detail"},raw,
    engine:{status:"unparsed",effects:[],handler:null,notes:["Imported from the official Japanese card detail page during deck-code loading."]}};
  card.compiled={abilities:(raw.abilities??[]).map(x=>({name:x.name,text:x.effect,...parseAbility(x.name,x.effect)})),attacks:inspectAttacks(card)};
  return card;
}

export function applyOfficialCardCompile(engine,card){
  if(card.cardType==="pokemon")engine.deckPrograms.set(card.officialCardId,{
    abilities:card.compiled?.abilities??[],attacks:card.compiled?.attacks??[],trainer:null,
    sourceText:{abilities:(card.raw.abilities??[]).map(x=>x.effect),attacks:(card.raw.attacks??[]).map(x=>x.effect??""),trainer:""}
  });
}
