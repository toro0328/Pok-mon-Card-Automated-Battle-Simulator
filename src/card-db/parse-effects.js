// Exact text patterns only. Callers must keep engine.status as "unparsed"
// until the whole card and the corresponding game rules are implemented.
const PATTERNS = [
  {
    expression: /^自分の山札から基本エネルギーを([1-9][0-9]*)枚まで選び、ベンチポケモンに好きなようにつける。そして山札を切る。$/,
    convert: match => [{ type: "SEARCH_BASIC_ENERGY_ATTACH_BENCH", max: Number(match[1]) }]
  },
  {
    expression: /^このポケモンをねむりにする。$/,
    convert: () => [{ type: "APPLY_STATUS", target: "ATTACKING_POKEMON", status: "ねむり" }]
  },
  {
    expression: /^このポケモンをこんらんにする。$/,
    convert: () => [{type:"APPLY_STATUS",target:"ATTACKING_POKEMON",status:"こんらん"}]
  },

  {
    expression: /^自分の山札を([1-9][0-9]*)枚引く。$/,
    convert: match => [{ type: "DRAW", player: "SELF", count: Number(match[1]) }]
  },
  {
    expression: /^コインを1回投げオモテなら、相手のバトルポケモンを(どく|やけど|ねむり|マヒ|こんらん)にする。$/,
    convert: match => [{type:"COIN_APPLY_STATUS",target:"DEFENDING_ACTIVE",status:match[1]}]
  },
  {
    expression: /^コインを1回投げオモテなら、相手のバトルポケモンを((?:(?:どく|やけど|ねむり|マヒ|こんらん)と){1,4}(?:どく|やけど|ねむり|マヒ|こんらん))にする。$/,
    convert: match => {
      const statuses=match[1].split("と"),recoverable=statuses.filter(status=>["ねむり","マヒ","こんらん"].includes(status));
      if(new Set(statuses).size!==statuses.length||recoverable.length>1)return null;
      return [{type:"COIN_APPLY_STATUSES",target:"DEFENDING_ACTIVE",statuses}];
    }
  },
  {
    expression: /^相手のバトルポケモンを(どく|やけど|ねむり|マヒ|こんらん)にする。$/,
    convert: match => [{ type: "APPLY_STATUS", target: "DEFENDING_ACTIVE", status: match[1] }]
  },
  {
    expression: /^相手のバトルポケモンを((?:(?:どく|やけど|ねむり|マヒ|こんらん)と){1,4}(?:どく|やけど|ねむり|マヒ|こんらん))にする。$/,
    convert: match => {
      const statuses=match[1].split("と"),recoverable=statuses.filter(status=>["ねむり","マヒ","こんらん"].includes(status));
      if(new Set(statuses).size!==statuses.length||recoverable.length>1)return null;
      return statuses.map(status=>({type:"APPLY_STATUS",target:"DEFENDING_ACTIVE",status}));
    }
  },
  {
    expression: /^このポケモンにも([1-9][0-9]*)ダメージ。$/,
    convert: match => [{ type: "DAMAGE", target: "ATTACKING_POKEMON", amount: Number(match[1]), source: "ATTACK_EFFECT" }]
  },
  {
    expression: /^相手の山札を上から([1-9][0-9]*)枚トラッシュする。$/,
    convert: match => [{type:"MILL_OPPONENT_DECK",count:Number(match[1])}]
  },
  {
    expression: /^自分のトラッシュから「([^」]+)」を([1-9][0-9]*)枚まで選び、ベンチに出す。$/,
    convert: match => [{type:"SEARCH_TRASH_TO_BENCH",name:match[1],max:Number(match[2])}]
  },
  {
    expression: /^自分のトラッシュからポケモンを1枚選び、相手に見せて、手札に加える。$/,
    convert: () => [{type:"SEARCH_TRASH_TO_HAND",filter:"pokemon",max:1}]
  },
  {
    expression: /^のぞむなら、自分の山札から好きなカードを1枚選び、手札に加える。そして山札を切る。$/,
    convert: () => [{type:"SEARCH_DECK",max:1,filter:"any",destination:"HAND",optional:true}]
  },
  {
    expression: /^自分のトラッシュから「基本Fightingエネルギー」を([1-9][0-9]*)枚まで選び、ベンチポケモンに好きなようにつける。$/,
    convert: match => [{type:"ATTACH_BASIC_FIGHTING_FROM_TRASH_TO_BENCH",max:Number(match[1])}]
  },
  {
    expression: /^のぞむなら、このポケモンについているエネルギーを3個選び、山札にもどして切る。その場合、相手のベンチポケモン1匹にも、120ダメージ。［ベンチは弱点・抵抗力を計算しない。］$/,
    convert: () => [{type:"OPTIONAL_RETURN_THREE_ENERGY_FOR_BENCH_DAMAGE"},{type:"DAMAGE_CHOSEN_OPPONENT_BENCH",amount:120}]
  },
  {
    expression: /^のぞむなら、このポケモンについているSteelエネルギーを3個トラッシュし、([1-9][0-9]*)ダメージ追加。$/,
    convert: match => [{type:"OPTIONAL_DISCARD_THREE_STEEL_ENERGY_FOR_DAMAGE",amount:Number(match[1])}]
  },
  {
    expression: /^のぞむなら、自分の手札が([1-9][0-9]*)枚になるように、山札を引く。$/,
    convert: match => [{type:"DRAW_UNTIL_HAND_SIZE",player:"SELF",size:Number(match[1])}]
  },
  {
    expression: /^相手のバトルポケモンに、ダメカンを([1-9][0-9]*)個のせる。$/,
    convert: match => [{type:"PLACE_DAMAGE_COUNTERS",target:"DEFENDING_ACTIVE",count:Number(match[1])}]
  },
  {
    expression: /^自分の手札をすべてトラッシュし、山札を([1-9][0-9]*)枚引く。$/,
    convert: match => [{type:"DISCARD_HAND_DRAW",count:Number(match[1])}]
  },
  {
    expression: /^このポケモンにのっているダメカンの数×([1-9][0-9]*)ダメージ。$/,
    convert: match => [{type:"SET_DAMAGE",basis:"OWN_DAMAGE_COUNTERS",perCounter:Number(match[1])}]
  },
  {
    expression: /^相手のトラッシュにある基本エネルギーの枚数×([1-9][0-9]*)ダメージ。$/,
    convert: match => [{type:"SET_DAMAGE",basis:"OPPONENT_DISCARD_BASIC_ENERGY_COUNT",perEnergy:Number(match[1])}]
  },
  {
    expression: /^次の相手の番、このポケモンが受けるワザのダメージは「[－-]([1-9][0-9]*)」される。$/,
    convert: match => [{type:"REDUCE_INCOMING_ATTACK_DAMAGE_NEXT_TURN",amount:Number(match[1])}]
  },
  {
    expression: /^次の相手の番、このワザを受けたポケモンが使うワザのダメージは「[－-]([1-9][0-9]*)」される。$/,
    convert: match => [{type:"REDUCE_INCOMING_ATTACK_DAMAGE_NEXT_TURN",target:"DEFENDING_ACTIVE",amount:Number(match[1])}]
  },
  {
    expression: /^次の自分の番、このポケモンは「([^」]+)」が使えない。$/,
    convert: match => [{type:"PREVENT_SAME_ATTACK_NEXT_TURN",attackName:match[1]}]
  },
  {
    expression: /^このワザを使うためのエネルギーより、([1-9][0-9]*)個多くエネルギーがついているなら、([1-9][0-9]*)ダメージ追加。$/,
    convert: match => [{type:"MODIFY_DAMAGE",basis:"ATTACHED_ENERGY_EXCEEDS_ATTACK_COST",extra:Number(match[1]),amount:Number(match[2])}]
  },
  {
    expression: /^自分のベンチに「([^」]+)」がいないなら、このワザは失敗。$/,
    convert: match => [{type:"REQUIRE_OWN_BENCH_POKEMON",name:match[1]}]
  },
  {
    expression: /^次の相手の番、相手は手札からグッズを出して使えない。$/,
    convert: () => [{ type: "LOCK_ITEM_FROM_HAND", target: "OPPONENT", duration: "NEXT_OPPONENT_TURN" }]
  },
  {
    expression: /^おたがいのバトルポケモンについているエネルギーの数×([1-9][0-9]*)ダメージ追加。$/,
    convert: match => [{ type: "MODIFY_DAMAGE", basis: "BOTH_ACTIVE_ATTACHED_ENERGY_COUNT",
      perEnergy: Number(match[1]) }]
  },
  {
    expression: /^自分のベンチポケモンの数×([1-9][0-9]*)ダメージ。$/,
    convert: match => [{ type: "SET_DAMAGE", basis: "OWN_BENCH_COUNT", perPokemon: Number(match[1]) }]
  },
  {
    expression: /^おたがいのベンチポケモンの数×([1-9][0-9]*)ダメージ追加。$/,
    convert: match => [{ type: "MODIFY_DAMAGE", basis: "BOTH_BENCH_COUNT", perPokemon: Number(match[1]) }]
  },
  {
    expression: /^相手の場の「ポケモンex」の数×([1-9][0-9]*)ダメージ。$/,
    convert: match => [{ type: "SET_DAMAGE", basis: "OPPONENT_EX_COUNT", perPokemon: Number(match[1]) }]
  },
  {
    expression: /^自分のトラッシュに、特性「([^」]+)」を持つポケモンが([1-9][0-9]*)枚以上あるなら、([1-9][0-9]*)ダメージ追加。$/,
    convert: match => [{type:"MODIFY_DAMAGE",basis:"TRASH_POKEMON_WITH_ABILITY",abilityName:match[1],count:Number(match[2]),amount:Number(match[3])}]
  },
  {
    expression: /^相手のバトルポケモンが「ポケモンex」なら、([1-9][0-9]*)ダメージ追加。$/,
    convert: match => [{ type: "MODIFY_DAMAGE", basis: "DEFENDER_IS_EX", amount: Number(match[1]) }]
  },
  {
    expression: /^相手がすでにとったサイドの枚数×([1-9][0-9]*)ダメージ(追加)?。$/,
    convert: match => [{ type: match[2] ? "MODIFY_DAMAGE" : "SET_DAMAGE",
      basis: "OPPONENT_PRIZES_TAKEN", perPrize: Number(match[1]) }]
  },
  {
    expression: /^このワザのダメージは、相手のバトルポケモンにかかっている効果を計算しない。$/,
    convert: () => [{ type: "IGNORE_DEFENDER_ATTACK_EFFECTS" }]
  },
  {
    expression: /^このワザのダメージは弱点・抵抗力を計算しない。$/,
    convert: () => [{ type: "IGNORE_WEAKNESS_RESISTANCE" }]
  },
  {
    expression: /^このワザのダメージは抵抗力を計算しない。$/,
    convert: () => [{ type: "IGNORE_RESISTANCE" }]
  },
  {
    expression: /^このワザのダメージは、弱点・抵抗力と、相手のバトルポケモンにかかっている効果を計算しない。$/,
    convert: () => [{ type: "IGNORE_DEFENDER_ATTACK_EFFECTS", ignoreWeaknessResistance: true }]
  },
  {
    expression: /^このポケモンをベンチポケモンと入れ替える。$/,
    convert: () => [{ type: "SWITCH_SELF" }]
  },
  {
    expression: /^相手のバトルポケモンをベンチポケモンと入れ替える。［バトル場に出すポケモンは相手が選ぶ。］$/,
    convert: () => [{type:"SWITCH_OPPONENT_CHOICE"}]
  },
  {
    expression: /^ダメカン([1-9][0-9]*)個を、相手のベンチポケモンに好きなようにのせる。$/,
    convert: match => [{ type: "PLACE_DAMAGE_COUNTERS_ON_OPPONENT_BENCH", count: Number(match[1]) }]
  },
  {
    expression: /^自分のポケモン全員についているFireとElectricエネルギーの数×([1-9][0-9]*)ダメージ。$/,
    convert: match => [{ type: "SET_DAMAGE", basis: "OWN_FIELD_FIRE_ELECTRIC_ENERGY_COUNT", perEnergy: Number(match[1]) }]
  },
  {
    expression: /^自分のポケモン全員のHPを、それぞれ「([1-9][0-9]*)」回復する。$/,
    convert: match => [{ type: "HEAL_OWN_FIELD", amount: Number(match[1]) }]
  },
  {
    expression: /^自分の山札からポケモンを1枚選び、相手に見せて、手札に加える。そして山札を切る。$/,
    convert: () => [{type:"SEARCH_DECK",max:1,filter:"pokemon"}]
  },
  {
    expression: /^のぞむなら、自分の山札から好きなカードを2枚まで選び、手札に加える。そして山札を切る。$/,
    convert: () => [{type:"SEARCH_DECK",max:2,filter:"any"}]
  },
  {
    expression: /^コインを1回投げウラなら、このワザは失敗。$/,
    convert: () => [{type:"COIN_FAIL_IF_TAILS"}]
  },
  {
    expression: /^コインを1回投げオモテなら、([1-9][0-9]*)ダメージ追加。$/,
    convert: match => [{type:"COIN_BONUS",perCoin:Number(match[1])}]
  },
  {
    expression: /^コインを([1-9][0-9]*)回投げ、オモテの数×([1-9][0-9]*)ダメージ。$/,
    convert: match => [{type:"COIN_DAMAGE",count:Number(match[1]),perCoin:Number(match[2])}]
  },
  {
    expression: /^自分の山札を下から([1-9][0-9]*)枚オモテにして、その中にある、ワザ「([^」]+)」を持つポケモンの枚数×([1-9][0-9]*)ダメージ。オモテにしたポケモンは山札にもどして切る。残りのカードはトラッシュする。$/,
    convert: match => [{type:"SET_DAMAGE",basis:"DECK_BOTTOM_POKEMON_WITH_ATTACK",attackName:match[2],perPokemon:Number(match[3])},
      {type:"RESOLVE_DECK_BOTTOM_ATTACK_REVEAL",count:Number(match[1]),attackName:match[2]}]
  },
  {
    expression: /^自分の山札から「([^」]+)」を([1-9][0-9]*)枚まで選び、ベンチに出す。そして山札を切る。$/,
    convert: match => [{type:"SEARCH_DECK",max:Number(match[2]),filter:"exactName",name:match[1],destination:"BENCH"}]
  },
  {
    expression: /^場にスタジアムが出ていないなら、このワザは失敗。$/,
    convert: () => [{type:"REQUIRE_STADIUM_IN_PLAY"}]
  },
  {
    expression: /^自分の山札から基本エネルギーを([1-9][0-9]*)枚まで選び、相手に見せて、手札に加える。そして山札を切る。$/,
    convert: match => [{type:"SEARCH_DECK",max:Number(match[1]),filter:"basicEnergy",destination:"HAND"}]
  },
  {
    expression: /^自分のベンチの「Nのポケモン」が持つワザを1つ選び、このワザとして使う。$/,
    convert: () => [{type:"COPY_BENCH_N_ATTACK"}]
  },
  {
    expression: /^自分の山札からたねポケモンを([1-9][0-9]*)枚まで選び、ベンチに出す。そして山札を切る。$/,
    convert: match => [{type:"SEARCH_DECK",max:Number(match[1]),filter:"basicPokemon",destination:"BENCH"}]
  },
  {
    expression: /^このポケモンのHPを「([1-9][0-9]*)」回復する。$/,
    convert: match => [{type:"HEAL",target:"ATTACKING_POKEMON",amount:Number(match[1])}]
  },
  {
    expression: /^相手のバトルポケモンに与えたダメージぶん、このポケモンのHPを回復する。$/,
    convert: () => [{type:"HEAL_DAMAGE_DEALT",target:"ATTACKING_POKEMON"}]
  },
  {
    expression: /^このポケモンについているエネルギーを([1-9][0-9]*)個選び、トラッシュする。$/,
    convert: match => [{type:"DISCARD_ATTACHED",target:"ATTACKING_POKEMON",count:Number(match[1])}]
  },
  {
    expression: /^このポケモンについているエネルギーを、すべてトラッシュする。$/,
    convert: () => [{type:"DISCARD_ATTACHED",target:"ATTACKING_POKEMON",count:"ALL"}]
  },
  {
    expression: /^このポケモンについているエネルギーを1個選び、手札にもどす。$/,
    convert: () => [{type:"RETURN_ATTACHED_ENERGY_TO_HAND",target:"ATTACKING_POKEMON",count:1}]
  },
  {
    expression: /^相手のバトルポケモンについているエネルギーを1個選び、トラッシュする。$/,
    convert: () => [{type:"DISCARD_OPPONENT_ENERGY",count:1}]
  },
  {
    expression: /^次の相手の番、このワザを受けたポケモンは、にげられない。$/,
    convert: () => [{type:"PREVENT_RETREAT_NEXT_TURN",target:"DEFENDING_ACTIVE"}]
  },
  {
    expression: /^次の相手の番、このワザを受けたポケモンは、ワザが使えない。$/,
    convert: () => [{type:"PREVENT_ATTACK_NEXT_TURN",target:"DEFENDING_ACTIVE"}]
  },
  {
    expression: /^コインを1回投げオモテなら、相手のバトルポケモンについているエネルギーを1個選び、トラッシュする。$/,
    convert: () => [{type:"COIN_DISCARD_ENERGY"}]
  },
  {
    expression: /^相手のバトルポケモンについているエネルギーの数×([1-9][0-9]*)ダメージ追加。$/,
    convert: match => [{type:"MODIFY_DAMAGE",basis:"DEFENDING_ATTACHED_ENERGY_COUNT",perEnergy:Number(match[1])}]
  },
  {
    expression: /^ウラが出るまでコインを投げ、オモテの数×([1-9][0-9]*)ダメージ追加。$/,
    convert: match => [{type:"MODIFY_DAMAGE",basis:"COIN_UNTIL_TAILS",perHeads:Number(match[1])}]
  },
  {
    expression: /^このワザは、後攻プレイヤーの最初の番には使えない。自分のベンチポケモンの数×([1-9][0-9]*)ダメージ。$/,
    convert: match => [{type:"SET_DAMAGE",basis:"OWN_BENCH_COUNT",perPokemon:Number(match[1]),noFirstSecondTurn:true}]
  },
  {
    expression: /^次の相手の番、このポケモンはたねポケモン（Colorlessポケモンをのぞく）からワザのダメージを受けない。$/,
    convert: () => [{type:"PREVENT_BASIC_NON_COLORLESS_DAMAGE_NEXT_OPPONENT_TURN"}]
  },
  {
    expression: /^このポケモンと、ついているすべてのカードを、手札にもどす。$/,
    convert: () => [{type:"RETURN_SELF_TO_HAND"}]
  },
  {
    expression: /^次の自分の番、このポケモンはワザが使えない。$/,
    convert: () => [{type:"PREVENT_SELF_ATTACK_NEXT_TURN"}]
  },
  {
    expression: /^相手のポケモン1匹に、([1-9][0-9]*)ダメージ。(?:［ベンチは弱点・抵抗力を計算しない。］|ベンチは弱点・抵抗力を計算しない。)?$/,
    convert: match => [{type:"DAMAGE_CHOSEN_OPPONENT",amount:Number(match[1])}]
  },
  {
    expression: /^このポケモンについている基本エネルギーの数×([1-9][0-9]*)ダメージ。$/,
    convert: match => [{type:"SET_DAMAGE",basis:"OWN_ACTIVE_BASIC_ENERGY_COUNT",perEnergy:Number(match[1])}]
  },
  {
    expression: /^このポケモンについている特殊エネルギーの枚数×([1-9][0-9]*)ダメージ。$/,
    convert: match => [{type:"SET_DAMAGE",basis:"OWN_ACTIVE_SPECIAL_ENERGY_COUNT",perEnergy:Number(match[1])}]
  },
  {
    expression: /^自分の手札の枚数×([1-9][0-9]*)ダメージ。$/,
    convert: match => [{type:"SET_DAMAGE",basis:"OWN_HAND_COUNT",perCard:Number(match[1])}]
  },
  {
    expression: /^相手の手札の枚数×([1-9][0-9]*)ダメージ。$/,
    convert: match => [{type:"SET_DAMAGE",basis:"OPPONENT_HAND_COUNT",perCard:Number(match[1])}]
  },
  {
    expression: /^自分の場のポケモンの数×([1-9][0-9]*)ダメージ。$/,
    convert: match => [{type:"SET_DAMAGE",basis:"OWN_FIELD_POKEMON_COUNT",perPokemon:Number(match[1])}]
  },
  {
    expression: /^自分の場のダメカンがのっているポケモンの数×([1-9][0-9]*)ダメージ。$/,
    convert: match => [{type:"SET_DAMAGE",basis:"OWN_FIELD_DAMAGED_POKEMON_COUNT",perPokemon:Number(match[1])}]
  },
  {
    expression: /^自分の場の進化ポケモンの数×([1-9][0-9]*)ダメージ追加。$/,
    convert: match => [{type:"MODIFY_DAMAGE",basis:"OWN_FIELD_EVOLVED_POKEMON_COUNT",perPokemon:Number(match[1])}]
  },
  {
    expression: /^自分のベンチポケモンの数×([1-9][0-9]*)ダメージ。$/,
    convert: match => [{type:"SET_DAMAGE",basis:"OWN_BENCH_COUNT",perPokemon:Number(match[1])}]
  },
  {
    expression: /^相手のベンチポケモンの数×([1-9][0-9]*)ダメージ。$/,
    convert: match => [{type:"SET_DAMAGE",basis:"OPPONENT_BENCH_COUNT",perPokemon:Number(match[1])}]
  },
  {
    expression: /^相手のバトルポケモンのにげるためのエネルギーの数×([1-9][0-9]*)ダメージ追加。$/,
    convert: match => [{type:"MODIFY_DAMAGE",basis:"DEFENDER_RETREAT_COST",perEnergy:Number(match[1])}]
  },
  {
    expression: /^相手のバトルポケモンにダメカンがのっているなら、([1-9][0-9]*)ダメージ追加。$/,
    convert: match => [{type:"MODIFY_DAMAGE",basis:"DEFENDER_HAS_DAMAGE_COUNTERS",amount:Number(match[1])}]
  },
  {
    expression: /^相手のバトルポケモンにのっているダメカンの数×([1-9][0-9]*)ダメージ追加。$/,
    convert: match => [{type:"MODIFY_DAMAGE",basis:"OPPONENT_ACTIVE_DAMAGE_COUNTERS",perCounter:Number(match[1])}]
  },
  {
    expression: /^相手のポケモン全員にのっているダメカンの数×([1-9][0-9]*)ダメージ追加。$/,
    convert: match => [{type:"MODIFY_DAMAGE",basis:"OPPONENT_FIELD_DAMAGE_COUNTERS",perCounter:Number(match[1])}]
  },
  {
    expression: /^相手のバトルポケモンが受けている特殊状態の数×([1-9][0-9]*)ダメージ。$/,
    convert: match => [{type:"SET_DAMAGE",basis:"DEFENDER_SPECIAL_CONDITION_COUNT",perCondition:Number(match[1])}]
  },
];

