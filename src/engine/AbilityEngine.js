import { parseAbility } from "../card-db/parse-abilities.js?v=20260928-fourcardfix2";

// Deterministic execution for the explicitly compiled ability subset.
// This is a restricted ability sandbox, not a complete Pokémon TCG match.
const FESTIVAL_STADIUM_TEXT = "エネルギーがついているおたがいのポケモン全員は、特殊状態にならず、受けている特殊状態は、すべて回復する。";
const SUPPORTED_STADIUM_TEXT = {
  "お祭り会場": FESTIVAL_STADIUM_TEXT,
  "なみのりビーチ": "おたがいのプレイヤーは、自分の番ごとに1回、自分のバトル場のWaterポケモンを、ベンチのWaterポケモンと入れ替えてよい。",
  "夜のアカデミー": "おたがいのプレイヤーは、自分の番ごとに1回、自分の手札を1枚選び、山札の上にもどしてよい。",
  "Nの城": "おたがいの場の「Nのポケモン」全員のにげるためのエネルギーは、すべてなくなる。",
  "ロケット団の監視塔": "おたがいの場のColorlessポケモン全員の特性は、すべてなくなる。",
  "ゼロの大空洞": "自分の場に「テラスタル」のポケモンがいるプレイヤーが、ベンチに出せるポケモンの数は8匹になる。\n（このカードがトラッシュされたときか、自分の場に「テラスタル」のポケモンがいなくなったとき、ベンチが5匹になるまでトラッシュする。おたがいにトラッシュするなら、このカードの持ち主から行う。）"
};
const CHAIN_MOCHI_TEXT = "このカードをつけているどくのポケモンが使うワザの、相手のバトルポケモンへのダメージは「+40」される。";
const GROW_GRASS_TEXT = "このカードは、ポケモンについているかぎり、Grassエネルギー1個ぶんとしてはたらく。\nこのカードをつけているGrassポケモンは、最大HPが「＋20」される。";
const BUBBLE_WATER_TEXT = "このカードは、ポケモンについているかぎり、Waterエネルギー1個ぶんとしてはたらく。\nこのカードをつけているWaterポケモンは、特殊状態にならず、受けている特殊状態は、すべて回復する。";
export class AbilityEngine {
  constructor(repository, catalog) {
    if (catalog?.cardCount !== repository.cards.size ||
        catalog?.sourceUpdatedAt !== repository.updatedAt) {
      throw new Error("Ability catalog and card DB are from different revisions");
    }
    this.repository = repository;
    this.catalog = catalog;
    this.deckPrograms = new Map();
  }

  card(instance) {
    const card = this.repository.get(instance?.cardId);
    if (!card) throw new Error(`Unknown card ID: ${instance?.cardId}`);
    return card;
  }

  entries(instance, state = null) {
    const card = this.card(instance);
    // Compile from the card'\''s own printed text at runtime. The generated
    // catalog remains a revision/checking artifact, not the rules authority.
    const entries=this.deckPrograms.get(instance.cardId)?.abilities??(card.raw.abilities??[]).map((ability,index)=>({index,name:ability.name,
      text:ability.effect,...parseAbility(ability.name,ability.effect)}));
    if (!state) return entries;
    const ownerIndex = state.players?.findIndex(player => this.field(player).some(p => p.instanceId === instance.instanceId));
    if (ownerIndex < 0) return entries;
    if (state.stadium && this.card(state.stadium).name === "ロケット団の監視塔" &&
        card.raw.types?.includes("Colorless")) return [];
    const ruleBox = !!card.raw.rule_box || card.raw.tags?.includes("ex") || card.raw.tags?.includes("メガシンカ");
    if (!ruleBox || card.raw.tags?.includes("未来") || card.name.startsWith("テツノ")) return entries;
    const disabled = state.players.some((player, playerIndex) => player.active && player.active.instanceId !== instance.instanceId &&
      this.card(player.active).raw.abilities?.some(a => a.name === "イニシャライズ") &&
      !(playerIndex !== ownerIndex && card.raw.abilities?.some(a =>
        a.effect === "このポケモンは、相手のポケモンから特性の効果を受けない。")));
    return disabled ? [] : entries;
  }

