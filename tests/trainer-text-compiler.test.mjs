import test from "node:test";
import assert from "node:assert/strict";
import { parseTrainerText } from "../src/card-db/parse-trainers.js";

test("compiles Bug Catching Set text variants from the printed text",()=>{
  const card={trainerType:"item",raw:{effect:"自分の山札を上から7枚見て、その中から草ポケモンと「基本草エネルギー」を合計2枚まで選び、相手に見せて、手札に加える。残りのカードは山札にもどして切る。"}};
  assert.deepEqual(parseTrainerText(card),{
    type:"item",effect:"mushitoriSet",max:2,zone:"hand",filter:"mushitoriSet",text:card.raw.effect,compiledFromText:true
  });
});

test("compiles Boss-style gust and coin-gated Catcher wording independent of card name",()=>{
  const supporter={trainerType:"supporter",raw:{effect:"相手のベンチポケモンを1匹選び、バトルポケモンと入れ替える。"}};
  const item={trainerType:"item",raw:{effect:"コインを1回投げオモテなら、相手のベンチポケモンを1匹選び、バトルポケモンと入れ替える。"}};
  assert.equal(parseTrainerText(supporter)?.effect,"boss");
  assert.equal(parseTrainerText(item)?.effect,"coinBoss");
  assert.equal(parseTrainerText({...item,raw:{effect:item.raw.effect.replace("オモテなら","ウラなら")}}),null);
});

test("compiles common coin-search text variants as a Pokémon-only search",()=>{
  const variants=[
    "コインを1回投げオモテなら、自分の山札からポケモンを1枚選び、相手に見せて、手札に加える。そして山札を切る。",
    "コインを1回投げオモテなら、自分の山札からポケモンを1枚選び、相手プレイヤーに見せてから、手札に加える。その後、山札を切る。",
    "コインを1回投げオモテなら、自分の山札のポケモンを1枚、相手プレイヤーに見せてから、手札に加える。そして山札を切る。",
    "コインを1回投げオモテなら、自分の山札にあるポケモンを1枚、相手に見せてから、手札に加える。そして山札を切る。"
  ];
  for(const effect of variants){
    const result=parseTrainerText({trainerType:"item",raw:{effect}});
    assert.equal(result?.effect,"coinSearch",effect);
    assert.equal(result.filter,"pokemon",effect);
    assert.equal(result.max,1,effect);
  }
  assert.equal(parseTrainerText({trainerType:"item",raw:{effect:variants[0].replace("オモテなら","ウラなら")}}),null);
});

test("compiles Energy Switch reprints from equivalent printed wording",()=>{
  const variants=[
    "自分のポケモンの基本エネルギーを1個、自分の別のポケモンにつけ替える。",
    "自分のポケモンの基本エネルギーを1個選び、自分の別のポケモンにつけ替える。",
    "自分のポケモンについている基本エネルギーを1個、自分の別のポケモンにつけ替える。",
    "自分の場のポケモンについている基本エネルギーを1個、自分の別のポケモンにつけ替える。"
  ];
  for(const effect of variants)
    assert.equal(parseTrainerText({trainerType:"item",raw:{effect}})?.effect,"transfer",effect);
  assert.equal(parseTrainerText({trainerType:"item",raw:{effect:variants[3].replace("基本エネルギー","エネルギー")}}),null);
});

test("compiles Potion healing and damage-counter removal as exact healing amounts",()=>{
  const variants=[
    ["自分のポケモン1匹のHPを「30」回復する。",30],
    ["自分のポケモンを1匹選び、HPを「30」回復する。",30],
    ["自分のポケモン1匹から、ダメージカウンターを2個とる。",20]
  ];
  for(const [effect,amount] of variants){
    const result=parseTrainerText({trainerType:"item",raw:{effect}});
    assert.equal(result?.effect,"heal",effect);
    assert.equal(result.amount,amount,effect);
  }
  assert.equal(parseTrainerText({trainerType:"item",raw:{effect:"自分のポケモン全員のHPを30回復する。"}}),null);
});

test("compiles Secret Box only when all four Trainer types and the three card cost are present",()=>{
  const card={trainerType:"item",raw:{effect:"このカードは、自分の手札を3枚トラッシュしなければ使えない。\n自分の山札から「グッズ」「ポケモンのどうぐ」「サポート」「スタジアム」を1枚ずつ選び、相手に見せて、手札に加える。そして山札を切る。"}};
  assert.equal(parseTrainerText(card)?.effect,"secretBox");
  assert.equal(parseTrainerText({...card,raw:{effect:card.raw.effect.replace("スタジアム","ポケモン")}}),null);
});

test("does not guess unsupported compound Trainer wording",()=>{
  assert.equal(parseTrainerText({trainerType:"item",raw:{effect:"自分のポケモンを回復し、山札を切る。"}}),null);
});
