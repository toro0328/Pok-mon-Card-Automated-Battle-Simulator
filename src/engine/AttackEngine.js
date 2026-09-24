import { AbilityEngine } from "./AbilityEngine.js";
import { inspectAttacks } from "../card-db/parse-effects.js";

// Restricted attack sandbox: only fully parsed attacks, basic energy and
// ordinary numeric damage. Ordinary single knockouts use explicit prize and
// promotion choices; simultaneous knockouts await a separate rule handler.
export class AttackEngine extends AbilityEngine {
  attacks(instance) { return inspectAttacks(this.card(instance)); }

  getLegalActions(state) {
    return state.pendingKnockout || state.winner != null ? [] : super.getLegalActions(state);
  }

  energyPaysCost(active, cost) {
    if (cost.length === 1 && cost[0] === "Void") return true;
    const attached = active.attached ?? [];
    const types = attached.map(energy => {
      const card = this.card(energy);
      if (card.energyType !== "basic") return null;
      const type = Object.entries({ 草: "Grass", 炎: "Fire", 水: "Water", 雷: "Electric",
        超: "Psychic", 闘: "Fighting", 悪: "Dark", 鋼: "Metal" })
        .find(([name]) => card.name === `基本${name}エネルギー`);
      return type?.[1] ?? null;
    });
    if (types.includes(null)) return false;
    const required = cost.filter(x => x !== "Colorless").map(x => x === "Steel" ? "Metal" : x);
    for (const type of required) {
      const index = types.indexOf(type);
      if (index < 0) return false;
      types.splice(index, 1);
    }
    return types.length >= cost.length - required.length;
  }

  getLegalAttacks(state) {
    this.assertSandbox(state);
    if (state.pendingKnockout || state.winner != null) return [];
    const active = state.players[state.turn].active;
    const target = state.players[1 - state.turn].active;
    if (!active || !target || !this.abilityAllowsAttack(state, state.turn, active.instanceId)) return [];
    return this.attacks(active).filter(attack => attack.status === "supported" &&
      this.energyPaysCost(active, attack.cost) &&
      attack.effects.filter(x => x.type === "DRAW").reduce((sum, x) => sum + x.count, 0) <=
        state.players[state.turn].deck.length && this.canCompleteAttack(state, attack)).map(attack => ({
      type: "ATTACK", player: state.turn, sourceInstanceId: active.instanceId,
      attackIndex: attack.index
    }));
  }

  canCompleteAttack(state, attack) {
    const own = state.players[state.turn].active;
    const foe = state.players[1 - state.turn].active;
    let damage;
    try {
      damage = this.calculateAttackDamage(state, { player: state.turn, attackIndex: attack.index });
    } catch { return false; }
    const selfDamage = attack.effects.filter(x => x.type === "DAMAGE" &&
      x.target === "ATTACKING_POKEMON").reduce((sum, x) => sum + x.amount, 0);
    const knockedOut = [
      (own.damage ?? 0) + selfDamage >= this.card(own).raw.hp ? state.turn : null,
      (foe.damage ?? 0) + damage >= this.card(foe).raw.hp ? 1 - state.turn : null
    ].filter(x => x !== null);
    if (knockedOut.length !== 1) return true; // Simultaneous KO remains visibly unresolved.
    try {
      this.prizeValue(state.players[knockedOut[0]].active);
      return state.players.every(p => Array.isArray(p.prizes)) &&
        state.players[1 - knockedOut[0]].prizes.length > 0;
    } catch { return false; }
  }

  calculateAttackDamage(state, action) {
    this.assertSandbox(state);
    const source = state.players[action.player]?.active;
    const target = state.players[1 - action.player]?.active;
    if (!source || !target) throw new Error("Missing attacking or defending Pokémon");
    const attack = this.attacks(source)[action.attackIndex];
    if (attack?.status !== "supported") throw new Error("Unsupported attack");
    const attacker = this.card(source).raw;
    const defender = this.card(target).raw;
    let damage = attack.printedDamage.amount;
    for (const effect of attack.effects) {
      if (effect.type === "MODIFY_DAMAGE" && effect.basis === "BOTH_ACTIVE_ATTACHED_ENERGY_COUNT") {
        damage += ((source.attached?.length ?? 0) + (target.attached?.length ?? 0)) * effect.perEnergy;
      }
    }
    if (defender.weakness?.type?.includes(attacker.types?.[0])) {
      if (defender.weakness.value !== "×2") throw new Error("Unsupported weakness");
      damage *= 2;
    }
    if (defender.resistance?.type?.includes(attacker.types?.[0])) {
      const match = defender.resistance.value?.match(/^－([0-9]+)$/);
      if (!match) throw new Error("Unsupported resistance");
      damage = Math.max(0, damage - Number(match[1]));
    }
    return this.incomingAttackDamage(state, target.instanceId, damage);
  }

  // This gate does not execute item effects; item handling must also consult it.
  canPlayItemFromHand(state, playerIndex, itemInstanceId) {
    this.assertSandbox(state);
    if (state.turn !== playerIndex || state.pendingKnockout || state.winner != null) return false;
    const item = state.players[playerIndex].hand.find(x => x.instanceId === itemInstanceId);
    return !!item && this.card(item).trainerType === "item" && !state.itemLocks?.[playerIndex];
  }