  field(player) {
    return [player.active, ...player.bench].filter(Boolean);
  }

  benchLimit(state,playerIndex){
    if(!state?.stadium||this.card(state.stadium).name!=="ゼロの大空洞")return 5;
    return this.field(state.players[playerIndex]).some(p=>this.card(p).raw.tags?.includes("Tera"))?8:5;
  }

  maxBenchCount(state,playerIndex){return this.benchLimit(state,playerIndex);}

  isTeraPokemon(instance){return (this.card(instance).raw.tags??[]).includes("Tera");}

  isSupportedStadium(instance) {
    const card = this.card(instance);
    if(card.trainerType!=="stadium")return false;
    if(SUPPORTED_STADIUM_TEXT[card.name]===card.raw.effect)return true;
    if(card.name==="ゼロの大空洞"){
      const text=String(card.raw.effect??"").replace(/\s/g,"");
      return /「テラスタル」/u.test(text)&&/ベンチに出せるポケモンの数は8匹/u.test(text)&&
        /ベンチが5匹になるまでトラッシュ/u.test(text)&&/持ち主から行う/u.test(text);
    }
    return false;
  }

  isSupportedTool(instance) {
    const card = this.card(instance);
    return card.trainerType === "tool" && ((card.name === "くさりもち" && card.raw.effect === CHAIN_MOCHI_TEXT) ||
      (card.name === "ふうせん" && card.raw.effect === "このカードをつけているポケモンは、にげるためのエネルギーが2個ぶん少なくなる。") ||
      (card.name === "ヘビーバトン" && card.raw.effect === "このカードをつけているにげるためのエネルギーが4個のポケモンが、バトル場で相手のポケモンからワザのダメージを受けてきぜつしたとき、そのポケモンについている基本エネルギーを3枚まで選び、自分のベンチポケモンに好きなようにつけ替える。"));
  }

  isSupportedEnergy(instance) {
    const card = this.card(instance);
    return card.energyType === "basic" ||
      (card.energyType === "special" && ((card.name === "グロウ草エネルギー" &&
        card.raw.effect === GROW_GRASS_TEXT) || (card.name === "バブル水エネルギー" &&
        card.raw.effect === BUBBLE_WATER_TEXT)));
  }

  assertSandbox(state) {
    if (state.ruleset !== "supported_abilities_v1" ||
        (state.stadium != null && !this.isSupportedStadium(state.stadium)) ||
        ![0, 1].includes(state.turn) || state.players?.length !== 2) {
      throw new Error("Unsupported game state for ability sandbox");
    }
    for (let playerIndex=0;playerIndex<state.players.length;playerIndex++) {
      const player=state.players[playerIndex];
      if (!Array.isArray(player.hand) || !Array.isArray(player.deck) ||
          !Array.isArray(player.bench) || !Array.isArray(player.trash) ||
          player.bench.length > this.benchLimit(state,playerIndex)&&
            !state.pendingBenchCleanup?.players?.includes(playerIndex)) throw new Error("Invalid player zones");
      for (const pokemon of this.field(player)) {
        if (this.card(pokemon).cardType !== "pokemon" ||
            this.entries(pokemon, state).some(e => e.status !== "supported")) {
          throw new Error("Unsupported ability or card on the field");
        }
        if ((pokemon.attached ?? []).some(x =>
          this.card(x).cardType !== "energy" && !this.isSupportedTool(x) ||
          this.card(x).cardType === "energy" && !this.isSupportedEnergy(x))) {
          throw new Error("Unsupported attachment in ability sandbox");
        }
      }
    }
  }

