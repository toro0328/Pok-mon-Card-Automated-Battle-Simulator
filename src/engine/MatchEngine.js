import { AttackEngine } from "./AttackEngine.js?v=20260925-status2";

const BASIC = "たね";
const TRAINERS = {
  "ハイパーボール": { type: "item", cost: 2, max: 1, zone: "hand", filter: "pokemon", text: "このカードは、自分の手札を2枚トラッシュしなければ使えない。\n自分の山札からポケモンを1枚選び、相手に見せて、手札に加える。そして山札を切る。" },
  "なかよしポフィン": { type: "item", max: 2, zone: "bench", filter: "smallBasic", text: "自分の山札から、HPが「70」以下のたねポケモンを2枚まで選び、ベンチに出す。そして山札を切る。" },
  "ポケパッド": { type: "item", max: 1, zone: "hand", filter: "nonRulePokemon", text: "自分の山札からポケモン（「ルールを持つポケモン」をのぞく）を1枚選び、相手に見せて、手札に加える。そして山札を切る。" },
  "メガシグナル": { type: "item", max: 1, zone: "hand", filter: "mega", text: "自分の山札から「メガシンカex」を1枚選び、相手に見せて、手札に加える。そして山札を切る。" },
  "シアノ": { type: "supporter", max: 3, zone: "hand", filter: "ex", text: "自分の山札から「ポケモンex」を3枚まで選び、相手に見せて、手札に加える。そして山札を切る。" },
  "ぼうけんのランタン": { type: "item", max: 2, zone: "hand", filter: "lantern", text: "自分の山札から「基本Fireエネルギー」と「基本Electricエネルギー」を1枚ずつ選び、相手に見せて、手札に加える。そして山札を切る。" },
  "リーリエの決心": { type: "supporter", effect: "lillie", text: "自分の手札をすべて山札にもどして切る。その後、山札を6枚引く。自分のサイドの残り枚数が6枚なら、引く枚数は8枚になる。" },
  "夜のタンカ": { type: "item", effect: "rod", text: "自分のトラッシュからポケモンまたは基本エネルギーを1枚選び、相手に見せて、手札に加える。" },
  "ボスの指令": { type: "supporter", effect: "boss", text: "相手のベンチポケモンを1匹選び、バトルポケモンと入れ替える。" },
  "ポケモンいれかえ": { type: "item", effect: "switch", text: "自分のバトルポケモンをベンチポケモンと入れ替える。" },
  "エネルギーつけかえ": { type: "item", effect: "transfer", text: "自分の場のポケモンについている基本エネルギーを1個選び、自分の別のポケモンにつけ替える。" },
  "スペシャルレッドカード": { type: "item", effect: "red", text: "このカードは、相手のサイドの残り枚数が3枚以下のときにしか使えない。\n相手は相手自身の手札をすべてウラにして切り、山札の下にもどす。その後、相手は山札を3枚引く。" },
  "アカマツ": { type: "supporter", effect: "akamatsu", text: "自分の山札から、それぞれちがうタイプの基本エネルギーを2枚まで選び、相手に見せて、どちらか1枚を手札に加え、残りのエネルギーを自分のポケモンにつける。そして山札を切る。" }
};

