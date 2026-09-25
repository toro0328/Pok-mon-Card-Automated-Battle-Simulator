import { AbilityEngine } from "./AbilityEngine.js?v=20260925-status2";
import { inspectAttacks } from "../card-db/parse-effects.js?v=20260925-status2";

// Restricted attack sandbox: only fully parsed attacks, basic energy and
// ordinary numeric damage. Ordinary single knockouts use explicit prize and
// promotion choices; simultaneous knockouts await a separate rule handler.
export class AttackEngine extends AbilityEngine {
  attacks(instance) { return inspectAttacks(this.card(instance)); }

  effectiveHP(instance) {
    const card=this.card(instance);
    const boost=card.raw.types?.includes("Grass")
      ? (instance.attached??[]).filter(energy=>this.card(energy).name === "グロウ草エネルギー" &&
          this.isSupportedEnergy(energy)).length * 20 : 0;
    return card.raw.hp + boost;
  }

  getLegalActions(state) {
    return state.pendingKnockout || state.winner != null ? [] : super.getLegalActions(state);
  }

  energyPaysCost(active, cost) {
    if (cost.length === 1 && cost[0] === "Void") return true;
    const attached = active.attached ?? [];
    const types = attached.map(energy => {
      const card = this.card(energy);
      if (card.energyType === "special" && this.isSupportedEnergy(energy)) return "Grass";
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
    if ((active.statuses??[]).some(x=>["マヒ","ねむり"].includes(typeof x==="string"?x:x.name))) return [];
    return this.attacks(active).filter(attack => attack.status === "supported" &&
      !(state.attackLocks??[]).some(lock=>lock.player===state.turn && lock.instanceId===active.instanceId &&
        state.turnsTaken?.[state.turn]===lock.turnsTakenAt+1) &&
      !(attack.effects.some(x=>x.noFirstSecondTurn) && state.turn===1 && state.turnsTaken?.[1]===0) &&
      this.energyPaysCost(active, attack.cost) &&
      attack.effects.filter(x => x.type === "DRAW").reduce((sum, x) => sum + x.count, 0) <=
        state.players[state.turn].deck.length).flatMap(attack => {
      const snipe=attack.effects.find(x=>x.type==="DAMAGE_CHOSEN_OPPONENT");
      const targets=snipe ? this.field(state.players[1-state.turn]) : [target];
      return targets.map(victim=>({type:"ATTACK",player:state.turn,sourceInstanceId:active.instanceId,
        attackIndex:attack.index,...(snipe?{targetInstanceId:victim.instanceId}:{})}))
        .filter(action=>this.canCompleteAttack(state,attack,action));
    });
  }

  canCompleteAttack(state, attack, action={player:state.turn,attackIndex:attack.index}) {
    const own = state.players[state.turn].active;
    const foe = this.field(state.players[1-state.turn]).find(x=>x.instanceId===action.targetInstanceId)??state.players[1-state.turn].active;
    let damage;
    try {
      damage = this.calculateAttackDamage(state, action);
    } catch { return false; }
    const selfDamage = attack.effects.filter(x => x.type === "DAMAGE" &&
      x.target === "ATTACKING_POKEMON").reduce((sum, x) => sum + x.amount, 0);
    const knockedOut = [
      (own.damage ?? 0) + selfDamage >= this.effectiveHP(own) ? state.turn : null,
      foe && (foe.damage ?? 0) + damage >= this.effectiveHP(foe) ? 1 - state.turn : null
    ].filter(x => x !== null);
    if (knockedOut.length !== 1) return true; // Simultaneous KO remains visibly unresolved.
    try {
      this.prizeValue(knockedOut[0]===state.turn?own:foe);
      return state.players.every(p => Array.isArray(p.prizes)) &&
        state.players[1 - knockedOut[0]].prizes.length > 0;
    } catch { return false; }
  }

  calculateAttackDamage(state, action) {
    this.assertSandbox(state);
    const source = state.players[action.player]?.active;
    const opponent=state.players[1-action.player];
    const target=action.targetInstanceId?this.field(opponent).find(x=>x.instanceId===action.targetInstanceId):opponent?.active;
    if (!source || !target) throw new Error("Missing attacking or defending Pokémon");
    const attack = this.attacks(source)[action.attackIndex];
    if (attack?.status !== "supported") throw new Error("Unsupported attack");
    const attacker = this.card(source).raw;
    const defender = this.card(target).raw;
    let damage = attack.printedDamage?.amount??0;
    for (const effect of attack.effects) {
      if (effect.type === "MODIFY_DAMAGE" && effect.basis === "BOTH_ACTIVE_ATTACHED_ENERGY_COUNT") {
        damage += ((source.attached?.length ?? 0) + (target.attached?.length ?? 0)) * effect.perEnergy;
      } else if (effect.type === "SET_DAMAGE" && effect.basis === "OWN_BENCH_COUNT") {
        damage = state.players[action.player].bench.length * effect.perPokemon;
      } else if (effect.type === "SET_DAMAGE" && effect.basis === "OWN_FIELD_FIRE_ELECTRIC_ENERGY_COUNT") {
        damage = this.field(state.players[action.player]).flatMap(p=>p.attached??[])
          .filter(energy=>["基本炎エネルギー","基本雷エネルギー"].includes(this.card(energy).name))
          .length * effect.perEnergy;
      } else if (effect.type === "MODIFY_DAMAGE" && effect.basis === "DEFENDING_ATTACHED_ENERGY_COUNT") {
        damage += (target.attached?.length??0)*effect.perEnergy;
      } else if (effect.type === "MODIFY_DAMAGE" && effect.basis === "COIN_UNTIL_TAILS") {
        damage += this.coinSequence(state.randomState??1).heads*effect.perHeads;
      } else if (effect.type === "DAMAGE_CHOSEN_OPPONENT") {
        damage = effect.amount;
      }
    }
    const isBench=target!==opponent.active;
    if (!isBench && defender.weakness?.type?.includes(attacker.types?.[0])) {
      if (defender.weakness.value !== "×2") throw new Error("Unsupported weakness");
      damage *= 2;
    }
    if (!isBench && defender.resistance?.type?.includes(attacker.types?.[0])) {
      const match = defender.resistance.value?.match(/^－([0-9]+)$/);
      if (!match) throw new Error("Unsupported resistance");
      damage = Math.max(0, damage - Number(match[1]));
    }
    if ((state.attackProtection??[]).some(shield=>shield.owner===1-action.player &&
        shield.instanceId===target.instanceId && this.card(source).raw.stage==="たね" &&
        !attacker.types?.includes("Colorless"))) return 0;
    return this.incomingAttackDamage(state, target.instanceId, damage);
  }

  coinSequence(seed, single=false) {
    let randomState=seed>>>0||1, heads=0, flips=0;
    do {
      randomState^=randomState<<13;randomState^=randomState>>>17;randomState^=randomState<<5;
      flips++;
      if ((randomState>>>0)/0x100000000>=0.5) heads++;
      else break;
    } while(!single && flips<64);
    return {heads,flips,randomState};
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
    next.attackProtection=(next.attackProtection??[]).filter(x=>x.owner===next.turn);
    next.turn = 1 - next.turn;
    next.usedAbilities = { instances: [], names: [] };
    next.previousOpponentTurnKnockout = [false, false];
    next.previousOpponentTurnKnockout[next.turn] = next.knockoutThisTurn?.[next.turn] === true;
    next.knockoutThisTurn = [false, false];
    return next;
  }

  pokemonCheck(state, endingPlayer) {
    const next=structuredClone(state),victims=[];
    for(const playerIndex of [0,1]){
      const active=next.players[playerIndex].active;
      if(!active)continue;
      active.statuses=(active.statuses??[]).map(x=>typeof x==="string"?{name:x,appliedTurnNo:0}:x);
      const has=name=>active.statuses.some(x=>x.name===name);
      if(has("どく"))active.damage=(active.damage??0)+10;
      if(has("やけど")){
        active.damage=(active.damage??0)+20;
        const coin=this.coinSequence(next.randomState??1,true);next.randomState=coin.randomState;
        if(coin.heads)active.statuses=active.statuses.filter(x=>x.name!=="やけど");
      }
      if(has("ねむり")){
        const coin=this.coinSequence(next.randomState??1,true);next.randomState=coin.randomState;
        if(coin.heads)active.statuses=active.statuses.filter(x=>x.name!=="ねむり");
      }
      if(has("マヒ")&&playerIndex===endingPlayer&&active.statuses.some(x=>x.name==="マヒ"&&x.appliedTurnNo<next.turnNo))
        active.statuses=active.statuses.filter(x=>x.name!=="マヒ");
      if(active.damage>=this.effectiveHP(active))victims.push(playerIndex);
    }
    return {state:next,victims};
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

  beginKnockout(state, victims, targetInstanceId=null) {
    if (victims.length !== 1) {
      state.pendingKnockout = { reason: "SIMULTANEOUS_KNOCKOUT_NEEDS_REVIEW", victims };
      return state;
    }
    const owner = victims[0];
    const recipient = 1 - owner;
    const benchIndex=targetInstanceId?state.players[owner].bench.findIndex(x=>x.instanceId===targetInstanceId):-1;
    const victim=benchIndex>=0?state.players[owner].bench[benchIndex]:state.players[owner].active;
    const prizeValue = this.prizeValue(victim);
    if (!state.players.every(p => Array.isArray(p.prizes)) || !state.players[recipient].prizes.length) {
      throw new Error("Prize zones are required for knockout resolution");
    }
    const { attached = [], stack = [], ...face } = victim;
    if (!Array.isArray(attached) || !Array.isArray(stack)) throw new Error("Unsupported knockout attachments");
    state.players[owner].trash.push(...stack, face, ...attached);
    if(benchIndex>=0)state.players[owner].bench.splice(benchIndex,1);
    else state.players[owner].active = null;
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
    if(state.players[pending.owner].active)return [{type:"RESOLVE_KNOCKOUT",player:pending.recipient}];
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
      if (!recipient.prizes.length || !this.field(next.players[pending.owner]).length) {
        next.winner = pending.recipient;
        next.winReason = recipient.prizes.length ? "NO_POKEMON" : "PRIZES";
        next.pendingKnockout = null;
      }
      return next;
    }
    if(action.type === "RESOLVE_KNOCKOUT"){
      next.pendingKnockout=null;
      if(next.pendingAttack)return next;
      if(next.pendingTurnAdvance){delete next.pendingTurnAdvance;return this.startTurn(next);}
      return this.endTurn(next);
    }
    const owner = next.players[pending.owner];
    const index = owner.bench.findIndex(x => x.instanceId === action.sourceInstanceId);
    owner.active = owner.bench.splice(index, 1)[0];
    next.pendingKnockout = null;
    if(next.pendingAttack)return next;
    if (next.pendingSecondAttack && next.pendingSecondAttack.player !== pending.owner &&
        next.players[next.pendingSecondAttack.player].active?.instanceId === next.pendingSecondAttack.sourceInstanceId)
      return next;
    delete next.pendingSecondAttack;
    if(next.pendingTurnAdvance){delete next.pendingTurnAdvance;return this.startTurn(next);}
    return this.endTurn(next);
  }

  attacksTwice(state, instance) {
    return !!state.stadium && this.entries(instance).some(entry=>entry.status === "supported" &&
      entry.operations.some(op=>op.type === "ATTACK_TWICE_IF_STADIUM" &&
        op.stadiumName === this.card(state.stadium).name));
  }

  applyAttack(state, action) {
    if (!this.getLegalAttacks(state).some(candidate => JSON.stringify(candidate) === JSON.stringify(action))) {
      throw new Error("Illegal or unsupported attack");
    }
    const next = structuredClone(state);
    const own = next.players[next.turn], opponent = next.players[1 - next.turn];
    const attack = this.attacks(own.active)[action.attackIndex];
    const confused=(own.active.statuses??[]).some(x=>(typeof x==="string"?x:x.name)==="こんらん");
    let confusion=null;
    if(confused){
      confusion=this.coinSequence(next.randomState??1,true);next.randomState=confusion.randomState;
      if(!confusion.heads){
        const before=own.active.damage??0;own.active.damage=before+30;
        next.lastAttack={player:state.turn,attacker:this.card(own.active).name,defender:this.card(own.active).name,
          attack:attack.name,damage:0,before,hp:this.effectiveHP(own.active),coin:"こんらん判定：ウラ・自分に30ダメージ",selfDamage:30};
        if(own.active.damage>=this.effectiveHP(own.active))return this.beginKnockout(next,[state.turn]);
        return this.endTurn(next);
      }
    }
    const damage = this.calculateAttackDamage(next, action);
    const victim=action.targetInstanceId
      ? this.field(opponent).find(x=>x.instanceId===action.targetInstanceId):opponent.active;
    const coin=attack.effects.some(x=>x.basis==="COIN_UNTIL_TAILS"||x.type==="COIN_DISCARD_ENERGY")
      ? this.coinSequence(next.randomState??1,attack.effects.some(x=>x.type==="COIN_DISCARD_ENERGY")) : null;
    if(coin)next.randomState=coin.randomState;
    next.lastAttack={player:state.turn,attacker:this.card(own.active).name,
      defender:this.card(victim).name,attack:attack.name,damage,
      before:victim.damage??0,hp:this.effectiveHP(victim),
      ...((confusion||coin)?{coin:[confusion?`こんらん判定：オモテ`:null,coin?`${coin.flips}回投げてオモテ${coin.heads}回`:null].filter(Boolean).join(" ／ ")}:{}),
      selfDamage:attack.effects.filter(x=>x.type==="DAMAGE" && x.target==="ATTACKING_POKEMON")
        .reduce((total,x)=>total+x.amount,0)};
    victim.damage = (victim.damage ?? 0) + damage;
    for (const effect of attack.effects) {
      if (effect.type === "DRAW" && effect.player === "SELF") {
        own.hand.push(...own.deck.splice(0, effect.count));
      } else if (effect.type === "DAMAGE" && effect.target === "ATTACKING_POKEMON") {
        own.active.damage = (own.active.damage ?? 0) + effect.amount;
      } else if(effect.type === "APPLY_STATUS") {
        if(!(this.isSupportedStadium(next.stadium)&&(victim.attached??[]).length)){
          const status=effect.status;
          victim.statuses??=[];
          if(["ねむり","マヒ","こんらん"].includes(status))
            victim.statuses=victim.statuses.filter(x=>!["ねむり","マヒ","こんらん"].includes(typeof x==="string"?x:x.name));
          if(!victim.statuses.some(x=>(typeof x==="string"?x:x.name)===status))
            victim.statuses.push({name:status,appliedTurnNo:next.turnNo,ownerPlayer:1-state.turn});
        }
      } else if (effect.type === "HEAL_OWN_FIELD") {
        for(const pokemon of this.field(own)) pokemon.damage=Math.max(0,(pokemon.damage??0)-effect.amount);
      } else if (effect.type === "COIN_DISCARD_ENERGY") {
        if(coin.heads && opponent.active.attached?.length)
          next.pendingAttack={type:"DISCARD_ENERGY",player:state.turn,sourceInstanceId:own.active.instanceId};
      } else if (effect.type === "PREVENT_BASIC_NON_COLORLESS_DAMAGE_NEXT_OPPONENT_TURN") {
        next.attackProtection??=[];
        next.attackProtection.push({owner:state.turn,instanceId:own.active.instanceId});
      } else if (effect.type === "PREVENT_SELF_ATTACK_NEXT_TURN") {
        next.attackLocks??=[];
        next.attackLocks.push({player:state.turn,instanceId:own.active.instanceId,
          turnsTakenAt:state.turnsTaken?.[state.turn]??0});
      } else if (effect.type === "RETURN_SELF_TO_HAND") {
        const {attached=[],stack=[],...face}=own.active;
        own.hand.push(face,...attached,...stack);
        own.active=null;
        if(own.bench.length)next.pendingAttack={type:"PROMOTE_SELF",player:state.turn};
        else {next.winner=1-state.turn;next.winReason="NO_POKEMON";}
      } else if (effect.type === "SEARCH_DECK") {
        next.pendingAttack={type:"SEARCH_DECK",player:state.turn,
          sourceInstanceId:own.active.instanceId,max:effect.max,filter:effect.filter,chosen:0};
      } else if ((effect.type === "MODIFY_DAMAGE" && effect.basis === "BOTH_ACTIVE_ATTACHED_ENERGY_COUNT") ||
                 (effect.type === "SET_DAMAGE" && ["OWN_BENCH_COUNT","OWN_FIELD_FIRE_ELECTRIC_ENERGY_COUNT"].includes(effect.basis)) ||
                 (effect.type === "MODIFY_DAMAGE" && ["DEFENDING_ATTACHED_ENERGY_COUNT","COIN_UNTIL_TAILS"].includes(effect.basis)) ||
                 effect.type === "DAMAGE_CHOSEN_OPPONENT") {
        // The bonus was already included in calculateAttackDamage.
      } else if (effect.type === "LOCK_ITEM_FROM_HAND" && effect.target === "OPPONENT") {
        next.itemLocks ??= [false, false];
        next.itemLocks[1 - next.turn] = true;
      } else throw new Error(`Unsupported attack effect: ${effect.type}`);
    }
    const knockedOut = [0, 1].filter(i => {
      const subject=i===state.turn?own.active:victim;
      return subject && subject.damage >= this.effectiveHP(subject);
    });
    const firstOfTwo = !state.pendingSecondAttack && !!own.active && this.attacksTwice(state, own.active);
    if (firstOfTwo) next.pendingSecondAttack = { player: state.turn,
      sourceInstanceId: own.active.instanceId, attackIndex: action.attackIndex };
    else delete next.pendingSecondAttack;
    if(knockedOut.length && next.pendingAttack){next.pendingAttack.delayedVictims=knockedOut;
      next.pendingAttack.targetInstanceId=action.targetInstanceId??null;return next;}
    if (knockedOut.length) return this.beginKnockout(next, knockedOut,action.targetInstanceId??null);
    if(next.pendingAttack)return next;
    if (firstOfTwo) return next;
    return this.endTurn(next);
  }
}
