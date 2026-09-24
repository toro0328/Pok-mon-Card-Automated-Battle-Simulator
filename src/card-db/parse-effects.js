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
  return card.raw.attacks.map(attack => ({
    name: attack.name,
    printedDamage: attack.damage,
    cost: attack.cost,
    text: attack.effect ?? "",
    ...parseEffectText(attack.effect ?? "")
  }));
}