// A first playable subset of the normal match. Only verified card actions are
// offered, and all mutations pass through applyMatchAction.
export class MatchEngine extends AttackEngine {
  createMatch(deckLists, seed = 1) {
    if (!Array.isArray(deckLists) || deckLists.length !== 2) throw new Error("Two decks are required");
    let randomState = (seed >>> 0) || 1;
    const random = () => {
      randomState ^= randomState << 13;
      randomState ^= randomState >>> 17;
      randomState ^= randomState << 5;
      return (randomState >>> 0) / 0x100000000;
    };
    let serial = 0;
    const players = deckLists.map(ids => {
      if (!Array.isArray(ids) || ids.length !== 60) throw new Error("A deck must have 60 cards");
      const copies = new Map();
      for (const id of ids) {
        const card = this.repository.get(id);
        if (!card) throw new Error(`Unknown deck card ${id}`);
        if (card.energyType !== "basic") {
          copies.set(card.name, (copies.get(card.name) ?? 0) + 1);
          if (copies.get(card.name) > 4) throw new Error(`Too many copies: ${card.name}`);
        }
      }
      const all = ids.map(cardId => ({ instanceId: `c${++serial}`, cardId, attached: [] }));
      const shuffle = cards => {
        for (let i = cards.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [cards[i], cards[j]] = [cards[j], cards[i]];
        }
        return cards;
      };
      let hand, deck;
      for (let mulligans = 0; mulligans < 100; mulligans++) {
        deck = shuffle([...all]);
        hand = deck.splice(0, 7);
        if (hand.some(card => this.card(card).raw.stage === BASIC &&
            this.entries(card).every(entry => entry.status === "supported"))) break;
        if (mulligans === 99) throw new Error("Could not draw a supported Basic Pokémon");
      }
      const prizes = deck.splice(0, 6);
      return { active: null, bench: [], hand, deck, prizes, trash: [] };
    });
    return { ruleset: "supported_abilities_v1", stadium: null, stadiumOwner: null, randomState,
      phase: "setup", seed, turn: 0, turnNo: 0, turnsTaken: [0, 0],
      setupReady: [false, false], energyAttachedThisTurn: false,
      retreatedThisTurn: false, supporterUsedThisTurn: false, players,
      itemLocks: [false, false], knockoutThisTurn: [false, false],
      previousOpponentTurnKnockout: [false, false],
      usedAbilities: { instances: [], names: [] } };
  }

  getLegalAttacks(state) {
    if (state.phase === "playing" && state.turnNo === 1) return [];
    const attacks=super.getLegalAttacks(state);
    if (!state.pendingSecondAttack) return attacks.filter(action=>{
      const source=state.players[state.turn].active;
      if (!this.attacksTwice(state,source)) return true;
      const drawCount=this.attacks(source)[action.attackIndex].effects
        .filter(effect=>effect.type==="DRAW").reduce((sum,effect)=>sum+effect.count,0);
      return state.players[state.turn].deck.length >= drawCount*2;
    });
    return attacks.filter(action=>
      action.player === state.pendingSecondAttack.player &&
      action.sourceInstanceId === state.pendingSecondAttack.sourceInstanceId &&
      action.attackIndex === state.pendingSecondAttack.attackIndex);
  }

  startTurn(state) {
    const next = structuredClone(state);
    next.turnNo++;
    next.energyAttachedThisTurn = false;
    next.retreatedThisTurn = false;
    next.supporterUsedThisTurn = false;
    const current = next.players[next.turn];
    if (!current.deck.length) {
      next.winner = 1 - next.turn;
      next.winReason = "DECK_OUT";
    } else current.hand.push(current.deck.shift());
    return next;
  }

  endTurn(state) {
    if (state.phase !== "playing") throw new Error("Finish setup before ending a turn");
    const endingPlayer=state.turn,checked=this.pokemonCheck(state,endingPlayer);
    const next=super.endTurn(checked.state);
    next.turnsTaken[endingPlayer]++;
    if(checked.victims.length){
      if(checked.victims.length>1)next.pendingKnockout={reason:"SIMULTANEOUS_KNOCKOUT_NEEDS_REVIEW",victims:checked.victims};
      else this.beginKnockout(next,checked.victims);
      next.pendingTurnAdvance=true;
      return next;
    }
    return this.startTurn(next);
  }

  evolveCandidates(state) {
    const own = state.players[state.turn];
    if (state.turnsTaken[state.turn] === 0) return [];
    const actions = [];
    for (const fromHand of own.hand) {
      const evolution = this.card(fromHand);
      if (!["1 進化", "2 進化"].includes(evolution.raw.stage) ||
          this.entries(fromHand).some(entry => entry.status !== "supported")) continue;
      for (const target of this.field(own)) {
        const before = this.card(target);
        if (before.name !== evolution.raw.evolve_from || target.enteredTurn === state.turnNo ||
            (target.damage ?? 0) >= evolution.raw.hp +
              (evolution.raw.types?.includes("Grass") ? (target.attached??[]).filter(x=>
                this.card(x).name === "グロウ草エネルギー" && this.isSupportedEnergy(x)).length*20 : 0)) continue;
        actions.push({ type: "EVOLVE", player: state.turn,
          sourceInstanceId: fromHand.instanceId, targetInstanceId: target.instanceId });
      }
    }
    return actions;
  }

