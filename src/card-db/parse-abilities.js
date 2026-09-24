// Compile only complete, exact Japanese ability texts. An unrecognized ability
// remains in the catalog as needs_review and never becomes a legal action.
const TYPE = "(Grass|Fire|Water|Electric|Psychic|Fighting|Dark|Metal|Dragon|Colorless)";

export function parseAbility(name, text) {
  if (typeof name !== "string" || typeof text !== "string") {
    return { status: "needs_review", trigger: null, conditions: [], costs: [], operations: [] };
  }
  let match;
  if ((match = text.match(new RegExp(`^自分の番に、このカードが手札にあり、自分の場に${TYPE}タイプの「メガシンカex」がいるなら、1回使える。このカードをベンチに出す。$`)))) {
    return {
      status: "supported", trigger: "FROM_HAND",
      conditions: [{ type: "OWN_FIELD_POKEMON", pokemonType: match[1], rule: "メガシンカex" }],
      costs: [], operations: [{ type: "BENCH_SELF" }], limit: "CARD_INSTANCE_PER_TURN"
    };
  }
  if (text === "自分の番に、このカードが手札にあり、相手の場に2進化ポケモンがいるなら、1回使える。このカードをベンチに出す。") {
    return {
      status: "supported", trigger: "FROM_HAND",
      conditions: [{ type: "OPPONENT_FIELD_POKEMON", stage: "2 進化" }],
      costs: [], operations: [{ type: "BENCH_SELF" }], limit: "CARD_INSTANCE_PER_TURN"
    };
  }
  if ((match = text.match(/^このポケモンがバトル場にいるなら、自分の番に1回使える。自分の山札を([1-9][0-9]*)枚引く。この特性は別の「([^」]+)」を使った番は使えない。$/)) && match[2] === name) {
    return {
      status: "supported", trigger: "FROM_FIELD",
      conditions: [{ type: "SELF_IN_ACTIVE" }], costs: [],
      operations: [{ type: "DRAW", count: Number(match[1]) }],
      limit: "ABILITY_NAME_PER_TURN"
    };
  }
  if ((match = text.match(/^自分の番に1回使える。自分の山札を([1-9][0-9]*)枚引く。$/))) {
    return {
      status: "supported", trigger: "FROM_FIELD", conditions: [], costs: [],
      operations: [{ type: "DRAW", count: Number(match[1]) }],
      limit: "CARD_INSTANCE_PER_TURN"
    };
  }
  if ((match = text.match(/^自分の番に、自分の手札を1枚トラッシュするなら、1回使える。自分の山札を([1-9][0-9]*)枚引く。$/))) {
    return {
      status: "supported", trigger: "FROM_FIELD", conditions: [],
      costs: [{ type: "DISCARD_HAND", count: 1 }],
      operations: [{ type: "DRAW", count: Number(match[1]) }],
      limit: "CARD_INSTANCE_PER_TURN"
    };
  }
  if ((match = text.match(new RegExp(`^自分の番に1回使える。自分の手札から「基本${TYPE}エネルギー」を1枚選び、このポケモンにつける。その後、自分の山札を([1-9][0-9]*)枚引く。$`)))) {
    return {
      status: "supported", trigger: "FROM_FIELD", conditions: [],
      costs: [{ type: "SELECT_BASIC_ENERGY_IN_HAND", pokemonType: match[1] }],
      operations: [{ type: "ATTACH_SELECTED_TO_SELF" }, { type: "DRAW", count: Number(match[2]) }],
      limit: "CARD_INSTANCE_PER_TURN"
    };
  }
  if ((match = text.match(/^このポケモンが受けるワザのダメージは「-([1-9][0-9]*)」される。$/))) {
    return {
      status: "supported", trigger: "INCOMING_ATTACK_DAMAGE", conditions: [], costs: [],
      operations: [{ type: "REDUCE_DAMAGE", amount: Number(match[1]) }],
      limit: null
    };
  }
  return { status: "needs_review", trigger: null, conditions: [], costs: [], operations: [] };
}
