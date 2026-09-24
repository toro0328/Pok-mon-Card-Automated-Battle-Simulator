import { AbilityEngine } from "./AbilityEngine.js";
import { inspectAttacks } from "../card-db/parse-effects.js";

// Restricted attack sandbox: only fully parsed attacks, basic energy and
// ordinary numeric damage. A knockout pauses resolution for the match engine.
export class AttackEngine extends AbilityEngine {
  attacks(instance) { return inspectAttacks(this.card(instance)); }

  getLegalActions(state) {
    return state.pendingKnockout ? [] : super.getLegalActions(state);
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
    if (state.pendingKnockout) return [];
    const active = state.players[state.turn].active;
    const target = state.players[1 - state.turn].active;
    if (!active || !target || !this.abilityAllowsAttack(state, state.turn, active.instanceId)) return [];
    return this.attacks(active).filter(attack => attack.status === "supported" &&
      this.energyPaysCost(active, attack.cost) &&
      attack.effects.filter(x => x.type === "DRAW").reduce((sum, x) => sum + x.count, 0) <=
        state.players[state.turn].deck.length).map(attack => ({
      type: "ATTACK", player: state.turn, sourceInstanceId: active.instanceId,
      attackIndex: attack.index
    }));
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
    if (state.turn !== playerIndex || state.pendingKnockout) return false;
    const item = state.players[playerIndex].hand.find(x => x.instanceId === itemInstanceId);
    return !!item && this.card(item).trainerType === "item" && !state.itemLocks?.[playerIndex];
  }

  endTurn(state) {
    this.assertSandbox(state);
    if (state.pendingKnockout) throw new Error("Resolve knockout before continuing");
    const next = structuredClone(state);
    next.itemLocks ??= [false, false];
    next.itemLocks[next.turn] = false;
    next.turn = 1 - next.turn;
    next.usedAbilities = { instances: [], names: [] };
    next.previousOpponentTurnKnockout = [false, false];
    return next;
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
      } else if (effect.type === "LOCK_ITEM_FROM_HAND" && effect.target === "OPPONENT") {
        next.itemLocks ??= [false, false];
        next.itemLocks[1 - next.turn] = true;
      } else throw new Error(`Unsupported attack effect: ${effect.type}`);
    }
    const knockedOut = [own.active, opponent.active].filter(x =>
      x.damage >= this.card(x).raw.hp).map(x => x.instanceId);
    if (knockedOut.length) {
      next.pendingKnockout = knockedOut;
      return next;
    }
    return this.endTurn(next);
  }
}