  shufflePlayer(state, player) {
    state.randomState ??= 1;
    for (let i = player.deck.length - 1; i > 0; i--) {
      state.randomState ^= state.randomState << 13;
      state.randomState ^= state.randomState >>> 17;
      state.randomState ^= state.randomState << 5;
      const j = Math.floor((state.randomState >>> 0) / 0x100000000 * (i + 1));
      [player.deck[i], player.deck[j]] = [player.deck[j], player.deck[i]];
    }
  }

  trainerSpec(instance) {
    const card = this.card(instance), spec = TRAINERS[card.name];
    return spec && card.trainerType === spec.type && card.raw.effect === spec.text ? spec : null;
  }

  searchCandidate(instance, spec, pending, player) {
    const card = this.card(instance);
    switch (spec.filter) {
      case "pokemon": return card.cardType === "pokemon";
      case "smallBasic": return card.cardType === "pokemon" && card.raw.stage === BASIC && card.raw.hp <= 70 &&
        this.entries(instance).every(x => x.status === "supported") && player.bench.length < 5;
      case "nonRulePokemon": return card.cardType === "pokemon" && !card.raw.rule_box && !(card.raw.tags ?? []).some(x => ["ex", "V", "GX", "メガシンカ"].includes(x));
      case "mega": return card.cardType === "pokemon" && (card.raw.tags ?? []).includes("メガシンカ");
      case "ex": return card.cardType === "pokemon" && (card.raw.tags ?? []).includes("ex");
      case "lantern": return ["基本炎エネルギー", "基本雷エネルギー"].includes(card.name) &&
        !pending.selectedNames.includes(card.name);
      default: return false;
    }
  }

  trainerActions(state) {
    const player = state.players[state.turn], actions = [];
    if (state.pendingTrainer) {
      const pending = state.pendingTrainer, spec = TRAINERS[pending.name];
      if (pending.name === "アカマツ") {
        const energy=player.deck.filter(x=>this.card(x).energyType === "basic" &&
          !pending.selected.some(id=>this.card(player.deck.find(y=>y.instanceId===id)).name === this.card(x).name));
        if (pending.selected.length < 2) for(const x of energy)
          actions.push({type:"AKAMATSU_PICK",player:state.turn,choiceInstanceId:x.instanceId});
        if(pending.selected.length) {
          if(pending.selected.length===1) actions.push({type:"AKAMATSU_HAND",player:state.turn,
            choiceInstanceId:pending.selected[0]});
          else for(const id of pending.selected) actions.push({type:"AKAMATSU_HAND",player:state.turn,choiceInstanceId:id});
        } else actions.push({type:"AKAMATSU_FINISH",player:state.turn});
        return actions;
      }
      if (pending.name === "アカマツ・つける") {
        return this.field(player).map(x=>({type:"AKAMATSU_ATTACH",player:state.turn,
          targetInstanceId:x.instanceId}));
      }
      if (pending.costLeft) {
        for (const card of player.hand) actions.push({ type: "TRAINER_DISCARD", player: state.turn,
          sourceInstanceId: pending.sourceInstanceId, choiceInstanceId: card.instanceId });
      } else {
        if (pending.selectedNames.length < spec.max) for (const card of player.deck) {
          if (this.searchCandidate(card, spec, pending, player)) actions.push({ type: "TRAINER_SELECT", player: state.turn,
            sourceInstanceId: pending.sourceInstanceId, choiceInstanceId: card.instanceId });
        }
        actions.push({ type: "TRAINER_FINISH", player: state.turn, sourceInstanceId: pending.sourceInstanceId });
      }
      return actions;
    }
    for (const instance of player.hand) {
      const spec = this.trainerSpec(instance);
      if (!spec || spec.type === "item" && !this.canPlayItemFromHand(state, state.turn, instance.instanceId) ||
          spec.type === "supporter" && (state.supporterUsedThisTurn || state.turnNo === 1)) continue;
      if (spec.cost && player.hand.length - 1 < spec.cost) continue;
      if (spec.effect === "red" && state.players[1-state.turn].prizes.length > 3) continue;
      if (spec.effect === "rod") {
        for (const choice of player.trash) if (this.card(choice).cardType === "pokemon" || this.card(choice).energyType === "basic")
          actions.push({type:"PLAY_TRAINER",player:state.turn,sourceInstanceId:instance.instanceId,choiceInstanceId:choice.instanceId});
      } else if (spec.effect === "boss" || spec.effect === "switch") {
        const bench = state.players[spec.effect === "boss" ? 1-state.turn : state.turn].bench;
        for (const choice of bench) actions.push({type:"PLAY_TRAINER",player:state.turn,
          sourceInstanceId:instance.instanceId,choiceInstanceId:choice.instanceId});
      } else if (spec.effect === "transfer") {
        for (const from of this.field(player)) for (const energy of from.attached??[])
          if (this.card(energy).energyType === "basic") for(const target of this.field(player))
            if(target !== from)actions.push({type:"PLAY_TRAINER",player:state.turn,
              sourceInstanceId:instance.instanceId,choiceInstanceId:energy.instanceId,
              targetInstanceId:target.instanceId});
      } else actions.push({type:"PLAY_TRAINER",player:state.turn,sourceInstanceId:instance.instanceId});
    }
    return actions;
  }