function parseSingle(text) {
  const match=PATTERNS.map(pattern=>[pattern,text.match(pattern.expression)])
    .find(([,result])=>result!==null);
  return match?match[0].convert(match[1]):null;
}

const CHOICE_EFFECTS=new Set(["SEARCH_DECK","SEARCH_TRASH_TO_BENCH","ATTACH_BASIC_FIGHTING_FROM_TRASH_TO_BENCH","OPTIONAL_RETURN_THREE_ENERGY_FOR_BENCH_DAMAGE","SWITCH_OPPONENT_CHOICE","COIN_DISCARD_ENERGY","DISCARD_ATTACHED",
  "DISCARD_OPPONENT_ENERGY","DISCARD_OPPONENT_HAND","SWITCH_SELF","SWITCH_OPPONENT_CHOICE","RETURN_SELF_TO_HAND",
  "SEARCH_TRASH_TO_HAND","RETURN_ATTACHED_ENERGY_TO_HAND",
  "PLACE_DAMAGE_COUNTERS_ON_OPPONENT_BENCH"]);

export function parseEffectText(text) {
  if (text === "") return { recognized: true, effects: [] };
  if (typeof text !== "string") return { recognized: false, effects: [] };
  const exact=parseSingle(text);
  if(exact)return {recognized:true,effects:exact};
  const clauses=text.match(/[^。]+。(?:［[^］]*］)?/g);
  if(!clauses||clauses.length<2||clauses.join("")!==text)return {recognized:false,effects:[]};
  const effects=[];
  for(const clause of clauses){
    const parsed=parseSingle(clause);
    if(!parsed)return {recognized:false,effects:[]};
    effects.push(...parsed);
  }
  if(effects.filter(effect=>CHOICE_EFFECTS.has(effect.type)).length>1)
    return {recognized:false,effects:[]};
  // This failure instruction must be the only operation; its timing is before damage/effects.
  if(effects.some(effect=>effect.type==="COIN_FAIL_IF_TAILS")&&effects.length!==1)
    return {recognized:false,effects:[]};
  return {recognized:true,effects};
}