  endTurn(state) {
    this.assertSandbox(state);
    if (state.pendingKnockout) throw new Error("Resolve knockout before continuing");
    if (state.winner != null) throw new Error("Match has ended");
    const next = structuredClone(state);
    next.itemLocks ??= [false, false];
    next.itemLocks[next.turn] = false;
    next.turn = 1 - next.turn;
    next.usedAbilities = { instances: [], names: [] };
    next.previousOpponentTurnKnockout = [false, false];
    next.previousOpponentTurnKnockout[next.turn] = next.knockoutThisTurn?.[next.turn] === true;
    next.knockoutThisTurn = [false, false];
    return next;
  }

  prizeValue(instance) {
    const { name, raw } = this.card(instance);
    if (raw.rule_box === "メガシンカexがきぜつしたとき、相手はサイドを3枚とる。") return 3;
    if (raw.rule_box === "ポケモンexがきぜつしたとき、相手はサイドを2枚とる。") return 2;
    if (raw.rule_box || name.endsWith("ex") || raw.tags?.some(tag => tag === "ex" || tag === "メガシンカ")) {
      throw new Error(`Unsupported prize rule for ${name}`);
    }
    return 1;
  }

  beginKnockout(state, victims) {
    if (victims.length !== 1) {
      state.pendingKnockout = { reason: "SIMULTANEOUS_KNOCKOUT_NEEDS_REVIEW", victims };
      return state;
    }
    const owner = victims[0];
    const recipient = 1 - owner;
    const victim = state.players[owner].active;
    const prizeValue = this.prizeValue(victim);
    if (!state.players.every(p => Array.isArray(p.prizes)) || !state.players[recipient].prizes.length) {
      throw new Error("Prize zones are required for knockout resolution");
    }
    const { attached = [], stack = [], ...face } = victim;
    if (!Array.isArray(attached) || !Array.isArray(stack)) throw new Error("Unsupported knockout attachments");
    state.players[owner].trash.push(...stack, face, ...attached);
    state.players[owner].active = null;
    state.knockoutThisTurn ??= [false, false];
    state.knockoutThisTurn[owner] = true;
    state.pendingKnockout = { owner, recipient,
      remaining: Math.min(prizeValue, state.players[recipient].prizes.length) };
    return state;
  }

  getKnockoutActions(state) {
    this.assertSandbox(state);
    const pending = state.pendingKnockout;
    if (!pending || pending.reason || state.winner != null) return [];
    if (pending.remaining > 0) return state.players[pending.recipient].prizes.map((_, prizeIndex) => ({
      type: "TAKE_PRIZE", player: pending.recipient, prizeIndex
    }));
    return state.players[pending.owner].bench.map(instance => ({
      type: "PROMOTE_BENCH", player: pending.owner, sourceInstanceId: instance.instanceId
    }));
  }

  applyKnockoutAction(state, action) {
    if (!this.getKnockoutActions(state).some(candidate => JSON.stringify(candidate) === JSON.stringify(action))) {
      throw new Error("Illegal knockout action");
    }
    const next = structuredClone(state);
    const pending = next.pendingKnockout;
    if (action.type === "TAKE_PRIZE") {
      const recipient = next.players[pending.recipient];
      recipient.hand.push(...recipient.prizes.splice(action.prizeIndex, 1));
      pending.remaining--;
      if (pending.remaining > 0) return next;
      if (!recipient.prizes.length || !next.players[pending.owner].bench.length) {
        next.winner = pending.recipient;
        next.winReason = recipient.prizes.length ? "NO_POKEMON" : "PRIZES";
        next.pendingKnockout = null;
      }
      return next;
    }
    const owner = next.players[pending.owner];
    const index = owner.bench.findIndex(x => x.instanceId === action.sourceInstanceId);
    owner.active = owner.bench.splice(index, 1)[0];
    next.pendingKnockout = null;
    return this.endTurn(next);
  }

  applyAttack(state, action) {
    if (!this.getLegalAttacks(state).some(candidate => JSON.stringify(candidate) === JSON.stringify(action))) {
      throw new Error("Illegal or unsupported attack");
    }
    const damage = this.calculateAttackDamage(state, action);
    const next = structuredClone(state);
    const own = next.players[next.turn], opponent = next.players[1 - next.turn];
    const attack = this.attacks(own.active)[action.attackIndex];
    opponent.active.damage = (opponent.active.damage ?? 0) + damage;
    for (const effect of attack.effects) {
      if (effect.type === "DRAW" && effect.player === "SELF") {
        own.hand.push(...own.deck.splice(0, effect.count));
      } else if (effect.type === "DAMAGE" && effect.target === "ATTACKING_POKEMON") {
        own.active.damage = (own.active.damage ?? 0) + effect.amount;
      } else if (effect.type === "MODIFY_DAMAGE" && effect.basis === "BOTH_ACTIVE_ATTACHED_ENERGY_COUNT") {
        // The bonus was already included in calculateAttackDamage.
      } else if (effect.type === "LOCK_ITEM_FROM_HAND" && effect.target === "OPPONENT") {
        next.itemLocks ??= [false, false];
        next.itemLocks[1 - next.turn] = true;
      } else throw new Error(`Unsupported attack effect: ${effect.type}`);
    }
    const knockedOut = [0, 1].filter(i => {
      const active = next.players[i].active;
      return active.damage >= this.card(active).raw.hp;
    });
    if (knockedOut.length) {
      return this.beginKnockout(next, knockedOut);
    }
    return this.endTurn(next);
  }
}