  abilityChoiceActions(state) {
    const pending=state.pendingAbility, own=state.players[state.turn];
    if (pending.name === "こんじきのほのお") return [
      ...own.hand.filter(x=>this.card(x).name === "基本炎エネルギー").map(x=>({
        type:"ABILITY_SELECT",player:state.turn,sourceInstanceId:pending.sourceInstanceId,
        choiceInstanceId:x.instanceId,targetInstanceId:pending.targetInstanceId})),
      {type:"ABILITY_SKIP",player:state.turn,sourceInstanceId:pending.sourceInstanceId}];
    const choices=pending.name === "はしゃのほうこう" ? own.deck.slice(0,4).filter(x=>this.card(x).energyType === "basic")
      : own.deck.filter(x=>this.card(x).trainerType === "supporter");
    return [...choices.map(x=>({type:"ABILITY_SELECT",player:state.turn,sourceInstanceId:pending.sourceInstanceId,
      choiceInstanceId:x.instanceId})),
      {type:"ABILITY_SKIP",player:state.turn,sourceInstanceId:pending.sourceInstanceId}];
  }

  beginBenchAbility(state, instance) {
    const entry=this.entries(instance)[0];
    if (entry?.trigger !== "ON_BENCH_FROM_HAND") return;
    if (entry.name === "おくのてキャッチ") {
      if (state.usedAbilities?.names?.includes(entry.name)) return;
      state.usedAbilities ??= {instances:[],names:[]};
      state.usedAbilities.names.push(entry.name);
    }
    state.pendingAbility={name:entry.name,sourceInstanceId:instance.instanceId};
  }

