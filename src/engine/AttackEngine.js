import { AbilityEngine } from "./AbilityEngine.js?v=20260928-deckcompile2";
import { inspectAttacks } from "../card-db/parse-effects.js?v=20260928-fourcardfix1";

// Restricted attack sandbox: only fully parsed attacks, basic energy and
// ordinary numeric damage. Ordinary single knockouts use explicit prize and
// promotion choices; simultaneous knockouts await a separate rule handler.
export class AttackEngine extends AbilityEngine {
  attacks(instance) { return this.deckPrograms.get(instance?.cardId)?.attacks ?? inspectAttacks(this.card(instance)); }

  attackForAction(state,action){
    const active=state.players[action.player]?.active;
    const base=this.attacks(active)?.[action.attackIndex];
    if(!action.copiedAttackInstanceId)return base;
    if(!base?.effects.some(effect=>effect.type==="COPY_BENCH_N_ATTACK"))return null;
    const copied=state.players[action.player].bench.find(x=>x.instanceId===action.copiedAttackInstanceId);
    if(!copied||!this.card(copied).name.startsWith("Nの"))return null;
    const attack=this.attacks(copied).find(x=>x.index===action.copiedAttackIndex&&x.status==="supported"&&
      !x.effects.some(effect=>effect.type==="COPY_BENCH_N_ATTACK"));
    return attack?{...attack,copiedFromInstanceId:copied.instanceId,copiedFromName:this.card(copied).name}:null;
  }

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

