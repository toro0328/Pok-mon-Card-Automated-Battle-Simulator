// Compile a deliberately strict subset of Japanese Trainer text into effects
// the deterministic match engine can execute. Unknown wording is never guessed.
const number = s => ({"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"１":1,"２":2,"３":3,"４":4,"５":5,"６":6})[s] ?? null;

function targetFilter(target) {
  const s=target.trim().replace(/[「」『』]/g,"").replace(/[、。]/g,"");
  if(s==="ポケモン")return "pokemon";
  if(s==="たねポケモン")return "basicPokemon";
  if(s==="基本エネルギー")return "basicEnergy";
  if(s==="基本草エネルギー")return "basicEnergy:Grass";
  if(s==="基本炎エネルギー")return "basicEnergy:Fire";
  if(s==="基本水エネルギー")return "basicEnergy:Water";
  if(s==="基本雷エネルギー")return "basicEnergy:Electric";
  if(s==="基本超エネルギー")return "basicEnergy:Psychic";
  if(s==="基本闘エネルギー")return "basicEnergy:Fighting";
  if(s==="基本悪エネルギー")return "basicEnergy:Dark";
  if(s==="基本鋼エネルギー")return "basicEnergy:Metal";
  if(s==="エネルギー")return "energy";
  if(s==="トレーナーズ")return "trainer";
  const named=s.match(/^「?(.+?)」?のポケモン$/);
  if(named)return `namePrefix:${named[1]}の`;
  const namedExact=s.match(/^「(.+?)」$/);
  if(namedExact)return `name:${namedExact[1]}`;
  return null;
}

export function parseTrainerText(card) {
  if(!["item","supporter"].includes(card.trainerType))return null;
  const raw=String(card.raw?.effect??"").replace(/\n(?:サポーター|グッズ|ポケモンのどうぐ)[^\n]*$/u,"").trim();
  if(!raw)return null;
  if(raw==="相手のベンチポケモンを1匹選び、バトルポケモンと入れ替える。")
    return {type:card.trainerType,effect:"boss",text:raw,compiledFromText:true};
  if(raw==="コインを1回投げオモテなら、相手のベンチポケモンを1匹選び、バトルポケモンと入れ替える。")
    return {type:card.trainerType,effect:"coinBoss",text:raw,compiledFromText:true};
  if(card.trainerType==="item"){
    const pokegearVariants=new Set([
      "自分の山札を上から7枚見て、その中の「サポーター」を1枚、相手に見せてから、手札に加える。残りのカードは山札にもどし、山札を切る。",
      "自分の山札を上から7枚見る。その中にあるサポートを1枚、相手に見せてから、手札に加えてよい。残りのカードは山札にもどして切る。",
      "自分の山札を上から7枚見る。その中からサポートを1枚選び、相手に見せて、手札に加える。残りのカードは山札にもどして切る。",
      "自分の山札を上から7枚見て、その中からサポートを1枚選び、相手に見せて、手札に加える。残りのカードは山札にもどして切る。"
    ]);
    if(pokegearVariants.has(raw))return {type:"item",effect:"pokegear",max:1,filter:"supporter",text:raw,compiledFromText:true};
    const hyperBall=raw.match(/^このカードは、自分の手札を2枚トラッシュしなければ使えない。\s*自分の山札(?:からポケモンを1枚選び、|にあるポケモンを1枚、)相手に見せ(?:てから)?、手札に加える。そして山札を切る。$/u);
    if(hyperBall)return {type:"item",effect:"search",filter:"pokemon",max:1,cost:2,zone:"hand",destination:"hand",text:raw,compiledFromText:true};
    if(/^自分の(?:場の)?ポケモン(?:についている|の)?基本エネルギーを1個(?:選び、|、)?自分の別のポケモンにつけ替える。$/u.test(raw))
      return {type:"item",effect:"transfer",text:raw,compiledFromText:true};
    let healing=raw.match(/^自分のポケモン(?:1匹のHPを|を1匹選び、HPを)「?([0-9０-９]+)」?回復する。$/u);
    if(healing){
      const amount=number(healing[1])??Number(healing[1]);
      if(amount>0)return {type:"item",effect:"heal",amount,text:raw,compiledFromText:true};
    }
    healing=raw.match(/^自分のポケモン1匹から、ダメージカウンターを([0-9０-９]+)個とる。$/u);
    if(healing){
      const amount=number(healing[1])??Number(healing[1]);
      if(amount>0)return {type:"item",effect:"heal",amount:amount*10,text:raw,compiledFromText:true};
    }
    const coinPokemonSearch=[
      /^コインを1回投げオモテなら、自分の山札からポケモンを([0-9０-９]+)枚選び、相手(?:プレイヤー)?に見せ(?:てから|て)、手札に加える。(?:そして|その後、)山札を切る。$/u,
      /^コインを1回投げオモテなら、自分の山札(?:にある|の)ポケモンを([0-9０-９]+)枚、相手(?:プレイヤー)?に見せ(?:てから|て)、手札に加える。(?:そして|その後、)山札を切る。$/u
    ].map(pattern=>raw.match(pattern)).find(Boolean);
    if(coinPokemonSearch){
      const max=number(coinPokemonSearch[1]);
      if(max)return {type:"item",effect:"coinSearch",max,zone:"hand",destination:"hand",filter:"pokemon",
        text:raw,compiledFromText:true};
    }
  }
  if(card.trainerType==="item"&&/(自分の)?山札を?上から7枚見て/u.test(raw)&&
      /(草|Grass)ポケモン/u.test(raw)&&/基本(草|Grass)エネルギー/u.test(raw)&&
      /合計2枚まで/u.test(raw)&&/手札に加える/u.test(raw)&&/(残り|のこり).*(山札|デッキ).*(切|シャッフル)/u.test(raw))
    return {type:"item",effect:"mushitoriSet",max:2,zone:"hand",filter:"mushitoriSet",text:raw,compiledFromText:true};
  if(card.trainerType==="item"&&/手札を3枚トラッシュ/u.test(raw)&&
      /グッズ/u.test(raw)&&/ポケモンのどうぐ/u.test(raw)&&/サポート/u.test(raw)&&/スタジアム/u.test(raw)&&
      /1枚ずつ/u.test(raw)&&/手札に加える/u.test(raw)&&/山札を切る/u.test(raw))
    return {type:"item",effect:"secretBox",cost:3,max:4,zone:"hand",filter:"secretBox",text:raw,compiledFromText:true};
  let m=raw.match(/^自分の山札を([0-9０-９]+)枚引く。$/u);
  if(m){const count=number(m[1]);return count?{type:card.trainerType,effect:"draw",count,text:raw,compiledFromText:true}:null;}
  m=raw.match(/^自分の山札から(.+?)を([0-9０-９]+)枚(まで)?選び、(?:相手に見せて、)?手札に加える。そして山札を切る。$/u);
  if(!m)m=raw.match(/^自分の山札から(.+?)を([0-9０-９]+)枚(まで)?選び、(?:相手に見せて、)?ベンチに出す。そして山札を切る。$/u);
  if(!m)m=raw.match(/^自分の山札から(.+?)を([0-9０-９]+)枚(まで)?選び、(?:相手に見せて、)?トラッシュする。そして山札を切る。$/u);
  if(m){
    const filter=targetFilter(m[1]),max=number(m[2]);
    if(!filter||!max)return null;
    const destination=raw.includes("ベンチに出す")?"bench":raw.includes("トラッシュする")?"trash":"hand";
    if(destination==="bench"&&!filter.startsWith("basicPokemon")&&!filter.startsWith("name:"))return null;
    if(destination==="trash")return null;
    return {type:card.trainerType,effect:"search",filter,max,optional:!!m[3],destination,
      zone:destination==="bench"?"bench":"hand",text:raw,compiledFromText:true};
  }
  return null;
}