  applyBenchAbility(state,action) {
    const next=structuredClone(state),player=next.players[action.player];
    if (next.pendingAbility.name === "こんじきのほのお") {
      if(action.type === "ABILITY_SELECT"){
        const i=player.hand.findIndex(x=>x.instanceId===action.choiceInstanceId);
        player.bench.find(x=>x.instanceId===action.targetInstanceId).attached.push(player.hand.splice(i,1)[0]);
        next.pendingAbility.remaining--;
        if(next.pendingAbility.remaining) return next;
      }
      delete next.pendingAbility;return next;
    }
    if (action.type === "ABILITY_SELECT") {
      const index=player.deck.findIndex(x=>x.instanceId===action.choiceInstanceId);
      const selected=player.deck.splice(index,1)[0];
      if (next.pendingAbility.name === "はしゃのほうこう") {
        player.bench.find(x=>x.instanceId===action.sourceInstanceId).attached.push(selected);
        const kept=player.deck.splice(0,Math.min(3,player.deck.length));
        this.shuffleSubset(next,kept);
        player.deck.push(...kept);
      } else {
        player.hand.push(selected);
        this.shufflePlayer(next,player);
      }
    } else if (next.pendingAbility.name === "はしゃのほうこう") {
      const kept=player.deck.splice(0,Math.min(4,player.deck.length));
      this.shuffleSubset(next,kept);
      player.deck.push(...kept);
    } else this.shufflePlayer(next,player);
    delete next.pendingAbility;
    return next;
  }

  shuffleSubset(state,cards) {
    state.randomState ??= 1;
    for(let i=cards.length-1;i>0;i--){
      state.randomState ^= state.randomState << 13;
      state.randomState ^= state.randomState >>> 17;
      state.randomState ^= state.randomState << 5;
      const j=Math.floor((state.randomState>>>0)/0x100000000*(i+1));
      [cards[i],cards[j]]=[cards[j],cards[i]];
    }
  }

  attackEffectActions(state) {
    const pending=state.pendingAttack,owner=state.players[pending.player];
    if(pending.type === "PROMOTE_SELF")return owner.bench.map(x=>({type:"ATTACK_PROMOTE",player:pending.player,
      targetInstanceId:x.instanceId}));
    if(pending.type === "DISCARD_ENERGY")return state.players[1-pending.player].active.attached.map(x=>({
      type:"ATTACK_DISCARD_ENERGY",player:pending.player,choiceInstanceId:x.instanceId}));
    const choices=owner.deck.filter(x=>pending.filter==="any"||this.card(x).cardType==="pokemon");
    return [...choices.map(x=>({type:"ATTACK_SEARCH",player:pending.player,choiceInstanceId:x.instanceId})),
      {type:"ATTACK_SEARCH_FINISH",player:pending.player}];
  }

  applyAttackEffect(state,action) {
    const next=structuredClone(state),pending=next.pendingAttack;
    const own=next.players[pending.player];
    if(action.type === "ATTACK_SEARCH"){
      const i=own.deck.findIndex(x=>x.instanceId===action.choiceInstanceId);
      own.hand.push(own.deck.splice(i,1)[0]);pending.chosen++;
      if(pending.chosen<pending.max && own.deck.some(x=>pending.filter==="any"||this.card(x).cardType==="pokemon"))return next;
      this.shufflePlayer(next,own);
    }else if(action.type === "ATTACK_SEARCH_FINISH")this.shufflePlayer(next,own);
    else if(action.type === "ATTACK_DISCARD_ENERGY"){
      const enemy=next.players[1-pending.player],attached=enemy.active.attached;
      const i=attached.findIndex(x=>x.instanceId===action.choiceInstanceId);
      enemy.trash.push(attached.splice(i,1)[0]);
    }else if(action.type === "ATTACK_PROMOTE"){
      const i=own.bench.findIndex(x=>x.instanceId===action.targetInstanceId);
      own.active=own.bench.splice(i,1)[0];
    }
    delete next.pendingAttack;
    if(pending.delayedVictims)return this.beginKnockout(next,pending.delayedVictims,pending.targetInstanceId);
    return this.endTurn(next);
  }

  clearSwitchStatuses(instance,evolved=false){
    if(!instance)return;
    const recover=new Set(["ねむり","マヒ","こんらん"]);
    instance.statuses=evolved?[]:(instance.statuses??[]).filter(x=>!recover.has(typeof x==="string"?x:x.name));
  }