  energyPaysCost(active, cost, state=null, playerIndex=0, attackName=null) {
    if (cost.length === 1 && cost[0] === "Void") return true;
    const attached = active.attached ?? [];
    const types = attached.map(energy => {
      const card = this.card(energy);
      if (card.energyType === "special" && this.isSupportedEnergy(energy))
        return card.name === "バブル水エネルギー" ? "Water" : "Grass";
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
    let colorlessRequired=cost.length-required.length;
    const reduction=this.entries(active, state).flatMap(entry=>entry.operations??[])
      .filter(op=>op.type==="REDUCE_COLORLESS_ATTACK_COST_BY_OPPONENT_PRIZES"&&op.attackName===attackName)
      .reduce((sum,op)=>sum+(op.perPrize??0),0);
    if(reduction){
      const prizesTaken=6-(state?.players?.[1-playerIndex]?.prizes?.length??6);
      colorlessRequired=Math.max(0,colorlessRequired-prizesTaken*reduction);
    }
    return types.length >= colorlessRequired;
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
        state.turnsTaken?.[state.turn]===lock.turnsTakenAt+1 &&
        (!lock.attackName||lock.attackName===attack.name)) &&
      !(state.temporaryLocks??[]).some(lock=>lock.targetInstanceId===active.instanceId&&lock.type==="PREVENT_ATTACK_NEXT_TURN"&&lock.expiresTurnNo>=state.turnNo) &&
      !(attack.effects.some(x=>x.noFirstSecondTurn) && state.turn===1 && state.turnsTaken?.[1]===0) &&
      attack.effects.filter(x=>x.type==="REQUIRE_OWN_BENCH_POKEMON").every(x=>
        state.players[state.turn].bench.some(pokemon=>this.card(pokemon).name===x.name)) &&
      (!attack.effects.some(x=>x.type==="REQUIRE_STADIUM_IN_PLAY")||!!state.stadium) &&
      !(attack.effects.some(x=>x.type==="SWITCH_SELF") && !state.players[state.turn].bench.length) &&
      this.energyPaysCost(active,attack.cost,state,state.turn,attack.name) &&
      attack.effects.filter(x => x.type === "DRAW").reduce((sum, x) => sum + x.count, 0) <=
        state.players[state.turn].deck.length).flatMap(attack => {
      const copyOptions=attack.effects.some(x=>x.type==="COPY_BENCH_N_ATTACK")
        ?state.players[state.turn].bench.flatMap(pokemon=>this.card(pokemon).name.startsWith("Nの")
          ?this.attacks(pokemon).filter(copy=>copy.status==="supported"&&
            !copy.effects.some(effect=>effect.type==="COPY_BENCH_N_ATTACK")).map(copy=>({pokemon,copy})):[])
        :[{pokemon:null,copy:attack}];
      return copyOptions.flatMap(({pokemon,copy})=>{
        const effective=copy;
        const snipe=copy.effects.find(x=>x.type==="DAMAGE_CHOSEN_OPPONENT");
        const targets=snipe ? this.field(state.players[1-state.turn]) : [target];
        const attacks=targets.map(victim=>({type:"ATTACK",player:state.turn,sourceInstanceId:active.instanceId,
          attackIndex:attack.index,...(pokemon?{copiedAttackInstanceId:pokemon.instanceId,copiedAttackIndex:copy.index,
            copiedAttackName:copy.name,copiedFromName:this.card(pokemon).name}:{}),...(snipe?{targetInstanceId:victim.instanceId}:{})}))
          .flatMap(action=>{
            const optional=effective.effects.find(x=>x.type==="OPTIONAL_DISCARD_THREE_STEEL_ENERGY_FOR_DAMAGE");
            if(!optional)return [action];
            const energies=(active.attached??[]).filter(item=>this.card(item).name==="基本鋼エネルギー");
            const combos=[];
            const choose=(from,picked)=>{
              if(picked.length===3){combos.push([...picked]);return;}
              for(let i=from;i<energies.length;i++)choose(i+1,[...picked,energies[i].instanceId]);
            };
            choose(0,[]);
            return [action,...combos.map(discardEnergyInstanceIds=>({...action,discardEnergyInstanceIds}))];
          });
        return attacks.filter(action=>this.canCompleteAttack(state,this.attackForAction(state,action),action));
      });
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
    const protectedTarget=this.protectedFromOpponentEffects(state,foe.instanceId,state.turn);
    const counterDamage=(protectedTarget?[]:attack.effects.filter(x=>x.type==="PLACE_DAMAGE_COUNTERS"&&x.target==="DEFENDING_ACTIVE"))
      .reduce((sum,x)=>sum+x.count*10,0);
    const knockedOut = [
      (own.damage ?? 0) + selfDamage >= this.effectiveHP(own) ? state.turn : null,
      foe && (foe.damage ?? 0) + damage + counterDamage >= this.effectiveHP(foe) ? 1 - state.turn : null
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
    const attack = this.attackForAction(state,action);
    if (attack?.status !== "supported") throw new Error("Unsupported attack");
    const attacker = this.card(source).raw;
    const defender = this.card(target).raw;
    const ignoreDefenderEffects=attack.effects.some(x=>x.type==="IGNORE_DEFENDER_ATTACK_EFFECTS");
    const ignoreWeaknessResistance=attack.effects.some(x=>x.type==="IGNORE_WEAKNESS_RESISTANCE"||
      x.type==="IGNORE_DEFENDER_ATTACK_EFFECTS"&&x.ignoreWeaknessResistance);
    const ignoreResistance=ignoreWeaknessResistance||attack.effects.some(x=>x.type==="IGNORE_RESISTANCE");
    let damage = attack.printedDamage?.amount??0;
    for (const effect of attack.effects) {
      if(effect.type==="MODIFY_DAMAGE"&&effect.basis==="ATTACHED_ENERGY_EXCEEDS_ATTACK_COST"&&
         (source.attached?.length??0)>=attack.cost.length+effect.extra){
        damage+=effect.amount;
      } else if (effect.type === "MODIFY_DAMAGE" && effect.basis === "BOTH_ACTIVE_ATTACHED_ENERGY_COUNT") {
        damage += ((source.attached?.length ?? 0) + (target.attached?.length ?? 0)) * effect.perEnergy;
      } else if (effect.type === "SET_DAMAGE" && effect.basis === "DECK_BOTTOM_POKEMON_WITH_ATTACK") {
        const deck=state.players[action.player].deck,shown=deck.slice(Math.max(0,deck.length-7));
        const count=shown.filter(x=>this.card(x).cardType==="pokemon"&&
          (this.card(x).raw.attacks??[]).some(a=>a.name===effect.attackName)).length;
        damage=count*effect.perPokemon;
      } else if (effect.type === "SET_DAMAGE" && effect.basis === "OWN_BENCH_COUNT") {
        damage = state.players[action.player].bench.length * effect.perPokemon;
      } else if (effect.type === "MODIFY_DAMAGE" && effect.basis === "BOTH_BENCH_COUNT") {
        damage += (state.players[action.player].bench.length+opponent.bench.length)*effect.perPokemon;
      } else if (effect.type === "SET_DAMAGE" && effect.basis === "OPPONENT_EX_COUNT") {
        damage = this.field(opponent).filter(p=>this.card(p).raw.tags?.includes("ex")).length*effect.perPokemon;
      } else if(effect.type==="MODIFY_DAMAGE"&&effect.basis==="TRASH_POKEMON_WITH_ABILITY"){
        const qualifying=state.players[action.player].trash.filter(instance=>this.card(instance).cardType==="pokemon"&&
          (this.card(instance).raw.abilities??[]).some(ability=>ability.name===effect.abilityName)).length;
        if(qualifying>=effect.count)damage+=effect.amount;
      } else if(effect.type==="OPTIONAL_DISCARD_THREE_STEEL_ENERGY_FOR_DAMAGE"&&
          action.discardEnergyInstanceIds?.length===3){
        damage+=effect.amount;
      } else if(effect.type==="SET_DAMAGE"&&effect.basis==="OWN_DAMAGE_COUNTERS"){
        damage=Math.floor((source.damage??0)/10)*effect.perCounter;
      } else if(effect.type==="SET_DAMAGE"&&effect.basis==="OPPONENT_DISCARD_BASIC_ENERGY_COUNT"){
        const basics=opponent.trash.filter(x=>this.card(x).energyType==="basic").length;
        damage=basics*effect.perEnergy;
      } else if (effect.type === "MODIFY_DAMAGE" && effect.basis === "DEFENDER_IS_EX") {
        if(defender.tags?.includes("ex"))damage+=effect.amount;
      } else if ((effect.type === "SET_DAMAGE"||effect.type === "MODIFY_DAMAGE") &&
                 effect.basis === "OPPONENT_PRIZES_TAKEN") {
        const taken=6-(opponent.prizes?.length??6),amount=taken*effect.perPrize;
        damage=effect.type==="SET_DAMAGE"?amount:damage+amount;
      } else if (effect.type === "SET_DAMAGE" && effect.basis === "OWN_FIELD_FIRE_ELECTRIC_ENERGY_COUNT") {
        damage = this.field(state.players[action.player]).flatMap(p=>p.attached??[])
          .filter(energy=>["基本炎エネルギー","基本雷エネルギー"].includes(this.card(energy).name))
          .length * effect.perEnergy;
      } else if (effect.type === "MODIFY_DAMAGE" && effect.basis === "DEFENDING_ATTACHED_ENERGY_COUNT") {
        damage += (target.attached?.length??0)*effect.perEnergy;
      } else if (effect.type === "MODIFY_DAMAGE" && effect.basis === "COIN_UNTIL_TAILS") {
        damage += this.coinSequence(state.randomState??1).heads*effect.perHeads;
      } else if(effect.type === "COIN_BONUS") {
        damage+=this.coinSequence(state.randomState??1,true).heads*effect.perCoin;
      } else if(effect.type === "COIN_DAMAGE") {
        damage=this.coinSequence(state.randomState??1,false,effect.count).heads*effect.perCoin;
      } else if (effect.type === "DAMAGE_CHOSEN_OPPONENT") {
        damage = effect.amount;
      }
    }
    if(target===opponent.active&&(defender.tags?.includes("ex")||!!defender.rule_box||this.card(target).name.endsWith("ex"))) {
      damage+=(state.damageBonuses??[]).filter(b=>b.player===action.player&&b.turnNo===state.turnNo&&
        b.target==="OPPONENT_ACTIVE_EX").reduce((sum,b)=>sum+b.amount,0);
      if((source.statuses??[]).some(x=>(typeof x==="string"?x:x.name)==="どく"))
        damage+=(source.attached??[]).filter(x=>this.isSupportedTool(x)&&this.card(x).name==="くさりもち").length*40;
    }
    const isBench=target!==opponent.active;
    const fairyZone=this.field(state.players[action.player]).some(instance=>this.entries(instance, state).some(entry=>
      entry.status==="supported"&&entry.operations.some(op=>op.type==="SET_OPPONENT_DRAGON_WEAKNESS")));
    const weakness=fairyZone&&defender.types?.includes("Dragon")
      ?{type:["Psychic"],value:"×2"}:defender.weakness;
    if (!ignoreWeaknessResistance && !isBench && weakness?.type?.includes(attacker.types?.[0])) {
      if (weakness.value !== "×2") throw new Error("Unsupported weakness");
      damage *= 2;
    }
    if (!ignoreResistance && !isBench && defender.resistance?.type?.includes(attacker.types?.[0])) {
      const match = defender.resistance.value?.match(/^－([0-9]+)$/);
      if (!match) throw new Error("Unsupported resistance");
      damage = Math.max(0, damage - Number(match[1]));
    }
    if (!ignoreDefenderEffects && (state.attackProtection??[]).some(shield=>shield.owner===1-action.player &&
        shield.instanceId===target.instanceId && this.card(source).raw.stage==="たね" &&
        !attacker.types?.includes("Colorless"))) return 0;
    return ignoreDefenderEffects?damage:this.incomingAttackDamage(state,target.instanceId,damage);
  }

  coinSequence(seed, single=false,maxFlips=null) {
    let randomState=seed>>>0||1, heads=0, flips=0;
    do {
      randomState^=randomState<<13;randomState^=randomState>>>17;randomState^=randomState<<5;
      flips++;
      if ((randomState>>>0)/0x100000000>=0.5) heads++;
      else if(!maxFlips)break;
    } while(maxFlips?flips<maxFlips:!single && flips<64);
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
    // Keep a protection effect through the opponent'\''s turn, then expire it
    // when that opponent ends their turn.
    next.attackProtection=(next.attackProtection??[]).filter(x=>x.owner===state.turn);
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
      const poisonBoost=next.players[1-playerIndex].active&&this.entries(next.players[1-playerIndex].active, next)
        .flatMap(entry=>entry.operations??[]).reduce((sum,op)=>sum+
          (op.type==="INCREASE_OPPONENT_POISON_DAMAGE"?op.extraCounters:0),0);
      if(has("どく"))active.damage=(active.damage??0)+10+poisonBoost*10;
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

  beginKnockout(state, victims, targetInstanceId=null, cause=null) {
    if (victims.length !== 1) {
      state.pendingKnockout = { reason: "SIMULTANEOUS_KNOCKOUT_NEEDS_REVIEW", victims };
      return state;
    }
    const owner = victims[0];
    const recipient = 1 - owner;
    const benchIndex=targetInstanceId?state.players[owner].bench.findIndex(x=>x.instanceId===targetInstanceId):-1;
    const victim=benchIndex>=0?state.players[owner].bench[benchIndex]:state.players[owner].active;
    const prizeValue = this.prizeValue(victim);
    const heavyBatonEnergyIds=cause?.source==="opponentAttack"&&owner!==cause.attacker&&benchIndex<0&&
      this.retreatCost?.(state,owner,victim.instanceId)===4&&
      this.field(state.players[owner]).length>1&&
      (victim.attached??[]).some(item=>this.card(item).name==="ヘビーバトン"&&this.isSupportedTool(item))
      ?(victim.attached??[]).filter(item=>this.card(item).energyType==="basic").map(item=>item.instanceId):[];
    const heavyBaton=heavyBatonEnergyIds.length?{energyIds:heavyBatonEnergyIds,selected:0,max:3}:null;
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
      remaining: Math.min(prizeValue, state.players[recipient].prizes.length),
      ...(heavyBaton?{heavyBaton}:{}) };
    this.scheduleBenchCleanup?.(state, owner);
    return state;
  }

  continueCounterAttack(state) {
    const pending=state.pendingAttack;
    if(!pending?.delayedKnockouts)return state;
    while(pending.delayedKnockouts.length){
      const next=pending.delayedKnockouts[0],owner=state.players[next.owner];
      const target=[owner.active,...owner.bench].find(x=>x?.instanceId===next.instanceId);
      if(!target||(target.damage??0)<this.effectiveHP(target)){pending.delayedKnockouts.shift();continue;}
      pending.delayedKnockouts.shift();
      return this.beginKnockout(state,[next.owner],target.instanceId);
    }
    delete state.pendingAttack;
    return state.pendingSecondAttack?state:this.endTurn(state);
  }

  getKnockoutActions(state) {
    this.assertSandbox(state);
    const pending = state.pendingKnockout;
    if (!pending || pending.reason || state.winner != null) return [];
    if (pending.remaining > 0) return state.players[pending.recipient].prizes.map((_, prizeIndex) => ({
      type: "TAKE_PRIZE", player: pending.recipient, prizeIndex
    }));
    if(state.pendingBenchCleanup)return this.benchCleanupActions(state);
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
        delete next.pendingAbilityResolution;
      }
      return next;
    }
    if(action.type === "RESOLVE_KNOCKOUT"){
      next.pendingKnockout=null;
      if(next.pendingAbilityResolution){delete next.pendingAbilityResolution;return next;}
      if(next.pendingAttack?.delayedKnockouts)return this.continueCounterAttack(next);
      if(next.pendingAttack)return next;
      if(next.pendingTurnAdvance){delete next.pendingTurnAdvance;return this.startTurn(next);}
      return this.endTurn(next);
    }
    const owner = next.players[pending.owner];
    const index = owner.bench.findIndex(x => x.instanceId === action.sourceInstanceId);
    owner.active = owner.bench.splice(index, 1)[0];
    next.pendingKnockout = null;
    if(next.pendingAbilityResolution){delete next.pendingAbilityResolution;return next;}
    if(next.pendingAttack?.delayedKnockouts)return this.continueCounterAttack(next);
    if(next.pendingAttack)return next;
    if (next.pendingSecondAttack && next.pendingSecondAttack.player !== pending.owner &&
        next.players[next.pendingSecondAttack.player].active?.instanceId === next.pendingSecondAttack.sourceInstanceId)
      return next;
    delete next.pendingSecondAttack;
    if(next.pendingTurnAdvance){delete next.pendingTurnAdvance;return this.startTurn(next);}
    return this.endTurn(next);
  }

  applyStatus(state,target,status,ownerPlayer){
    if(state.stadium&&this.card(state.stadium).name==="お祭り会場"&&(target.attached??[]).length)return;
    const targetCard=this.card(target);
    if(targetCard.raw.types?.includes("Water")&&(target.attached??[]).some(energy=>
      this.card(energy).name==="バブル水エネルギー"&&this.isSupportedEnergy(energy)))return;
    target.statuses??=[];
    const recover=new Set(["ねむり","マヒ","こんらん"]);
    if(recover.has(status))target.statuses=target.statuses.filter(x=>!recover.has(typeof x==="string"?x:x.name));
    if(!target.statuses.some(x=>(typeof x==="string"?x:x.name)===status))
      target.statuses.push({name:status,appliedTurnNo:state.turnNo,ownerPlayer});
  }

  attacksTwice(state, instance) {
    return !!state.stadium && this.entries(instance, state).some(entry=>entry.status === "supported" &&
      entry.operations.some(op=>op.type === "ATTACK_TWICE_IF_STADIUM" &&
        op.stadiumName === this.card(state.stadium).name));
  }

  applyAttack(state, action) {
    if (!this.getLegalAttacks(state).some(candidate => JSON.stringify(candidate) === JSON.stringify(action))) {
      throw new Error("Illegal or unsupported attack");
    }
    const next = structuredClone(state);
    const own = next.players[next.turn], opponent = next.players[1 - next.turn];
    const attack = this.attackForAction(state,action);
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
    if(action.discardEnergyInstanceIds?.length){
      const selected=action.discardEnergyInstanceIds.map(id=>own.active.attached.find(x=>x.instanceId===id));
      if(selected.length!==3||selected.some(x=>!x||this.card(x).name!=="基本鋼エネルギー"))
        throw new Error("Optional attack cost requires three attached Basic Steel Energy");
      const ids=new Set(action.discardEnergyInstanceIds);
      own.active.attached=own.active.attached.filter(x=>!ids.has(x.instanceId));
      own.trash.push(...selected);
    }
    const damage = this.calculateAttackDamage(next, action);
    const victim=action.targetInstanceId
      ? this.field(opponent).find(x=>x.instanceId===action.targetInstanceId):opponent.active;
    const coinEffect=attack.effects.find(x=>x.basis==="COIN_UNTIL_TAILS"||["COIN_DISCARD_ENERGY","COIN_BONUS","COIN_DAMAGE","COIN_APPLY_STATUS"].includes(x.type));
    const coin=coinEffect?this.coinSequence(next.randomState??1,
      ["COIN_DISCARD_ENERGY","COIN_BONUS","COIN_APPLY_STATUS"].includes(coinEffect.type),coinEffect.count??null):null;
    if(coin)next.randomState=coin.randomState;
    next.lastAttack={player:state.turn,attacker:this.card(own.active).name,
      defender:this.card(victim).name,attack:attack.name,damage,
      before:victim.damage??0,hp:this.effectiveHP(victim),
      ...((confusion||coin)?{coin:[confusion?`こんらん判定：オモテ`:null,coin?`${coin.flips}回投げてオモテ${coin.heads}回`:null].filter(Boolean).join(" ／ ")}:{}),
      selfDamage:attack.effects.filter(x=>x.type==="DAMAGE" && x.target==="ATTACKING_POKEMON")
        .reduce((total,x)=>total+x.amount,0),
      damageCounters:attack.effects.filter(x=>x.type==="PLACE_DAMAGE_COUNTERS"&&x.target==="DEFENDING_ACTIVE")
        .reduce((total,x)=>total+x.count,0)};
    victim.damage = (victim.damage ?? 0) + damage;
    const targetEffectProtected=this.protectedFromOpponentEffects(next,victim.instanceId,state.turn);
    for (const effect of attack.effects) {
      if(targetEffectProtected&&effect.target!=="ATTACKING_POKEMON"&&["APPLY_STATUS","COIN_APPLY_STATUS","DISCARD_OPPONENT_ENERGY","COIN_DISCARD_ENERGY",
        "PREVENT_RETREAT_NEXT_TURN","PREVENT_ATTACK_NEXT_TURN","PLACE_DAMAGE_COUNTERS","SWITCH_OPPONENT_CHOICE"].includes(effect.type))continue;
      if (effect.type === "DRAW" && effect.player === "SELF") {
        own.hand.push(...own.deck.splice(0, effect.count));
      } else if(effect.type==="DRAW_UNTIL_HAND_SIZE"&&effect.player==="SELF"){
        const count=Math.max(0,effect.size-own.hand.length);
        own.hand.push(...own.deck.splice(0,count));
      } else if(effect.type==="DISCARD_HAND_DRAW"){
        own.trash.push(...own.hand.splice(0));
        own.hand.push(...own.deck.splice(0,effect.count));
      } else if(effect.type==="MILL_OPPONENT_DECK"){
        opponent.trash.push(...opponent.deck.splice(0,effect.count));
      } else if(effect.type==="PLACE_DAMAGE_COUNTERS"&&effect.target==="DEFENDING_ACTIVE"){
        victim.damage=(victim.damage??0)+effect.count*10;
      } else if(effect.type==="RESOLVE_DECK_BOTTOM_ATTACK_REVEAL"){
        const shown=own.deck.splice(Math.max(0,own.deck.length-effect.count));
        const returned=shown.filter(x=>this.card(x).cardType==="pokemon"&&
          (this.card(x).raw.attacks??[]).some(a=>a.name===effect.attackName));
        const discarded=shown.filter(x=>!returned.includes(x));
        own.trash.push(...discarded);own.deck.push(...returned);
        let randomState=next.randomState>>>0||1;
        for(let i=own.deck.length-1;i>0;i--){randomState^=randomState<<13;randomState^=randomState>>>17;randomState^=randomState<<5;
          const j=Math.floor((randomState>>>0)/0x100000000*(i+1));[own.deck[i],own.deck[j]]=[own.deck[j],own.deck[i]];}
        next.randomState=randomState;
      } else if (effect.type === "DAMAGE" && effect.target === "ATTACKING_POKEMON") {
        own.active.damage = (own.active.damage ?? 0) + effect.amount;
      } else if(effect.type === "APPLY_STATUS") {
        const statusTarget=effect.target==="ATTACKING_POKEMON"?own.active:victim;
        this.applyStatus(next,statusTarget,effect.status,effect.target==="ATTACKING_POKEMON"?state.turn:1-state.turn);
      } else if(effect.type === "COIN_APPLY_STATUS") {
        if(coin?.heads)this.applyStatus(next,victim,effect.status,1-state.turn);
      } else if (effect.type === "HEAL_OWN_FIELD") {
        for(const pokemon of this.field(own)) pokemon.damage=Math.max(0,(pokemon.damage??0)-effect.amount);
      } else if(effect.type === "HEAL") {
        own.active.damage=Math.max(0,(own.active.damage??0)-effect.amount);
      } else if(effect.type === "DISCARD_ATTACHED") {
        const count=effect.count==="ALL"?own.active.attached.length:effect.count;
        if(count)next.pendingAttack={type:"DISCARD_ENERGY",player:state.turn,side:"own",count,sourceInstanceId:own.active.instanceId};
      } else if(effect.type === "DISCARD_OPPONENT_ENERGY") {
        if(opponent.active.attached?.length)next.pendingAttack={type:"DISCARD_ENERGY",player:state.turn,side:"opponent",count:effect.count,sourceInstanceId:own.active.instanceId};
      } else if(effect.type==="PREVENT_RETREAT_NEXT_TURN"||effect.type==="PREVENT_ATTACK_NEXT_TURN") {
        next.temporaryLocks??=[];
        next.temporaryLocks.push({owner:state.turn,targetInstanceId:victim.instanceId,type:effect.type,expiresTurnNo:next.turnNo+1});
      } else if (effect.type === "COIN_DISCARD_ENERGY") {
        if(coin.heads && opponent.active.attached?.length)
          next.pendingAttack={type:"DISCARD_ENERGY",player:state.turn,side:"opponent",count:1,sourceInstanceId:own.active.instanceId};
      } else if (effect.type === "PREVENT_BASIC_NON_COLORLESS_DAMAGE_NEXT_OPPONENT_TURN") {
        next.attackProtection??=[];
        next.attackProtection.push({owner:state.turn,instanceId:own.active.instanceId});
      } else if (effect.type === "PREVENT_SELF_ATTACK_NEXT_TURN") {
        next.attackLocks??=[];
        next.attackLocks.push({player:state.turn,instanceId:own.active.instanceId,
          turnsTakenAt:state.turnsTaken?.[state.turn]??0});
      } else if(effect.type==="PREVENT_SAME_ATTACK_NEXT_TURN"){
        next.attackLocks??=[];
        next.attackLocks.push({player:state.turn,instanceId:own.active.instanceId,
          attackName:effect.attackName,turnsTakenAt:state.turnsTaken?.[state.turn]??0});
      } else if(effect.type==="REDUCE_INCOMING_ATTACK_DAMAGE_NEXT_TURN"){
        next.attackProtection??=[];
        next.attackProtection.push({owner:state.turn,instanceId:own.active.instanceId,reduceDamage:effect.amount});
      } else if (effect.type === "RETURN_SELF_TO_HAND") {
        const {attached=[],stack=[],...face}=own.active;
        own.hand.push(face,...attached,...stack);
        own.active=null;
        if(own.bench.length)next.pendingAttack={type:"PROMOTE_SELF",player:state.turn};
        else {next.winner=1-state.turn;next.winReason="NO_POKEMON";}
      } else if(effect.type === "SWITCH_SELF") {
        next.pendingAttack={type:"PROMOTE_SELF",player:state.turn,sourceInstanceId:own.active.instanceId};
      } else if(effect.type==="SWITCH_OPPONENT_CHOICE"){
        next.pendingAttack={type:"SWITCH_OPPONENT_CHOICE",player:state.turn};
      } else if(effect.type==="SEARCH_BASIC_ENERGY_ATTACH_BENCH"){
        next.pendingAttack={type:"SEARCH_BASIC_ENERGY_ATTACH_BENCH",player:state.turn,remaining:effect.max};
      } else if (effect.type === "SEARCH_DECK") {
        next.pendingAttack={type:"SEARCH_DECK",player:state.turn,
          sourceInstanceId:own.active.instanceId,max:effect.max,filter:effect.filter,name:effect.name,destination:effect.destination,chosen:0,optional:!!effect.optional};
      } else if(effect.type==="SEARCH_TRASH_TO_HAND"){
        next.pendingAttack={type:"SEARCH_TRASH_TO_HAND",player:state.turn,filter:effect.filter,max:effect.max};
      } else if(effect.type==="RETURN_ATTACHED_ENERGY_TO_HAND"){
        next.pendingAttack={type:"RETURN_ATTACHED_ENERGY_TO_HAND",player:state.turn,
          sourceInstanceId:own.active.instanceId,count:effect.count};
      } else if(effect.type === "PLACE_DAMAGE_COUNTERS_ON_OPPONENT_BENCH") {
        next.pendingAttack={type:"PLACE_DAMAGE_COUNTERS",player:state.turn,remaining:effect.count,
          sourceInstanceId:own.active.instanceId};
      } else if(effect.type==="SEARCH_TRASH_TO_BENCH"){
        next.pendingAttack={type:"SEARCH_TRASH_TO_BENCH",player:state.turn,name:effect.name,
          remaining:Math.min(effect.max,this.benchLimit(state,state.turn)-own.bench.length)};
      } else if(effect.type==="ATTACH_BASIC_FIGHTING_FROM_TRASH_TO_BENCH"){
        next.pendingAttack={type:"ATTACH_BASIC_FIGHTING_FROM_TRASH_TO_BENCH",player:state.turn,
          remaining:effect.max,sourceInstanceId:own.active.instanceId};
      } else if(effect.type==="OPTIONAL_RETURN_THREE_ENERGY_FOR_BENCH_DAMAGE"){
        next.pendingAttack={type:"OPTIONAL_RETURN_THREE_ENERGY_FOR_BENCH_DAMAGE",player:state.turn,
          sourceInstanceId:own.active.instanceId};
      } else if ((effect.type === "MODIFY_DAMAGE" && ["BOTH_ACTIVE_ATTACHED_ENERGY_COUNT","BOTH_BENCH_COUNT",
                   "DEFENDING_ATTACHED_ENERGY_COUNT","COIN_UNTIL_TAILS","DEFENDER_IS_EX","OPPONENT_PRIZES_TAKEN"].includes(effect.basis)) ||
                 (effect.type === "SET_DAMAGE" && ["OWN_BENCH_COUNT","OWN_FIELD_FIRE_ELECTRIC_ENERGY_COUNT",
                   "OPPONENT_EX_COUNT","OPPONENT_PRIZES_TAKEN","OWN_DAMAGE_COUNTERS","OPPONENT_DISCARD_BASIC_ENERGY_COUNT",
                   "DECK_BOTTOM_POKEMON_WITH_ATTACK"].includes(effect.basis)) ||
                 (effect.type==="MODIFY_DAMAGE"&&effect.basis==="TRASH_POKEMON_WITH_ABILITY") ||
                 effect.type==="OPTIONAL_DISCARD_THREE_STEEL_ENERGY_FOR_DAMAGE" ||
                 effect.type === "IGNORE_DEFENDER_ATTACK_EFFECTS" || effect.type === "IGNORE_WEAKNESS_RESISTANCE" ||
                 effect.type === "IGNORE_RESISTANCE" || effect.type === "REQUIRE_OWN_BENCH_POKEMON" ||
                 effect.type === "MODIFY_DAMAGE"&&effect.basis==="ATTACHED_ENERGY_EXCEEDS_ATTACK_COST" ||
                 effect.type === "REDUCE_INCOMING_ATTACK_DAMAGE_NEXT_TURN" || effect.type === "DISCARD_HAND_DRAW" ||
                 ["DAMAGE_CHOSEN_OPPONENT","DAMAGE_CHOSEN_OPPONENT_BENCH","COIN_BONUS","COIN_DAMAGE","MILL_OPPONENT_DECK","DRAW_UNTIL_HAND_SIZE",
                   "PLACE_DAMAGE_COUNTERS","PREVENT_SAME_ATTACK_NEXT_TURN","RESOLVE_DECK_BOTTOM_ATTACK_REVEAL",
                   "REQUIRE_STADIUM_IN_PLAY"].includes(effect.type)) {
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
    if(knockedOut.includes(1-state.turn)&&next.pendingAttack?.type==="SWITCH_OPPONENT_CHOICE")delete next.pendingAttack;
    const firstOfTwo = !state.pendingSecondAttack && !!own.active && this.attacksTwice(state, own.active);
    if (firstOfTwo) next.pendingSecondAttack = { player: state.turn,
      sourceInstanceId: own.active.instanceId, attackIndex: action.attackIndex };
    else delete next.pendingSecondAttack;
    if(knockedOut.length && next.pendingAttack){next.pendingAttack.delayedVictims=knockedOut;
      next.pendingAttack.targetInstanceId=action.targetInstanceId??null;return next;}
    if (knockedOut.length) return this.beginKnockout(next, knockedOut,action.targetInstanceId??null,{source:"opponentAttack",attacker:state.turn});
    if(next.pendingAttack)return next;
    if (firstOfTwo) return next;
    return this.endTurn(next);
  }
}
