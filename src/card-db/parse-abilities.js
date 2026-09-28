// Compile only complete, exact Japanese ability texts. An unrecognized ability
// remains in the catalog as needs_review and never becomes a legal action.
const TYPE = "(Grass|Fire|Water|Electric|Psychic|Fighting|Dark|Metal|Dragon|Colorless)";

export function parseAbility(name, text) {
  if (typeof name !== "string" || typeof text !== "string") {
    if (name === "しゅんぱつりょく" && text === "対戦準備でポケモンをバトル場に出すとき、このカードが手札にあるなら、ウラにしてバトル場に出してよい。") {
    return { status: "supported", trigger: "SETUP_ACTIVE_FROM_HAND", conditions: [], costs: [],
      operations: [{ type: "SETUP_ACTIVE_FROM_HAND" }], limit: null };
  }
  return { status: "needs_review", trigger: null, conditions: [], costs: [], operations: [] };
  }
  let match;
  if (name === "おうじゃのよびごえ" && text === "自分の番に1回使える。自分の山札から「シロナのポケモン」を1枚選び、相手に見せて、手札に加える。そして山札を切る。") {
    return { status: "supported", trigger: "FROM_FIELD", conditions: [], costs: [],
      operations: [{ type: "SEARCH_DECK", count: 1, filter: "namePrefix", prefix: "シロナの", destination: "HAND", shuffle: true }],
      limit: "CARD_INSTANCE_PER_TURN" };
  }
  if (name === "ファンコール" && text === "最初の自分の番にだけ1回使える。自分の山札から、HPが「100」以下のColorlessポケモンを3枚まで選び、相手に見せて、手札に加える。そして山札を切る。この番、すでに別の「ファンコール」を使っていたなら、この特性は使えない。") {
    return { status: "supported", trigger: "FROM_FIELD", conditions: [{ type: "OWN_FIRST_TURN" }], costs: [],
      operations: [{ type: "SEARCH_UP_TO_N_DECK_POKEMON", filter: "colorlessHP100", max: 3, destination: "HAND", shuffle: true }],
      limit: "ABILITY_NAME_PER_TURN" };
  }
  if (name === "ばけがくれ" && text === "このポケモンは、相手のワザや特性の効果を受けない。") {
    return { status: "supported", trigger: "CONTINUOUS", conditions: [], costs: [],
      operations: [{ type: "PREVENT_OPPONENT_ATTACK_AND_ABILITY_EFFECTS", scope: "SELF" }], limit: null };
  }
  if (text === "自分の番に、このカードを手札から出して進化させたとき、自分の場に「テラスタル」のポケモンがいるなら、1回使える。自分の山札からトレーナーズを2枚まで選び、相手に見せて、手札に加える。そして山札を切る。") {
    return { status: "supported", trigger: "ON_EVOLVE", conditions: [{ type: "OWN_FIELD_TERRASTAL" }], costs: [],
      operations: [{ type: "SEARCH_UP_TO_N_DECK_TRAINERS", count: 2, destination: "HAND", shuffle: true }], limit: null };
  }
  if (text === "このポケモンがバトル場にいるかぎり、おたがいの場の「ルールを持つポケモン」（「未来」のポケモンをのぞく）の特性は、すべてなくなる。") {
    return { status: "supported", trigger: "CONTINUOUS", conditions: [], costs: [],
      operations: [{ type: "DISABLE_RULEBOX_ABILITIES_EXCEPT_FUTURE", scope: "BOTH_FIELDS", sourceMustBeActive: true }], limit: null };
  }
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
  if ((match = text.match(/^自分の番に、このカードを手札からベンチに出したとき、1回使える。自分の山札を上から([1-9][0-9]*)枚見て、その中から基本エネルギーを1枚選び、このポケモンにつける。残りのカードはウラにして切り、山札の下にもどす。$/))) {
    return { status: "supported", trigger: "ON_BENCH_FROM_HAND", conditions: [], costs: [],
      operations: [{ type: "LOOK_TOP_N_ATTACH_BASIC_ENERGY_TO_SELF", count: Number(match[1]) }], limit: null };
  }
  if (text === "自分の番に1回使える。自分の手札から「基本Fireエネルギー」を2枚まで選び、ベンチの「ヒビキのポケモン」1匹につける。") {
    return { status: "supported", trigger: "CUSTOM_FROM_FIELD", conditions: [], costs: [],
      operations: [{ type: "ATTACH_UP_TO_BASIC_FIRE_TO_BENCHED_HIBIKI", max: 2 }], limit: "CARD_INSTANCE_PER_TURN" };
  }
  if (name === "しめりけ" && text === "このポケモンがいるかぎり、おたがいのポケモン全員は、そのポケモン自身をきぜつさせる効果の特性が、すべてなくなる。") {
    return { status: "supported", trigger: "CONTINUOUS", conditions: [], costs: [],
      operations: [{ type: "PREVENT_SELF_KNOCKOUT_ABILITIES", scope: "BOTH_FIELDS" }], limit: null };
  }
  if (name === "メタルシグナル" && text === "自分の番に1回使える。自分の山札からSteelタイプの進化ポケモンを2枚まで選び、相手に見せて、手札に加える。そして山札を切る。") {
    return { status: "supported", trigger: "FROM_FIELD", conditions: [], costs: [],
      operations: [{ type: "SEARCH_UP_TO_N_DECK_POKEMON", filter: "steelEvolution", max: 2, destination: "HAND", shuffle: true }],
      limit: "CARD_INSTANCE_PER_TURN" };
  }
  if (name === "メタルメーカー" && text === "自分の番に1回使える。自分の山札を上から4枚見て、その中から「基本Steelエネルギー」を好きなだけ選び、自分のポケモンに好きなようにつける。残りのカードはすべてウラにして切り、山札の下にもどす。") {
    return { status: "supported", trigger: "FROM_FIELD", conditions: [], costs: [],
      operations: [{ type: "LOOK_TOP_N_DISTRIBUTE_BASIC_STEEL", count: 4, maxSelections: 4 }],
      limit: "CARD_INSTANCE_PER_TURN" };
  }
  if (name === "ラピッドバーニア" && text === "自分の番に、このカードを手札からベンチに出したとき、1回使える。このポケモンをバトルポケモンと入れ替える。入れ替えた場合、自分の場のポケモンについているエネルギーを好きなだけ選び、このポケモンにつけ替える。") {
    return { status: "supported", trigger: "ON_BENCH_FROM_HAND", conditions: [], costs: [],
      operations: [{ type: "SWITCH_SELF_ACTIVE_THEN_MOVE_ENERGY" }], limit: null };
  }
  if (name === "バッドアッパー" && text === "自分の番に1回使える。自分の山札から「基本Darkエネルギー」を1枚選び、ベンチのDarkポケモンにつける。そして山札を切る。その後、つけたポケモンにダメカンを2個のせる。") {
    return { status: "supported", trigger: "FROM_FIELD", conditions: [], costs: [],
      operations: [{ type: "SEARCH_BASIC_DARK_ATTACH_BENCH_DARK_AND_DAMAGE", counters: 2 }],
      limit: "CARD_INSTANCE_PER_TURN" };
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
  if (name === "おくのてキャッチ" && text === "自分の番に、このカードを手札からベンチに出したとき、1回使える。自分の山札からサポートを1枚選び、相手に見せて、手札に加える。そして山札を切る。この番、名前に「おくのて」とつく特性を使っていたなら、この特性は使えない。") {
    return { status: "supported", trigger: "ON_BENCH_FROM_HAND", conditions: [], costs: [],
      operations: [{ type: "SEARCH_DECK", count: 1, filter: "supporter", destination: "HAND", shuffle: true }],
      limit: "ABILITY_NAME_PER_TURN" };
  }
  if (name === "アドレナブレイン" && text === "このポケモンにDarkエネルギーがついているなら、自分の番に1回使える。自分の場のポケモン1匹にのっているダメカンを3個まで選び、相手の場のポケモン1匹にのせ替える。") {
    return { status: "supported", trigger: "FROM_FIELD",
      conditions: [{ type: "SELF_HAS_BASIC_ENERGY", pokemonType: "Dark" }], costs: [],
      operations: [{ type: "MOVE_DAMAGE_COUNTERS", maxCounters: 3 }], limit: "CARD_INSTANCE_PER_TURN" };
  }
  if (name === "ていさつしれい" && text === "自分の番に1回使える。自分の山札を上から2枚見て、どちらか1枚を選び、手札に加える。残りのカードは、山札の下にもどす。") {
    return { status: "supported", trigger: "FROM_FIELD", conditions: [], costs: [],
      operations: [{ type: "LOOK_TOP_N_CHOOSE", count: 2 }], limit: "CARD_INSTANCE_PER_TURN" };
  }
  if (name === "しはいのくさり" && text === "自分の番に1回使える。自分のベンチのDarkポケモン（「モモワロウex」をのぞく）を1匹選び、バトルポケモンと入れ替える。その後、新しいバトルポケモンをどくにする。この番、すでに別の「しはいのくさり」を使っていたなら、この特性は使えない。") {
    return { status: "supported", trigger: "FROM_FIELD", conditions: [], costs: [],
      operations: [{ type: "SWITCH_TO_BENCH_DARK_AND_POISON" }], limit: "ABILITY_NAME_PER_TURN" };
  }
  if (name === "にげあしドロー" && text === "自分の番に1回使える。自分の山札を3枚引く。その後、このポケモンと、ついているすべてのカードを、山札にもどして切る。") {
    return { status: "supported", trigger: "FROM_FIELD", conditions: [], costs: [],
      operations: [{ type: "DRAW_THEN_RETURN_SELF_TO_DECK", draw: 3, shuffle: true }],
      limit: "CARD_INSTANCE_PER_TURN" };
  }
  if (name === "フェアリーゾーン" && text === "このポケモンがいるかぎり、相手の場のDragonポケモン全員の弱点は、すべてPsychicタイプになる。［弱点は「×2」で計算する。］") {
    return { status: "supported", trigger: "CONTINUOUS", conditions: [], costs: [],
      operations: [{ type: "SET_OPPONENT_DRAGON_WEAKNESS", pokemonType: "Psychic", multiplier: 2 }],
      limit: null };
  }
  if (name === "ゆきにしずめる" && text === "自分の番に、このカードを手札からベンチに出したとき、1回使える。場に出ているスタジアムをトラッシュする。") {
    return { status: "supported", trigger: "ON_BENCH_FROM_HAND", conditions: [], costs: [],
      operations: [{ type: "DISCARD_STADIUM_FROM_PLAY" }], limit: null };
  }
  if (name === "きゃくよせ" && text === "このポケモンがバトル場にいるなら、自分の番に1回使える。自分の山札を上から6枚見て、その中からサポートを1枚選び、相手に見せて、手札に加える。残りのカードは山札にもどして切る。") {
    return { status: "supported", trigger: "FROM_FIELD",
      conditions: [{ type: "SELF_IN_ACTIVE" }], costs: [],
      operations: [{ type: "LOOK_TOP_N_SEARCH_SUPPORTER", count: 6, destination: "HAND", shuffle: true }],
      limit: "CARD_INSTANCE_PER_TURN" };
  }
  if (name === "たぎるとうし" && text === "自分の番に1回使える。自分のトラッシュから基本エネルギーを1枚選び、自分のポケモンにつける。") {
    return { status: "supported", trigger: "FROM_FIELD", conditions: [], costs: [],
      operations: [{ type: "ATTACH_BASIC_ENERGY_FROM_TRASH" }], limit: "CARD_INSTANCE_PER_TURN" };
  }
  if (name === "ろうれんのわざ" && text === "相手がすでにとったサイドの枚数ぶん、このポケモンが「ブラッドムーン」を使うためのColorlessエネルギーは少なくなる。") {
    return { status: "supported", trigger: "ATTACK_COST_MODIFIER", conditions: [], costs: [],
      operations: [{ type: "REDUCE_COLORLESS_ATTACK_COST_BY_OPPONENT_PRIZES", attackName: "ブラッドムーン", perPrize: 1 }],
      limit: null };
  }
  if (name === "もうどくしはい" && text === "このポケモンがバトル場にいるかぎり、相手のどくのポケモンは、どくでのせるダメカンの数が5個多くなる。") {
    return { status: "supported", trigger: "CONTINUOUS", conditions: [], costs: [],
      operations: [{ type: "INCREASE_OPPONENT_POISON_DAMAGE", extraCounters: 5 }], limit: null };
  }
  if (name === "ルナサイクル" && text === "自分の場に「ソルロック」がいて、自分の番に、自分の手札から「基本Fightingエネルギー」を1枚トラッシュするなら、1回使える。自分の山札を3枚引く。この特性は別の「ルナサイクル」を使った番は使えない。") {
    return { status: "supported", trigger: "FROM_FIELD",
      conditions: [{ type: "OWN_FIELD_POKEMON_NAME", name: "ソルロック" }],
      costs: [{ type: "DISCARD_BASIC_ENERGY_FROM_HAND", pokemonType: "Fighting", count: 1 }],
      operations: [{ type: "DRAW", count: 3 }], limit: "ABILITY_NAME_PER_TURN" };
  }
  if (name === "カースドボム" &&
      (match = text.match(/^自分の番に1回使えて、使ったなら、このポケモンをきぜつさせる。相手のポケモン1匹に、ダメカンを([1-9][0-9]*)個のせる。$/))) {
    return { status: "supported", trigger: "FROM_FIELD", conditions: [], costs: [],
      operations: [{ type: "SELF_KO_DAMAGE_COUNTERS", counters: Number(match[1]) }],
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
