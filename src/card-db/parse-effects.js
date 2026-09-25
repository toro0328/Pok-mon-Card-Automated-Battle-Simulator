// Exact text patterns only. Callers must keep engine.status as "unparsed"
// until the whole card and the corresponding game rules are implemented.
const PATTERNS = [
  {
    expression: /^自分の山札を([1-9][0-9]*)枚引く。$/,
    convert: match => [{ type: "DRAW", player: "SELF", count: Number(match[1]) }]
  },
  {
    expression: /^相手のバトルポケモンを(どく|やけど|ねむり|マヒ|こんらん)にする。$/,
    convert: match => [{ type: "APPLY_STATUS", target: "DEFENDING_ACTIVE", status: match[1] }]
  },
  {
    expression: /^このポケモンにも([1-9][0-9]*)ダメージ。$/,
    convert: match => [{ type: "DAMAGE", target: "ATTACKING_POKEMON", amount: Number(match[1]), source: "ATTACK_EFFECT" }]
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
    expression: /^コインを1回投げオモテなら、([1-9][0-9]*)ダメージ追加。$/,
    convert: match => [{type:"COIN_BONUS",perCoin:Number(match[1])}]
  },
  {
    expression: /^コインを([1-9][0-9]*)回投げ、オモテの数×([1-9][0-9]*)ダメージ。$/,
    convert: match => [{type:"COIN_DAMAGE",count:Number(match[1]),perCoin:Number(match[2])}]
  },
  {
    expression: /^自分の山札から基本エネルギーを([1-9][0-9]*)枚まで選び、相手に見せて、手札に加える。そして山札を切る。$/,
    convert: match => [{type:"SEARCH_DECK",max:Number(match[1]),filter:"basicEnergy",destination:"HAND"}]
  },
  {
    expression: /^自分の山札からたねポケモンを([1-9][0-9]*)枚まで選び、ベンチに出す。そして山札を切る。$/,
    convert: match => [{type:"SEARCH_DECK",max:Number(match[1]),filter:"basicPokemon",destination:"BENCH"}]
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
    expression: /^相手のポケモン1匹に、([1-9][0-9]*)ダメージ。［ベンチは弱点・抵抗力を計算しない。］$/,
    convert: match => [{type:"DAMAGE_CHOSEN_OPPONENT",amount:Number(match[1])}]
  }
];

export function parseEffectText(text) {
  if (text === "") return { recognized: true, effects: [] };
  if (typeof text !== "string") return { recognized: false, effects: [] };
  const match = PATTERNS.map(pattern => [pattern, text.match(pattern.expression)])
    .find(([, result]) => result !== null);
  return match
    ? { recognized: true, effects: match[0].convert(match[1]) }
    : { recognized: false, effects: [] };
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
    const noPrintedDamage = damage === null && parsed.effects.length === 1 &&
      ["SEARCH_DECK","DAMAGE_CHOSEN_OPPONENT","APPLY_STATUS"].includes(parsed.effects[0].type);
    const validDamage = noPrintedDamage || Number.isInteger(damage?.amount) && damage.amount >= 0 &&
      (damage.suffix === "" || (damage.suffix === "＋" && parsed.effects.length === 1 &&
        ["MODIFY_DAMAGE","COIN_BONUS"].includes(parsed.effects[0].type)) ||
        (damage.suffix === "×" && parsed.effects.length === 1 &&
        ((parsed.effects[0].type === "SET_DAMAGE" &&
          (parsed.effects[0].perPokemon === damage.amount || parsed.effects[0].perEnergy === damage.amount)) ||
         parsed.effects[0].type === "COIN_DAMAGE" && parsed.effects[0].perCoin === damage.amount)));
    return {
      index, name: attack.name, printedDamage: damage, cost, text: attack.effect ?? "",
      status: parsed.recognized && validCost && validDamage ? "supported" : "needs_review",
      effects: parsed.recognized && validCost && validDamage ? parsed.effects : []
    };
  });
}
