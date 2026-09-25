// Deterministic execution for the explicitly compiled ability subset.
// This is a restricted ability sandbox, not a complete Pokémon TCG match.
const FESTIVAL_STADIUM_TEXT = "エネルギーがついているおたがいのポケモン全員は、特殊状態にならず、受けている特殊状態は、すべて回復する。";
const GROW_GRASS_TEXT = "このカードは、ポケモンについているかぎり、Grassエネルギー1個ぶんとしてはたらく。\nこのカードをつけているGrassポケモンは、最大HPが「＋20」される。";
const VERIFIED_ABILITIES = {
  50396: ["はしゃのほうこう", "自分の番に、このカードを手札からベンチに出したとき、1回使える。自分の山札を上から4枚見て、その中から基本エネルギーを1枚選び、このポケモンにつける。残りのカードはウラにして切り、山札の下にもどす。"],
  49694: ["おくのてキャッチ", "自分の番に、このカードを手札からベンチに出したとき、1回使える。自分の山札からサポートを1枚選び、相手に見せて、手札に加える。そして山札を切る。この番、名前に「おくのて」とつく特性を使っていたなら、この特性は使えない。"],
  47315: ["こんじきのほのお", "自分の番に1回使える。自分の手札から「基本Fireエネルギー」を2枚まで選び、ベンチの「ヒビキのポケモン」1匹につける。"]
};
export class AbilityEngine {
  constructor(repository, catalog) {
    if (catalog?.cardCount !== repository.cards.size ||
        catalog?.sourceUpdatedAt !== repository.updatedAt) {
      throw new Error("Ability catalog and card DB are from different revisions");
    }
    this.repository = repository;
    this.catalog = catalog;
  }

  card(instance) {
    const card = this.repository.get(instance?.cardId);
    if (!card) throw new Error(`Unknown card ID: ${instance?.cardId}`);
    return card;
  }

  entries(instance) {
    const card = this.card(instance);
    const entries = this.catalog.abilities[card.officialCardId] ?? [];
    if (entries.length !== (card.raw.abilities?.length ?? 0) ||
        entries.some((e, i) => e.text !== card.raw.abilities[i].effect || e.name !== card.raw.abilities[i].name)) {
      throw new Error(`Stale ability catalog for ${card.officialCardId}`);
    }
    const verified = VERIFIED_ABILITIES[card.officialCardId];
    return verified && entries.length === 1 && entries[0].name === verified[0] && entries[0].text === verified[1]
      ? [{ ...entries[0], status: "supported", trigger: card.officialCardId === 47315 ? "CUSTOM_FROM_FIELD" : "ON_BENCH_FROM_HAND" }] : entries;
  }

  field(player) {
    return [player.active, ...player.bench].filter(Boolean);
  }

  isSupportedStadium(instance) {
    const card = this.card(instance);
    return card.name === "お祭り会場" && card.trainerType === "stadium" &&
      card.raw.effect === FESTIVAL_STADIUM_TEXT;
  }

  isSupportedEnergy(instance) {
    const card = this.card(instance);
    return card.energyType === "basic" ||
      (card.energyType === "special" && card.name === "グロウ草エネルギー" &&
        card.raw.effect === GROW_GRASS_TEXT);
  }

  assertSandbox(state) {
    if (state.ruleset !== "supported_abilities_v1" ||
        (state.stadium != null && !this.isSupportedStadium(state.stadium)) ||
        ![0, 1].includes(state.turn) || state.players?.length !== 2) {
      throw new Error("Unsupported game state for ability sandbox");
    }
    for (const player of state.players) {
      if (!Array.isArray(player.hand) || !Array.isArray(player.deck) ||
          !Array.isArray(player.bench) || !Array.isArray(player.trash) ||
          player.bench.length > 5) throw new Error("Invalid player zones");
      for (const pokemon of this.field(player)) {
        if (this.card(pokemon).cardType !== "pokemon" ||
            this.entries(pokemon).some(e => e.status !== "supported")) {
          throw new Error("Unsupported ability or card on the field");
        }
        if ((pokemon.attached ?? []).some(x => this.card(x).cardType !== "energy" || !this.isSupportedEnergy(x))) {
          throw new Error("Unsupported attachment in ability sandbox");
        }
      }
    }
  }