  getMatchActions(state) {
    this.assertSandbox(state);
    if (state.winner != null) return [];
    if (state.phase === "setup") {
      const actions = [];
      for (let playerIndex = 0; playerIndex < 2; playerIndex++) {
        if (state.setupReady[playerIndex]) continue;
        const player = state.players[playerIndex];
        for (const card of player.hand) {
          if (this.card(card).raw.stage !== BASIC ||
              this.entries(card).some(e => e.status !== "supported")) continue;
          if (!player.active) actions.push({ type: "SET_ACTIVE", player: playerIndex,
            sourceInstanceId: card.instanceId });
          else if (player.bench.length < 5) actions.push({ type: "SET_BENCH", player: playerIndex,
            sourceInstanceId: card.instanceId });
        }
        if (player.active) actions.push({ type: "READY_SETUP", player: playerIndex });
      }
      return actions;
    }
    if (state.phase !== "playing") throw new Error("Unsupported match phase");
    if (state.pendingKnockout) return this.getKnockoutActions(state);
    if (state.pendingAttack) return this.attackEffectActions(state);
    if (state.pendingSecondAttack) return this.getLegalAttacks(state);
    if (state.pendingTrainer) return this.trainerActions(state);
    if (state.pendingAbility) return this.abilityChoiceActions(state);
    const player = state.players[state.turn];
    const actions = [...super.getLegalActions(state), ...this.getLegalAttacks(state), ...this.trainerActions(state),
      ...this.evolveCandidates(state)];
    if(player.hand.some(x=>this.card(x).name === "基本炎エネルギー"))
      for(const source of this.field(player)) if(this.entries(source).some(x=>x.trigger === "CUSTOM_FROM_FIELD") &&
          !state.usedAbilities?.instances?.includes(source.instanceId))
        for(const target of player.bench) if(this.card(target).name.startsWith("ヒビキの"))
          actions.push({type:"USE_HOOH",player:state.turn,sourceInstanceId:source.instanceId,
            targetInstanceId:target.instanceId});
    for (const card of player.hand) {
      if (this.card(card).raw.stage === BASIC && player.bench.length < 5 &&
          this.entries(card).every(entry => entry.status === "supported")) {
        actions.push({ type: "BENCH_BASIC", player: state.turn, sourceInstanceId: card.instanceId });
      }
      if (!state.energyAttachedThisTurn && this.card(card).cardType === "energy" && this.isSupportedEnergy(card)) {
        for (const target of this.field(player)) actions.push({ type: "ATTACH_ENERGY", player: state.turn,
          sourceInstanceId: card.instanceId, targetInstanceId: target.instanceId });
      }
      if (this.card(card).trainerType === "stadium" && this.isSupportedStadium(card) &&
          (!state.stadium || this.card(state.stadium).name !== this.card(card).name))
        actions.push({type:"PLAY_STADIUM",player:state.turn,sourceInstanceId:card.instanceId});
    }
    if (!state.retreatedThisTurn && player.active && player.bench.length) {
      const blockedStatus=(player.active.statuses??[]).some(x=>["マヒ","ねむり"].includes(typeof x==="string"?x:x.name));
      const count = this.retreatCost(state, state.turn, player.active.instanceId);
      const attached = player.active.attached ?? [];
      if (!blockedStatus && count <= attached.length && attached.every(x => this.isSupportedEnergy(x))) {
        const subsets = (start, chosen) => {
          if (chosen.length === count) return [chosen];
          const result = [];
          for (let i = start; i <= attached.length - (count - chosen.length); i++) {
            result.push(...subsets(i + 1, [...chosen, attached[i].instanceId]));
          }
          return result;
        };
        for (const target of player.bench) for (const paymentInstanceIds of subsets(0, [])) {
          actions.push({ type: "RETREAT", player: state.turn, targetInstanceId: target.instanceId,
            paymentInstanceIds });
        }
      }
    }
    actions.push({ type: "END_TURN", player: state.turn });
    return actions;
  }

