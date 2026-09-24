import { AttackEngine } from "./AttackEngine.js";

const BASIC = "たね";

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
      retreatedThisTurn: false, players,
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
    const current = next.players[next.turn];
    if (!current.deck.length) {
      next.winner = 1 - next.turn;
      next.winReason = "DECK_OUT";
    } else current.hand.push(current.deck.shift());
    return next;
  }

  endTurn(state) {
    if (state.phase !== "playing") throw new Error("Finish setup before ending a turn");
    const next = super.endTurn(state);
    next.turnsTaken[state.turn]++;
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
    if (state.pendingSecondAttack) return this.getLegalAttacks(state);
    const player = state.players[state.turn];
    const actions = [...super.getLegalActions(state), ...this.getLegalAttacks(state),
      ...this.evolveCandidates(state)];
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
      const count = this.retreatCost(state, state.turn, player.active.instanceId);
      const attached = player.active.attached ?? [];
      if (count <= attached.length && attached.every(x => this.isSupportedEnergy(x))) {
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
    if (["TAKE_PRIZE", "PROMOTE_BENCH"].includes(action.type)) return this.applyKnockoutAction(state, action);
    if (action.type === "END_TURN") return this.endTurn(state);
    const next = structuredClone(state);
    const player = next.players[action.player];
    const handIndex = player.hand.findIndex(x => x.instanceId === action.sourceInstanceId);
    if (action.type === "SET_ACTIVE" || action.type === "SET_BENCH" || action.type === "BENCH_BASIC") {
      const pokemon = player.hand.splice(handIndex, 1)[0];
      pokemon.enteredTurn = next.turnNo;
      if (action.type === "SET_ACTIVE") player.active = pokemon;
      else player.bench.push(pokemon);
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
      player.active = player.bench[benchIndex];
      player.bench[benchIndex] = active;
      next.retreatedThisTurn = true;
    } else if (action.type === "EVOLVE") {
      const evolution = player.hand.splice(handIndex, 1)[0];
      const before = this.field(player).find(x => x.instanceId === action.targetInstanceId);
      const { attached = [], stack = [], damage = 0, ...face } = before;
      const evolved = { ...evolution, attached, stack: [...stack, face], damage,
        enteredTurn: next.turnNo };
      if (player.active?.instanceId === action.targetInstanceId) player.active = evolved;
      else player.bench[player.bench.findIndex(x => x.instanceId === action.targetInstanceId)] = evolved;
    } else throw new Error(`Unsupported match action: ${action.type}`);
    return next;
  }
}