export function inspectAttacks(card) {
  if (card.cardType !== "pokemon" || !Array.isArray(card.raw?.attacks)) return [];
  return card.raw.attacks.map((attack, index) => {
    const parsed = parseEffectText(attack.effect ?? "");
    const cost = attack.cost;
    const damage = attack.damage;
    const validCost = Array.isArray(cost) && cost.every((type, i) =>
      typeof type === "string" &&
      (type === "Void" ? cost.length === 1 && i === 0 :
        ["Colorless", "Grass", "Fire", "Water", "Electric", "Psychic", "Fighting", "Dark", "Metal", "Steel", "Dragon"].includes(type)));
    const noDamageTypes=new Set(["SEARCH_DECK","SEARCH_TRASH_TO_HAND","SEARCH_TRASH_TO_BENCH","ATTACH_BASIC_FIGHTING_FROM_TRASH_TO_BENCH","DAMAGE_CHOSEN_OPPONENT","APPLY_STATUS","COIN_APPLY_STATUS","COIN_APPLY_STATUSES","HEAL","DRAW","DRAW_UNTIL_HAND_SIZE","DISCARD_HAND_DRAW","DAMAGE","SET_DAMAGE","COIN_FAIL_IF_TAILS","IGNORE_RESISTANCE","RETURN_ATTACHED_ENERGY_TO_HAND","COPY_BENCH_N_ATTACK",
      "DISCARD_ATTACHED","DISCARD_OPPONENT_ENERGY","MILL_OPPONENT_DECK","PLACE_DAMAGE_COUNTERS","SEARCH_BASIC_ENERGY_ATTACH_BENCH","PREVENT_RETREAT_NEXT_TURN","PREVENT_ATTACK_NEXT_TURN","PREVENT_SAME_ATTACK_NEXT_TURN","SWITCH_SELF","REQUIRE_STADIUM_IN_PLAY"]);
    const noPrintedDamage=damage===null&&parsed.effects.length>0&&parsed.effects.every(x=>noDamageTypes.has(x.type));
    const bonus=parsed.effects.find(x=>x.type==="MODIFY_DAMAGE"||x.type==="COIN_BONUS"||
      x.type==="OPTIONAL_DISCARD_THREE_STEEL_ENERGY_FOR_DAMAGE");
    const multiplier=parsed.effects.find(x=>x.type==="COIN_DAMAGE"||x.type==="SET_DAMAGE");
    const validDamage=noPrintedDamage||Number.isInteger(damage?.amount)&&damage.amount>=0&&
      (damage.suffix===""||damage.suffix==="＋"&&!!bonus||damage.suffix==="×"&&!!multiplier&&
      (multiplier.type==="COIN_DAMAGE"?multiplier.perCoin===damage.amount:
        multiplier.perPokemon===damage.amount||multiplier.perEnergy===damage.amount||multiplier.perCounter===damage.amount||multiplier.perCard===damage.amount||multiplier.perCondition===damage.amount||
        multiplier.basis==="OPPONENT_PRIZES_TAKEN"&&multiplier.perPrize===damage.amount||
        multiplier.basis==="DECK_BOTTOM_POKEMON_WITH_ATTACK"&&multiplier.perPokemon===damage.amount));
    return {
      index, name: attack.name, printedDamage: damage, cost, text: attack.effect ?? "",
      status: parsed.recognized && validCost && validDamage ? "supported" : "needs_review",
      effects: parsed.recognized && validCost && validDamage ? parsed.effects : []
    };
  });
}
