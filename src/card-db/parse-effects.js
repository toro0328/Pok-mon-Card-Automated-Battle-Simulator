// Exact text patterns only. Callers must keep engine.status as "unparsed"
// until the whole card and the corresponding game rules are implemented.
const PATTERNS = [
  {
    expression: /^自分の山札を([1-9][0-9]*)枚引く。$/,
    convert: match => [{ type: "DRAW", player: "SELF", count: Number(match[1]) }]
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
    const validDamage = Number.isInteger(damage?.amount) && damage.amount >= 0 &&
      (damage.suffix === "" || (damage.suffix === "＋" && parsed.effects.length === 1 &&
        parsed.effects[0].type === "MODIFY_DAMAGE"));
    return {
      index, name: attack.name, printedDamage: damage, cost, text: attack.effect ?? "",
      status: parsed.recognized && validCost && validDamage ? "supported" : "needs_review",
      effects: parsed.recognized && validCost && validDamage ? parsed.effects : []
    };
  });
}