  conditionHolds(condition, state, playerIndex, source, zone) {
    const own = state.players[playerIndex], opponent = state.players[1 - playerIndex];
    switch (condition.type) {
      case "SELF_IN_ACTIVE": return zone === "active" && own.active?.instanceId === source.instanceId;
      case "OWN_FIRST_TURN": return (state.turnsTaken?.[playerIndex]??0)===0;
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
        return !!own.active && this.entries(own.active, state).some(entry => entry.name === condition.name);
      case "OWN_FIELD_POKEMON_NAME":
        return this.field(own).some(instance=>this.card(instance).name===condition.name);
      case "OWN_FIELD_TERRASTAL":
        return this.field(own).some(instance => (this.card(instance).raw.tags ?? []).includes("Tera"));
      case "SELF_HAS_BASIC_ENERGY": {
        const names = { Grass: "草", Fire: "炎", Water: "水", Electric: "雷", Psychic: "超",
          Fighting: "闘", Dark: "悪", Metal: "鋼" };
        return (source.attached ?? []).some(x => {
          const card = this.card(x);
          return card.energyType === "basic" && card.name === `基本${names[condition.pokemonType]}エネルギー`;
        });
      }
      default: throw new Error(`Unknown condition: ${condition.type}`);
    }
  }

  choices(costs, player) {
    if (costs.length === 0) return [null];
    if (costs.length !== 1) throw new Error("Unsupported compound cost");
    const cost = costs[0];
    if (cost.type === "DISCARD_HAND" && cost.count === 1) return player.hand.map(x => x.instanceId);
    if (cost.type === "SELECT_BASIC_ENERGY_IN_HAND" || cost.type === "DISCARD_BASIC_ENERGY_FROM_HAND") {
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
      for (const entry of this.entries(instance, state)) {
        if (entry.status !== "supported" || !["FROM_HAND", "FROM_FIELD"].includes(entry.trigger) ||
            (entry.trigger === "FROM_HAND") !== (zone === "hand")) continue;
        if (entry.limit === "CARD_INSTANCE_PER_TURN" && used.instances.includes(instance.instanceId)) continue;
        if (entry.limit === "ABILITY_NAME_PER_TURN" && used.names.includes(entry.name)) continue;
        if (!entry.conditions.every(c => this.conditionHolds(c, state, state.turn, instance, zone))) continue;
        const selfKnockoutSuppressed=state.players.some(owner=>this.field(owner).some(pokemon=>
          this.entries(pokemon, state).some(active=>active.status === "supported" && active.operations.some(op=>
            op.type === "PREVENT_SELF_KNOCKOUT_ABILITIES"))));
        if(selfKnockoutSuppressed&&entry.operations.some(op=>op.type === "SELF_KO_DAMAGE_COUNTERS"))continue;
        if (entry.operations.some(op => op.type === "BENCH_SELF") &&
            player.bench.length >= this.benchLimit(state, state.turn)) continue;
        const drawCount = entry.operations.filter(op => op.type === "DRAW").reduce((n, op) => n + op.count, 0);
        if (player.deck.length < drawCount) continue;
        const move=entry.operations.find(op=>op.type === "MOVE_DAMAGE_COUNTERS");
        const look=entry.operations.find(op=>op.type === "LOOK_TOP_N_CHOOSE");
        const topSearch=entry.operations.find(op=>op.type==="LOOK_TOP_N_SEARCH_SUPPORTER");
        const attachFromTrash=entry.operations.some(op=>op.type==="ATTACH_BASIC_ENERGY_FROM_TRASH");
        const returnSelf=entry.operations.find(op=>op.type === "DRAW_THEN_RETURN_SELF_TO_DECK");
        const selfKoDamage=entry.operations.find(op=>op.type === "SELF_KO_DAMAGE_COUNTERS");
        const multiSearch=entry.operations.find(op=>op.type === "SEARCH_UP_TO_N_DECK_POKEMON");
        const distributeSteel=entry.operations.find(op=>op.type === "LOOK_TOP_N_DISTRIBUTE_BASIC_STEEL");
        const darkBenchSearch=entry.operations.find(op=>op.type === "SEARCH_BASIC_DARK_ATTACH_BENCH_DARK_AND_DAMAGE");
        if(returnSelf){
          actions.push({type:"USE_ABILITY",player:state.turn,sourceInstanceId:instance.instanceId,abilityIndex:entry.index});
          continue;
        }
        if(multiSearch){
          actions.push({type:"USE_ABILITY",player:state.turn,sourceInstanceId:instance.instanceId,abilityIndex:entry.index});
          continue;
        }
        if(distributeSteel){
          actions.push({type:"USE_ABILITY",player:state.turn,sourceInstanceId:instance.instanceId,abilityIndex:entry.index});
          continue;
        }
        if(darkBenchSearch){
          const targets=player.bench.filter(target=>this.card(target).raw.types?.includes("Dark"));
          const energies=player.deck.filter(x=>this.card(x).energyType==="basic"&&this.card(x).name==="基本悪エネルギー");
          for(const target of targets)for(const energy of energies)actions.push({type:"USE_ABILITY",
            player:state.turn,sourceInstanceId:instance.instanceId,abilityIndex:entry.index,
            choiceInstanceId:energy.instanceId,targetInstanceId:target.instanceId});
          continue;
        }
        if(selfKoDamage){
          for(const target of this.field(state.players[1-state.turn]).filter(target=>
            !this.protectedFromOpponentEffects(state,target.instanceId,state.turn)))actions.push({type:"USE_ABILITY",
            player:state.turn,sourceInstanceId:instance.instanceId,abilityIndex:entry.index,
            targetInstanceId:target.instanceId});
          continue;
        }
        if (entry.operations.some(op=>op.type === "SWITCH_TO_BENCH_DARK_AND_POISON")) {
          for (const target of player.bench) {
            const raw=this.card(target).raw;
            if(raw.types?.includes("Dark")&&this.card(target).name!=="モモワロウex")
              actions.push({type:"USE_ABILITY",player:state.turn,sourceInstanceId:instance.instanceId,
                abilityIndex:entry.index,targetInstanceId:target.instanceId});
          }
          continue;
        }
        if (move) {
          const opponents=this.field(state.players[1-state.turn]).filter(target=>
            !this.protectedFromOpponentEffects(state,target.instanceId,state.turn));
          if (!opponents.length) continue;
          for (const damaged of this.field(player)) {
            const counters=Math.floor((damaged.damage ?? 0)/10);
            for (let count=1;count<=Math.min(move.maxCounters,counters);count++)
              for (const target of opponents) actions.push({ type:"USE_ABILITY",player:state.turn,
                sourceInstanceId:instance.instanceId,abilityIndex:entry.index,
                damageSourceInstanceId:damaged.instanceId,targetInstanceId:target.instanceId,counterCount:count });
          }
          continue;
        }
        if (look) {
          for (const choice of player.deck.slice(0,look.count)) actions.push({type:"USE_ABILITY",player:state.turn,
            sourceInstanceId:instance.instanceId,abilityIndex:entry.index,choiceInstanceId:choice.instanceId});
          continue;
        }
        if(topSearch){
          const top=player.deck.slice(0,topSearch.count);
          const choices=top.filter(x=>this.card(x).trainerType==="supporter");
          if(choices.length)for(const choice of choices)actions.push({type:"USE_ABILITY",player:state.turn,
            sourceInstanceId:instance.instanceId,abilityIndex:entry.index,choiceInstanceId:choice.instanceId});
          else actions.push({type:"USE_ABILITY",player:state.turn,sourceInstanceId:instance.instanceId,abilityIndex:entry.index});
          continue;
        }
        if(attachFromTrash){
          const energies=player.trash.filter(x=>this.card(x).energyType==="basic");
          for(const energy of energies)for(const target of this.field(player))actions.push({type:"USE_ABILITY",
            player:state.turn,sourceInstanceId:instance.instanceId,abilityIndex:entry.index,
            choiceInstanceId:energy.instanceId,targetInstanceId:target.instanceId});
          continue;
        }
        const search=entry.operations.find(op=>op.type === "SEARCH_DECK");
        const deckChoices=search?player.deck.filter(card=>
          search.filter==="supporter"?this.card(card).trainerType==="supporter":
          search.filter==="basicEnergy"?this.card(card).energyType==="basic":
          search.filter==="namePrefix"?this.card(card).name.startsWith(search.prefix):true).map(card=>card.instanceId)
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
    const entry = this.entries(source, state)[action.abilityIndex];
    for (const cost of entry.costs) {
      const index = player.hand.findIndex(x => x.instanceId === action.choiceInstanceId);
      const selected = player.hand.splice(index, 1)[0];
      if (cost.type === "DISCARD_HAND") player.trash.push(selected);
      else if(cost.type === "DISCARD_BASIC_ENERGY_FROM_HAND")player.trash.push(selected);
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
        case "DRAW_THEN_RETURN_SELF_TO_DECK": {
          player.hand.push(...player.deck.splice(0,operation.draw));
          const wasActive=player.active?.instanceId===source.instanceId;
          if(wasActive)player.active=null;
          else {
            const index=player.bench.findIndex(x=>x.instanceId===source.instanceId);
            if(index<0)throw new Error("Source Pokémon is not on the field");
            player.bench.splice(index,1);
          }
          const {attached=[],stack=[]}=source;
          player.deck.push(...stack,{instanceId:source.instanceId,cardId:source.cardId},...attached);
          if(operation.shuffle){
            next.randomState??=1;
            for(let i=player.deck.length-1;i>0;i--){
              next.randomState^=next.randomState<<13;
              next.randomState^=next.randomState>>>17;
              next.randomState^=next.randomState<<5;
              const j=Math.floor(((next.randomState>>>0)/0x100000000)*(i+1));
              [player.deck[i],player.deck[j]]=[player.deck[j],player.deck[i]];
            }
          }
          if(wasActive)next.pendingAbility={name:entry.name,sourceInstanceId:source.instanceId};
          break;
        }
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
             operation.filter==="basicEnergy"&&selected.energyType!=="basic" ||
             operation.filter==="namePrefix"&&!selected.name.startsWith(operation.prefix))
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
        case "MOVE_DAMAGE_COUNTERS": {
          const damaged=[player.active,...player.bench].find(x=>x?.instanceId===action.damageSourceInstanceId);
          const target=[next.players[1-next.turn].active,...next.players[1-next.turn].bench].find(x=>x?.instanceId===action.targetInstanceId);
          if(!damaged||!target||action.counterCount<1||action.counterCount>operation.maxCounters||
             (damaged.damage??0)<action.counterCount*10||
             this.protectedFromOpponentEffects(next,target.instanceId,next.turn)) throw new Error("Invalid damage-counter move");
          damaged.damage-=action.counterCount*10;
          target.damage=(target.damage??0)+action.counterCount*10;
          break;
        }
        case "SELF_KO_DAMAGE_COUNTERS": {
          const target=[next.players[1-next.turn].active,...next.players[1-next.turn].bench]
            .find(x=>x?.instanceId===action.targetInstanceId);
          const onField=[player.active,...player.bench].some(x=>x?.instanceId===source.instanceId);
          if(!onField||!target||this.protectedFromOpponentEffects(next,target.instanceId,next.turn))
            throw new Error("Invalid self-knockout damage target");
          target.damage=(target.damage??0)+operation.counters*10;
          next.pendingAbilitySelfKnockoutId=source.instanceId;
          break;
        }
        case "SEARCH_UP_TO_N_DECK_POKEMON":
          next.pendingAbility={name:entry.name,sourceInstanceId:source.instanceId,remaining:operation.max};
          break;
        case "LOOK_TOP_N_DISTRIBUTE_BASIC_STEEL":
          next.pendingAbility={name:entry.name,sourceInstanceId:source.instanceId,
            remaining:Math.min(operation.count,player.deck.length),lookedInstanceIds:player.deck.slice(0,operation.count).map(x=>x.instanceId)};
          break;
        case "SEARCH_BASIC_DARK_ATTACH_BENCH_DARK_AND_DAMAGE": {
          const index=player.deck.findIndex(x=>x.instanceId===action.choiceInstanceId);
          const target=player.bench.find(x=>x.instanceId===action.targetInstanceId);
          if(index<0||this.card(player.deck[index]).energyType!=="basic"||this.card(player.deck[index]).name!=="基本悪エネルギー"||
             !target||!this.card(target).raw.types?.includes("Dark"))throw new Error("Invalid Bad Upper selection");
          target.attached??=[];
          target.attached.push(player.deck.splice(index,1)[0]);
          target.damage=(target.damage??0)+operation.counters*10;
          next.pendingAbilityKnockoutTargetId=target.instanceId;
          next.randomState??=1;
          for(let i=player.deck.length-1;i>0;i--){
            next.randomState^=next.randomState<<13;next.randomState^=next.randomState>>>17;next.randomState^=next.randomState<<5;
            const j=Math.floor(((next.randomState>>>0)/0x100000000)*(i+1));
            [player.deck[i],player.deck[j]]=[player.deck[j],player.deck[i]];
          }
          break;
        }
        case "LOOK_TOP_N_CHOOSE": {
          const top=player.deck.splice(0,Math.min(operation.count,player.deck.length));
          const index=top.findIndex(x=>x.instanceId===action.choiceInstanceId);
          if(index<0) throw new Error("Selected card is not among the looked-at cards");
          player.hand.push(top.splice(index,1)[0]);
          player.deck.push(...top);
          break;
        }
        case "LOOK_TOP_N_SEARCH_SUPPORTER": {
          const top=player.deck.splice(0,Math.min(operation.count,player.deck.length));
          if(action.choiceInstanceId){
            const index=top.findIndex(x=>x.instanceId===action.choiceInstanceId);
            if(index<0||this.card(top[index]).trainerType!=="supporter")
              throw new Error("Selected card is not a Supporter among the looked-at cards");
            player.hand.push(top.splice(index,1)[0]);
          } else if(top.some(x=>this.card(x).trainerType==="supporter")) {
            throw new Error("A Supporter is available among the looked-at cards");
          }
          player.deck.push(...top);
          next.randomState??=1;
          for(let i=player.deck.length-1;i>0;i--){
            next.randomState^=next.randomState<<13;
            next.randomState^=next.randomState>>>17;
            next.randomState^=next.randomState<<5;
            const j=Math.floor(((next.randomState>>>0)/0x100000000)*(i+1));
            [player.deck[i],player.deck[j]]=[player.deck[j],player.deck[i]];
          }
          break;
        }
        case "ATTACH_BASIC_ENERGY_FROM_TRASH": {
          const energyIndex=player.trash.findIndex(x=>x.instanceId===action.choiceInstanceId);
          const target=[player.active,...player.bench].find(x=>x?.instanceId===action.targetInstanceId);
          if(energyIndex<0||this.card(player.trash[energyIndex]).energyType!=="basic"||!target)
            throw new Error("Invalid Energy recovery target");
          target.attached??=[];
          target.attached.push(player.trash.splice(energyIndex,1)[0]);
          break;
        }
        case "SWITCH_TO_BENCH_DARK_AND_POISON": {
          const index=player.bench.findIndex(x=>x.instanceId===action.targetInstanceId);
          if(index<0||!this.card(player.bench[index]).raw.types?.includes("Dark")||
             this.card(player.bench[index]).name==="モモワロウex") throw new Error("Invalid Dark Pokémon switch target");
          const promoted=player.bench.splice(index,1)[0];
          const outgoing=player.active;
          player.active=promoted;
          if(outgoing)player.bench.push(outgoing);
          const recover=new Set(["ねむり","マヒ","こんらん"]);
          promoted.statuses=(promoted.statuses??[]).filter(x=>!recover.has(typeof x==="string"?x:x.name));
          const protectedByStadium=next.stadium&&this.isSupportedStadium(next.stadium)&&(promoted.attached??[]).length>0;
          if(!protectedByStadium){
            promoted.statuses??=[];
            if(!promoted.statuses.some(x=>(typeof x==="string"?x:x.name)==="どく"))
              promoted.statuses.push({name:"どく",appliedTurnNo:next.turnNo,ownerPlayer:next.turn});
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
    if (owner.bench.includes(target) && this.field(owner).some(instance=>this.entries(instance, state).some(entry=>
      entry.status === "supported" && entry.operations.some(op=>
        (op.type === "PREVENT_BENCH_ATTACK" || op.type === "PREVENT_BENCH_ATTACK_DAMAGE") &&
        (!op.rulelessOnly || (!this.card(target).raw.rule_box && !this.card(target).raw.tags?.includes("ex")))))))
      return 0;
    const temporaryReduction=(state.attackProtection??[]).filter(x=>x.owner===state.players.findIndex(p=>this.field(p).includes(target))&&
      x.instanceId===target.instanceId).reduce((sum,x)=>sum+(x.reduceDamage??0),0);
    const reduction = this.entries(target, state)
      .filter(e => e.status === "supported" && e.trigger === "INCOMING_ATTACK_DAMAGE")
      .flatMap(e => e.operations)
      .reduce((total, op) => total + (op.type === "REDUCE_DAMAGE" ? op.amount : 0), 0);
    return Math.max(0, damage - reduction-temporaryReduction);
  }

  protectedFromOpponentEffects(state, targetInstanceId, sourcePlayerIndex) {
    const ownerIndex=state.players.findIndex(player=>this.field(player).some(x=>x.instanceId===targetInstanceId));
    if(ownerIndex<0||ownerIndex===sourcePlayerIndex)return false;
    const target=this.field(state.players[ownerIndex]).find(x=>x.instanceId===targetInstanceId);
    return this.entries(target,state).some(entry=>entry.status==="supported"&&entry.operations.some(op=>
      op.type==="PREVENT_OPPONENT_ATTACK_AND_ABILITY_EFFECTS"));
  }

  retreatCost(state, playerIndex, targetInstanceId) {
    this.assertSandbox(state);
    const owner = state.players[playerIndex];
    if (!owner) throw new Error("Invalid player");
    const target = this.field(owner).find(x => x.instanceId === targetInstanceId);
    if (!target) throw new Error("Target is not in this player'\''s field");
    const printed = this.card(target).raw.retreat;
    if (!Number.isInteger(printed) || printed < 0) throw new Error("Printed retreat cost is unknown");
    if(state.stadium&&this.card(state.stadium).name==="Nの城"&&this.card(target).name.startsWith("Nの"))return 0;
    if (this.card(target).raw.stage !== "たね") return printed;
    const attachedToolReduction=(target.attached??[]).filter(instance=>this.isSupportedTool(instance)&&
      this.card(instance).name==="ふうせん").length*2;
    if(attachedToolReduction)return Math.max(0,printed-attachedToolReduction);
    const freeRetreat = this.field(owner).some(instance => this.entries(instance, state).some(entry =>
      entry.status === "supported" && entry.trigger === "CONTINUOUS" &&
      entry.operations.some(op => op.type === "SET_RETREAT_COST_ZERO" &&
        op.scope === "OWN_FIELD" && op.stage === "たね")));
    return freeRetreat ? 0 : printed;
  }

  abilityAllowsAttack(state, playerIndex, sourceInstanceId) {
    this.assertSandbox(state);
    const owner = state.players[playerIndex];
    if (!owner?.active || owner.active.instanceId !== sourceInstanceId) return false;
    return this.entries(owner.active, state).filter(entry => entry.status === "supported" &&
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
