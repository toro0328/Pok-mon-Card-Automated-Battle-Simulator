// Compile only complete, exact Japanese ability texts. An unrecognized ability
// remains in the catalog as needs_review and never becomes a legal action.
const TYPE = "(Grass|Fire|Water|Electric|Psychic|Fighting|Dark|Metal|Dragon|Colorless)";

export function parseAbility(name, text) {
  if (typeof name !== "string" || typeof text !== "string") {
    return { status: "needs_review", trigger: null, conditions: [], costs: [], operations: [] };
  }
  let match;
  if ((match = text.match(/^場に「([^」]+)」が出ているなら、このポケモンは、持っているワザを2回連続で使える。（1回目のワザで相手のバトルポケモンがきぜつしたなら、次のバトルポケモンが出たあと、2回目のワザを使う。）$/))) {
    return { status: "supported", trigger: "CONTINUOUS", conditions: [], costs: [],
      operations: [{ type: "ATTACK_TWICE_IF_STADIUM", stadiumName: match[1] }], limit: null };
  }
  if ((match = text.match(/^自分のバトルポケモンが特性「([^」]+)」を持つポケモンなら、自分の番に1回使える。自分の山札から好きなカードを1枚選び、手札に加える。そして山札を切る。$/))) {
    return { status: "supported", trigger: "FROM_FIELD",
      conditions: [{ type: "OWN_ACTIVE_HAS_ABILITY", name: match[1] }],
      costs: [], operations: [{ type: "SEARCH_DECK", count: 1, destination: "HAND", shuffle: true }],
      limit: "CARD_INSTANCE_PER_TURN" };
  }
  if (text === "このポケモンがいるかぎり、自分のベンチポケモン全員は、相手のポケモンからワザのダメージや効果を受けない。") {
    return { status: "supported", trigger: "CONTINUOUS", conditions: [], costs: [],
      operations: [{ type: "PREVENT_BENCH_ATTACK", scope: "OWN_FIELD", rulelessOnly: false }], limit: null };
  }
  if (text === "このポケモンがいるかぎり、自分のベンチポケモン（「ルールを持つポケモン」をのぞく）全員は、相手のワザのダメージを受けない。") {
    return { status: "supported", trigger: "CONTINUOUS", conditions: [], costs: [],
      operations: [{ type: "PREVENT_BENCH_ATTACK_DAMAGE", scope: "OWN_FIELD", rulelessOnly: true }], limit: null };
  }
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
  if ((match = text.match(/^前の相手の番に、自分のポケモンがきぜつしていたなら、自分の番に1回使える。自分の山札を([1-9][0-9]*)枚引く。この番、すでに別の「([^」]+)」を使っていたなら、この特性は使えない。$/)) && match[2] === name) {
    return {
      status: "supported", trigger: "FROM_FIELD",
      conditions: [{ type: "OWN_POKEMON_KNOCKED_OUT_PREVIOUS_OPPONENT_TURN" }],
      costs: [], operations: [{ type: "DRAW", count: Number(match[1]) }],
      limit: "ABILITY_NAME_PER_TURN"
    };
  }
  if (text === "自分の番に1回使える。自分の山札からサポートを1枚選び、相手に見せて、手札に加える。そして山札を切る。") {
    return { status: "supported", trigger: "FROM_FIELD", conditions: [], costs: [],
      operations: [{ type: "SEARCH_DECK", count: 1, filter: "supporter", destination: "HAND", shuffle: true }],
      limit: "CARD_INSTANCE_PER_TURN" };
  }
  if (text === "自分の番に1回使える。自分の山札から基本エネルギーを1枚選び、手札に加える。そして山札を切る。") {
    return { status: "supported", trigger: "FROM_FIELD", conditions: [], costs: [],
      operations: [{ type: "SEARCH_DECK", count: 1, filter: "basicEnergy", destination: "HAND", shuffle: true }],
      limit: "CARD_INSTANCE_PER_TURN" };
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
  if (text === "このポケモンがいるかぎり、自分のたねポケモン全員のにげるためのエネルギーは、すべてなくなる。") {
    return {
      status: "supported", trigger: "CONTINUOUS", conditions: [], costs: [],
      operations: [{ type: "SET_RETREAT_COST_ZERO", scope: "OWN_FIELD", stage: "たね" }],
      limit: null
    };
  }
  if ((match = text.match(/^自分の場の「([^」]+)」が([1-9][0-9]*)匹以上のときにしか、このポケモンはワザが使えない。$/)) &&
      match[1] === "ロケット団のポケモン") {
    return {
      status: "supported", trigger: "ATTACK_PERMISSION", conditions: [], costs: [],
      operations: [{ type: "REQUIRE_OWN_FIELD_POKEMON_NAME_PREFIX", prefix: "ロケット団の", count: Number(match[2]) }],
      limit: null
    };
  }
  return { status: "needs_review", trigger: null, conditions: [], costs: [], operations: [] };
}