  applyMatchAction(state, action) {
    if (!this.getMatchActions(state).some(candidate => JSON.stringify(candidate) === JSON.stringify(action))) {
      throw new Error("Illegal match action");
    }
    if (action.type === "USE_ABILITY") return super.applyAction(state, action);
    if (action.type === "ATTACK") return super.applyAttack(state, action);
    if (["TAKE_PRIZE", "PROMOTE_BENCH", "RESOLVE_KNOCKOUT"].includes(action.type)) return this.applyKnockoutAction(state, action);
    if(action.type.startsWith("ATTACK_SEARCH") || ["ATTACK_DISCARD_ENERGY","ATTACK_PROMOTE"].includes(action.type))
      return this.applyAttackEffect(state,action);
    if (action.type === "END_TURN") return this.endTurn(state);
    if (action.type.startsWith("TRAINER_") || action.type.startsWith("AKAMATSU_") || action.type === "PLAY_TRAINER") return this.applyTrainer(state, action);
    if (["ABILITY_SELECT","ABILITY_SKIP"].includes(action.type)) return this.applyBenchAbility(state,action);
    if (action.type === "USE_HOOH") {
      const next=structuredClone(state);
      next.usedAbilities ??= {instances:[],names:[]};
      next.usedAbilities.instances.push(action.sourceInstanceId);
      next.pendingAbility={name:"こんじきのほのお",sourceInstanceId:action.sourceInstanceId,
        targetInstanceId:action.targetInstanceId,remaining:2};
      return next;
    }
    const next = structuredClone(state);
    const player = next.players[action.player];
    const handIndex = player.hand.findIndex(x => x.instanceId === action.sourceInstanceId);
    if (action.type === "SET_ACTIVE" || action.type === "SET_BENCH" || action.type === "BENCH_BASIC") {
      const pokemon = player.hand.splice(handIndex, 1)[0];
      pokemon.enteredTurn = next.turnNo;
      if (action.type === "SET_ACTIVE") player.active = pokemon;
      else player.bench.push(pokemon);
      if (action.type === "BENCH_BASIC") this.beginBenchAbility(next,pokemon);
    } else if (action.type === "READY_SETUP") {
      next.setupReady[action.player] = true;
      if (next.setupReady.every(Boolean)) {
        next.phase = "playing";
        return this.startTurn(next);
      }
    } else if (action.type === "ATTACH_ENERGY") {
      const energy = player.hand.splice(handIndex, 1)[0];
      this.field(player).find(x => x.instanceId === action.targetInstanceId).attached.push(energy);
      next.energyAttachedThisTurn = true;
    } else if (action.type === "PLAY_STADIUM") {
      if(next.stadium)next.players[next.stadiumOwner].trash.push(next.stadium);
      next.stadium=player.hand.splice(handIndex,1)[0];
      next.stadiumOwner=action.player;
    } else if (action.type === "RETREAT") {
      const active = player.active;
      for (const id of action.paymentInstanceIds) {
        const index = active.attached.findIndex(x => x.instanceId === id);
        player.trash.push(active.attached.splice(index, 1)[0]);
      }
      const benchIndex = player.bench.findIndex(x => x.instanceId === action.targetInstanceId);
      this.clearSwitchStatuses(active);
      player.active = player.bench[benchIndex];
      player.bench[benchIndex] = active;
      next.retreatedThisTurn = true;
    } else if (action.type === "EVOLVE") {
      const evolution = player.hand.splice(handIndex, 1)[0];
      const before = this.field(player).find(x => x.instanceId === action.targetInstanceId);
      this.clearSwitchStatuses(before,true);
      const { attached = [], stack = [], damage = 0, ...face } = before;
      const evolved = { ...evolution, attached, stack: [...stack, face], damage,
        enteredTurn: next.turnNo };
      if (player.active?.instanceId === action.targetInstanceId) player.active = evolved;
      else player.bench[player.bench.findIndex(x => x.instanceId === action.targetInstanceId)] = evolved;
    } else throw new Error(`Unsupported match action: ${action.type}`);
    return next;
  }