  conditionHolds(condition, state, playerIndex, source, zone) {
    const own = state.players[playerIndex], opponent = state.players[1 - playerIndex];
    switch (condition.type) {
      case "SELF_IN_ACTIVE": return zone === "active" && own.active?.instanceId === source.instanceId;
      case "OWN_FIELD_POKEMON":
        return this.field(own).some(instance => {
          const raw = this.card(instance).raw;
          return raw.types?.includes(condition.pokemonType) &&
            (raw.rule_box?.startsWith(condition.rule) || raw.tags?.includes("メガシンカ"));
        });
      case "OPPONENT_FIELD_POKEMON":
        return this.field(opponent).some(instance => this.card(instance).raw.stage === condition.stage);
      case "OWN_POKEMON_KNOCKED_OUT_PREVIOUS_OPPONENT_TURN":
        return state.previousOpponentTurnKnockout?.[playerIndex] === true;
      case "OWN_ACTIVE_HAS_ABILITY":
        return !!own.active && this.entries(own.active).some(entry => entry.name === condition.name);
      default: throw new Error(`Unknown condition: ${condition.type}`);
    }
  }

  choices(costs, player) {
    if (costs.length === 0) return [null];
    if (costs.length !== 1) throw new Error("Unsupported compound cost");
    const cost = costs[0];
    if (cost.type === "DISCARD_HAND" && cost.count === 1) return player.hand.map(x => x.instanceId);
    if (cost.type === "SELECT_BASIC_ENERGY_IN_HAND") {
      const names = { Grass: "草", Fire: "炎", Water: "水", Electric: "雷", Psychic: "超",
        Fighting: "闘", Dark: "悪", Metal: "鋼" };
      const name = `基本${names[cost.pokemonType]}エネルギー`;
      return player.hand.filter(x => {
        const card = this.card(x);
        return card.energyType === "basic" && card.name === name;
      }).map(x => x.instanceId);
    }
    throw new Error(`Unknown cost: ${cost.type}`);
  }

  getLegalActions(state) {
    this.assertSandbox(state);
    const player = state.players[state.turn];
    const used = state.usedAbilities ?? { instances: [], names: [] };
    const sources = [
      ...player.hand.map(instance => ({ instance, zone: "hand" })),
      ...(player.active ? [{ instance: player.active, zone: "active" }] : []),
      ...player.bench.map(instance => ({ instance, zone: "bench" }))
    ];
    const actions = [];
    for (const { instance, zone } of sources) {
      for (const entry of this.entries(instance)) {
        if (entry.status !== "supported" || !["FROM_HAND", "FROM_FIELD"].includes(entry.trigger) ||
            (entry.trigger === "FROM_HAND") !== (zone === "hand")) continue;
        if (entry.limit === "CARD_INSTANCE_PER_TURN" && used.instances.includes(instance.instanceId)) continue;
        if (entry.limit === "ABILITY_NAME_PER_TURN" && used.names.includes(entry.name)) continue;
        if (!entry.conditions.every(c => this.conditionHolds(c, state, state.turn, instance, zone))) continue;
        if (entry.operations.some(op => op.type === "BENCH_SELF") && player.bench.length >= 5) continue;
        const drawCount = entry.operations.filter(op => op.type === "DRAW").reduce((n, op) => n + op.count, 0);
        if (player.deck.length < drawCount) continue;
        const search=entry.operations.find(op=>op.type === "SEARCH_DECK");
        const deckChoices=search?player.deck.filter(card=>
          search.filter==="supporter"?this.card(card).trainerType==="supporter":
          search.filter==="basicEnergy"?this.card(card).energyType==="basic":true).map(card=>card.instanceId)
          :this.choices(entry.costs,player);
        for (const choiceInstanceId of deckChoices) {
          actions.push({
            type: "USE_ABILITY", player: state.turn, sourceInstanceId: instance.instanceId,
            abilityIndex: entry.index, ...(choiceInstanceId ? { choiceInstanceId } : {})
          });
        }
      }
    }
    return actions;
  }