  applyTrainer(state, action) {
    const next = structuredClone(state), player = next.players[action.player];
    if (action.type === "PLAY_TRAINER") {
      const index = player.hand.findIndex(x=>x.instanceId===action.sourceInstanceId);
      const trainer = player.hand.splice(index, 1)[0], spec = this.trainerSpec(trainer);
      player.trash.push(trainer);
      if (spec.type === "supporter") next.supporterUsedThisTurn = true;
      if (spec.effect === "lillie") {
        player.deck.push(...player.hand.splice(0));
        this.shufflePlayer(next,player);
        player.hand.push(...player.deck.splice(0,player.prizes.length===6?8:6));
      } else if (spec.effect === "rod") {
        const i=player.trash.findIndex(x=>x.instanceId===action.choiceInstanceId);
        player.hand.push(player.trash.splice(i,1)[0]);
      } else if (spec.effect === "boss" || spec.effect === "switch") {
        const target = next.players[spec.effect === "boss" ? 1-action.player : action.player];
        const i=target.bench.findIndex(x=>x.instanceId===action.choiceInstanceId);
        this.clearSwitchStatuses(target.active);
        [target.active,target.bench[i]]=[target.bench[i],target.active];
      } else if(spec.effect === "transfer"){
        const from=this.field(player).find(x=>(x.attached??[]).some(y=>y.instanceId===action.choiceInstanceId));
        const i=from.attached.findIndex(x=>x.instanceId===action.choiceInstanceId);
        this.field(player).find(x=>x.instanceId===action.targetInstanceId).attached.push(from.attached.splice(i,1)[0]);
      } else if(spec.effect === "red"){
        const opponent=next.players[1-action.player];
        const returned=opponent.hand.splice(0);
        this.shuffleSubset(next,returned);
        opponent.deck.push(...returned);
        opponent.hand.push(...opponent.deck.splice(0,3));
      } else if(spec.effect === "akamatsu"){
        next.pendingTrainer={name:"アカマツ",sourceInstanceId:trainer.instanceId,selected:[]};
      } else next.pendingTrainer={name:trainer.cardId?this.card(trainer).name:"",sourceInstanceId:trainer.instanceId,
        costLeft:spec.cost??0,selectedNames:[]};
    } else {
      const pending=next.pendingTrainer, spec=TRAINERS[pending.name];
      if(action.type === "AKAMATSU_PICK") pending.selected.push(action.choiceInstanceId);
      else if(action.type === "AKAMATSU_HAND"){
        const i=player.deck.findIndex(x=>x.instanceId===action.choiceInstanceId);
        player.hand.push(player.deck.splice(i,1)[0]);
        const other=pending.selected.filter(id=>id!==action.choiceInstanceId);
        if(other.length){pending.name="アカマツ・つける";pending.attachId=other[0];}
        else {this.shufflePlayer(next,player);delete next.pendingTrainer;}
      } else if(action.type === "AKAMATSU_ATTACH"){
        const i=player.deck.findIndex(x=>x.instanceId===pending.attachId);
        this.field(player).find(x=>x.instanceId===action.targetInstanceId).attached.push(player.deck.splice(i,1)[0]);
        this.shufflePlayer(next,player);delete next.pendingTrainer;
      } else if(action.type === "AKAMATSU_FINISH"){
        this.shufflePlayer(next,player);delete next.pendingTrainer;
      }
      if (action.type === "TRAINER_DISCARD") {
        const i=player.hand.findIndex(x=>x.instanceId===action.choiceInstanceId);
        player.trash.push(player.hand.splice(i,1)[0]);pending.costLeft--;
      } else if (action.type === "TRAINER_SELECT") {
        const i=player.deck.findIndex(x=>x.instanceId===action.choiceInstanceId);
        const chosen=player.deck.splice(i,1)[0];pending.selectedNames.push(this.card(chosen).name);
        if (spec.zone === "bench") {chosen.enteredTurn=next.turnNo;player.bench.push(chosen);}
        else player.hand.push(chosen);
        if(pending.selectedNames.length >= spec.max || !player.deck.some(x=>this.searchCandidate(x,spec,pending,player))){
          this.shufflePlayer(next,player);delete next.pendingTrainer;
        }
      } else if (action.type === "TRAINER_FINISH") {
        this.shufflePlayer(next,player);delete next.pendingTrainer;
      }
    }
    return next;
  }
}