  applyAction(state, action) {
    const legal = this.getLegalActions(state);
    if (!legal.some(candidate => JSON.stringify(candidate) === JSON.stringify(action))) {
      throw new Error("Illegal or unsupported ability action");
    }
    const next = structuredClone(state);
    const player = next.players[next.turn];
    const source = [player.active, ...player.bench, ...player.hand].find(x => x?.instanceId === action.sourceInstanceId);
    const entry = this.entries(source)[action.abilityIndex];
    for (const cost of entry.costs) {
      const index = player.hand.findIndex(x => x.instanceId === action.choiceInstanceId);
      const selected = player.hand.splice(index, 1)[0];
      if (cost.type === "DISCARD_HAND") player.trash.push(selected);
      else if (cost.type === "SELECT_BASIC_ENERGY_IN_HAND") {
        // The selected card is attached by the matching operation below.
        next.selectedForAbility = selected;
      }
    }
    for (const operation of entry.operations) {
      switch (operation.type) {
        case "BENCH_SELF": {
          const index = player.hand.findIndex(x => x.instanceId === source.instanceId);
          player.bench.push(player.hand.splice(index, 1)[0]);
          break;
        }
        case "DRAW":
          player.hand.push(...player.deck.splice(0, operation.count));
          break;
        case "ATTACH_SELECTED_TO_SELF":
          source.attached ??= [];
          source.attached.push(next.selectedForAbility);
          delete next.selectedForAbility;
          break;
        case "SEARCH_DECK": {
          if (operation.count !== 1 || operation.destination !== "HAND" || !operation.shuffle)
            throw new Error("Unsupported deck search");
          const index = player.deck.findIndex(card => card.instanceId === action.choiceInstanceId);
          if(index<0)throw new Error("Selected card is not in the deck");
          const selected=this.card(player.deck[index]);
          if(operation.filter==="supporter"&&selected.trainerType!=="supporter" ||
             operation.filter==="basicEnergy"&&selected.energyType!=="basic")
            throw new Error("Selected card does not match the search filter");
          player.hand.push(player.deck.splice(index, 1)[0]);
          next.randomState ??= 1;
          for (let i = player.deck.length - 1; i > 0; i--) {
            next.randomState ^= next.randomState << 13;
            next.randomState ^= next.randomState >>> 17;
            next.randomState ^= next.randomState << 5;
            const j = Math.floor(((next.randomState >>> 0) / 0x100000000) * (i + 1));
            [player.deck[i], player.deck[j]] = [player.deck[j], player.deck[i]];
          }
          break;
        }
        default: throw new Error(`Unsupported operation: ${operation.type}`);
      }
    }
    next.usedAbilities ??= { instances: [], names: [] };
    if (entry.limit === "CARD_INSTANCE_PER_TURN") next.usedAbilities.instances.push(source.instanceId);
    if (entry.limit === "ABILITY_NAME_PER_TURN") next.usedAbilities.names.push(entry.name);
    return next;
  }

  incomingAttackDamage(state, targetInstanceId, damage) {
    this.assertSandbox(state);
    if (!Number.isInteger(damage) || damage < 0) throw new Error("Invalid damage");
    const target = state.players.flatMap(p => this.field(p)).find(x => x.instanceId === targetInstanceId);
    if (!target) throw new Error("Target is not on the field");
    const owner = state.players.find(p=>this.field(p).includes(target));
    if (owner.bench.includes(target) && this.field(owner).some(instance=>this.entries(instance).some(entry=>
      entry.status === "supported" && entry.operations.some(op=>
        (op.type === "PREVENT_BENCH_ATTACK" || op.type === "PREVENT_BENCH_ATTACK_DAMAGE") &&
        (!op.rulelessOnly || (!this.card(target).raw.rule_box && !this.card(target).raw.tags?.includes("ex")))))))
      return 0;
    const reduction = this.entries(target)
      .filter(e => e.status === "supported" && e.trigger === "INCOMING_ATTACK_DAMAGE")
      .flatMap(e => e.operations)
      .reduce((total, op) => total + (op.type === "REDUCE_DAMAGE" ? op.amount : 0), 0);
    return Math.max(0, damage - reduction);
  }

  retreatCost(state, playerIndex, targetInstanceId) {
    this.assertSandbox(state);
    const owner = state.players[playerIndex];
    if (!owner) throw new Error("Invalid player");
    const target = this.field(owner).find(x => x.instanceId === targetInstanceId);
    if (!target) throw new Error("Target is not in this player's field");
    const printed = this.card(target).raw.retreat;
    if (!Number.isInteger(printed) || printed < 0) throw new Error("Printed retreat cost is unknown");
    if (this.card(target).raw.stage !== "たね") return printed;
    const freeRetreat = this.field(owner).some(instance => this.entries(instance).some(entry =>
      entry.status === "supported" && entry.trigger === "CONTINUOUS" &&
      entry.operations.some(op => op.type === "SET_RETREAT_COST_ZERO" &&
        op.scope === "OWN_FIELD" && op.stage === "たね")));
    return freeRetreat ? 0 : printed;
  }

  abilityAllowsAttack(state, playerIndex, sourceInstanceId) {
    this.assertSandbox(state);
    const owner = state.players[playerIndex];
    if (!owner?.active || owner.active.instanceId !== sourceInstanceId) return false;
    return this.entries(owner.active).filter(entry => entry.status === "supported" &&
      entry.trigger === "ATTACK_PERMISSION").every(entry =>
      entry.operations.every(operation => {
        if (operation.type !== "REQUIRE_OWN_FIELD_POKEMON_NAME_PREFIX") {
          throw new Error(`Unsupported attack condition: ${operation.type}`);
        }
        return this.field(owner).filter(instance =>
          this.card(instance).name.startsWith(operation.prefix)).length >= operation.count;
      }));
  }
}
