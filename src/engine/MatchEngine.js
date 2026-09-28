import { AttackEngine } from "./AttackEngine.js?v=20260928-deckcompile5";
import { parseTrainerText } from "../card-db/parse-trainers.js?v=20260928-deckcompile1";
import { parseAbility } from "../card-db/parse-abilities.js?v=20260928-fourcardfix2";
import { inspectAttacks } from "../card-db/parse-effects.js?v=20260928-fourcardfix1";

const BASIC = "たね";
const TRAINERS = {
  "ハイパーボール": { type: "item", cost: 2, max: 1, zone: "hand", filter: "pokemon", text: "このカードは、自分の手札を2枚トラッシュしなければ使えない。\n自分の山札からポケモンを1枚選び、相手に見せて、手札に加える。そして山札を切る。" },
  "なかよしポフィン": { type: "item", max: 2, zone: "bench", filter: "smallBasic", text: "自分の山札から、HPが「70」以下のたねポケモンを2枚まで選び、ベンチに出す。そして山札を切る。" },
  "ポケパッド": { type: "item", max: 1, zone: "hand", filter: "nonRulePokemon", text: "自分の山札からポケモン（「ルールを持つポケモン」をのぞく）を1枚選び、相手に見せて、手札に加える。そして山札を切る。" },
  "メガシグナル": { type: "item", max: 1, zone: "hand", filter: "mega", text: "自分の山札から「メガシンカex」を1枚選び、相手に見せて、手札に加える。そして山札を切る。" },
  "シアノ": { type: "supporter", max: 3, zone: "hand", filter: "ex", text: "自分の山札から「ポケモンex」を3枚まで選び、相手に見せて、手札に加える。そして山札を切る。" },
  "ぼうけんのランタン": { type: "item", max: 2, zone: "hand", filter: "lantern", text: "自分の山札から「基本Fireエネルギー」と「基本Electricエネルギー」を1枚ずつ選び、相手に見せて、手札に加える。そして山札を切る。" },
  "リーリエの決心": { type: "supporter", effect: "lillie", text: "自分の手札をすべて山札にもどして切る。その後、山札を6枚引く。自分のサイドの残り枚数が6枚なら、引く枚数は8枚になる。" },
  "カスミの元気": { type: "supporter", effect: "kasumi", text: "このカードを使ったなら、自分の番は終わる。\\n自分の山札から「基本Waterエネルギー」を4枚まで選び、自分のポケモン1匹につける。そして山札を切る。" },
  "ポケギア3.0": { type: "item", effect: "pokegear", max: 1, filter: "supporter", text: "自分の山札を上から7枚見て、その中からサポートを1枚選び、相手に見せて、手札に加える。残りのカードは山札にもどして切る。" },
  "ジャンボアイス": { type: "item", effect: "jumbice", text: "エネルギーが3個以上ついている自分のバトルポケモンのHPを「80」回復する。" },
  "大漁ネット": { type: "item", effect: "tairyounet", max: 6, filter: "waterRecovery", text: "自分のトラッシュからWaterポケモンと「基本Waterエネルギー」をそれぞれ3枚まで選び、相手に見せて、山札にもどして切る。" },
  "スグリ": { type: "supporter", effect: "suguri", text: "このカードは、2つの効果から1つを選んで使う。\\n◆自分のバトルポケモンをベンチポケモンと入れ替える。\\n◆この番、自分のポケモンが使うワザの、相手のバトル場の「ポケモンex・V」へのダメージは「+30」される。" },
  "なみのりビーチ": { type: "stadium", effect: "surfingBeach", text: "おたがいのプレイヤーは、自分の番ごとに1回、自分のバトル場のWaterポケモンを、ベンチのWaterポケモンと入れ替えてよい。" },
  "ヘビーバトン": { type: "tool", effect: "heavyBaton", text: "このカードをつけているにげるためのエネルギーが4個のポケモンが、バトル場で相手のポケモンからワザのダメージを受けてきぜつしたとき、そのポケモンについている基本エネルギーを3枚まで選び、自分のベンチポケモンに好きなようにつけ替える。" },
  "バブル水エネルギー": { type: "specialEnergy", effect: "bubbleWater", text: "このカードは、ポケモンについているかぎり、Waterエネルギー1個ぶんとしてはたらく。\\nこのカードをつけているWaterポケモンは、特殊状態にならず、受けている特殊状態は、すべて回復する。" },
  "夜のタンカ": { type: "item", effect: "rod", text: "自分のトラッシュからポケモンまたは基本エネルギーを1枚選び、相手に見せて、手札に加える。" },
  "ボスの指令": { type: "supporter", effect: "boss", text: "相手のベンチポケモンを1匹選び、バトルポケモンと入れ替える。" },
  "ポケモンいれかえ": { type: "item", effect: "switch", text: "自分のバトルポケモンをベンチポケモンと入れ替える。" },
  "エネルギーつけかえ": { type: "item", effect: "transfer", text: "自分の場のポケモンについている基本エネルギーを1個選び、自分の別のポケモンにつけ替える。" },
  "スペシャルレッドカード": { type: "item", effect: "red", text: "このカードは、相手のサイドの残り枚数が3枚以下のときにしか使えない。\n相手は相手自身の手札をすべてウラにして切り、山札の下にもどす。その後、相手は山札を3枚引く。" },
  "アカマツ": { type: "supporter", effect: "akamatsu", text: "自分の山札から、それぞれちがうタイプの基本エネルギーを2枚まで選び、相手に見せて、どちらか1枚を手札に加え、残りのエネルギーを自分のポケモンにつける。そして山札を切る。" },
  "パーフェクトミキサー": { type: "item", effect: "mixer", max: 5, zone: "trash", filter: "any", text: "自分の山札から好きなカードを5枚まで選び、トラッシュする。そして山札を切る。" },
  "ギリー": { type: "supporter", max: 3, zone: "hand", filter: "supporterStadium", text: "自分の山札からサポートとスタジアムを合計3枚まで選び、相手に見せて、手札に加える。そして山札を切る。" },
  "スイレンのお世話": { type: "supporter", effect: "care", max: 3, text: "自分のトラッシュからポケモン（「ルールを持つポケモン」をのぞく）と基本エネルギーを合計3枚まで選び、相手に見せて、手札に加える。" },
  "むしとりセット": { type: "item", effect: "mushitoriSet", max: 2, zone: "hand", filter: "mushitoriSet", text: "自分の山札を上から7枚見て、その中からGrassポケモンと「基本Grassエネルギー」を合計2枚まで選び、相手に見せて、手札に加える。残りのカードは山札にもどして切る。" },
  "シークレットボックス": { type: "item", effect: "secretBox", cost: 3, max: 4, zone: "hand", filter: "secretBox", text: "このカードは、自分の手札を3枚トラッシュしなければ使えない。\n自分の山札から「グッズ」「ポケモンのどうぐ」「サポート」「スタジアム」を1枚ずつ選び、相手に見せて、手札に加える。そして山札を切る。" },
  "ジャッジマン": { type: "supporter", effect: "judge", text: "おたがいのプレイヤーは、それぞれ、手札をすべて山札にもどし、山札を切る。その後、それぞれの山札からカードを4枚引く。\nサポーターは、自分の番に1枚だけ使える。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュ。" },
  "からておうの稽古": { type: "supporter", effect: "karate", text: "この番、自分のポケモンが使うワザの、相手のバトル場の「ポケモンex」へのダメージは「+40」される。" },
  "Nのポイントアップ": { type: "item", effect: "nPoint", text: "自分のトラッシュから基本エネルギーを1枚選び、ベンチの「Nのポケモン」につける。" }
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
      stadiumEffectUsedTurns: [-1, -1], damageBonuses: [],
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

  trainerEffectText(card){
    let text=String(card.raw.effect??"");
    const reminders=[
      "\nサポートは、自分の番に1枚しか使えない。",
      "\nサポーターは、自分の番に1枚だけ使える。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュ。",
      "\nサポートは自分の番に1枚しか使えない。"
    ];
    for(const reminder of reminders)if(text.endsWith(reminder))text=text.slice(0,-reminder.length);
    return text;
  }

  trainerSpec(instance) {
    const card = this.card(instance), spec = TRAINERS[card.name], effectText=this.trainerEffectText(card);
    const deckProgram=this.deckPrograms.get(instance.cardId);
    if(deckProgram?.trainer)return deckProgram.trainer;
    if(card.name==="ジャッジマン"&&card.trainerType==="supporter"){
      const reminder="\nサポーターは、自分の番に1枚だけ使える。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュ。";
      const text=card.raw.effect.endsWith(reminder)?card.raw.effect.slice(0,-reminder.length):card.raw.effect;
      if([TRAINERS["ジャッジマン"].text,
        "おたがいのプレイヤーは、それぞれ、手札をすべて山札にもどし、山札を切る。その後、それぞれの山札を4枚引く。",
        "おたがいのプレイヤーは、それぞれの手札をすべて山札にもどして切る。その後、それぞれの山札を4枚引く。",
        "おたがいのプレイヤーは、それぞれ手札をすべて山札にもどして切る。その後、それぞれ山札を4枚引く。",
        "おたがいのプレイヤーは、それぞれ手札をすべて山札にもどして切る。その後、それぞれの山札を4枚引く。"].includes(text))
        return TRAINERS["ジャッジマン"];
    }
    const matched=spec&&card.trainerType===spec.type&&effectText===spec.text?spec:
      Object.values(TRAINERS).find(candidate=>card.trainerType===candidate.type&&effectText===candidate.text);
    return matched??parseTrainerText(card);
  }

  async compileDeck(decks,onProgress=()=>{}) {
    if(!Array.isArray(decks)||decks.length!==2)throw new Error("Two decks are required for effect compilation");
    const counts=new Map();
    for(let side=0;side<decks.length;side++)for(const item of decks[side].cards??[]){
      const id=item.officialCardId??item.cardId??item.id;
      if(!id||!this.repository.get(id))throw new Error(`Unknown card in deck compilation: ${id??"(missing ID)"}`);
      const entry=counts.get(id)??{copies:[0,0]};entry.copies[side]+=item.count??1;counts.set(id,entry);
    }
    this.deckPrograms.clear();
    const rows=[...counts],results=[];
    for(let index=0;index<rows.length;index++){
      const [id,meta]=rows[index],instance={cardId:id,instanceId:`compile-${id}`,attached:[]},card=this.card(instance);
      const abilities=(card.raw.abilities??[]).map((ability,abilityIndex)=>({index:abilityIndex,name:ability.name,
        text:ability.effect,...parseAbility(ability.name,ability.effect)}));
      const attacks=inspectAttacks(card);
      let trainer=null;
      if(card.trainerType){
        const existing=TRAINERS[card.name],effectText=this.trainerEffectText(card);
        trainer=existing&&card.trainerType===existing.type&&effectText===existing.text?existing:
          Object.values(TRAINERS).find(candidate=>card.trainerType===candidate.type&&effectText===candidate.text)??parseTrainerText({...card,raw:{...card.raw,effect:effectText}});
        if(card.trainerType==="stadium"&&this.isSupportedStadium(instance))trainer={type:"stadium",effect:"stadium",text:card.raw.effect,compiledFromText:true};
        if(card.trainerType==="tool"&&this.isSupportedTool(instance))trainer={type:"tool",effect:"tool",text:card.raw.effect,compiledFromText:true};
      }
      const program={abilities,attacks,trainer,sourceText:{abilities:(card.raw.abilities??[]).map(x=>x.effect),attacks:(card.raw.attacks??[]).map(x=>x.effect??"").concat((card.raw.attacks??[]).map(x=>x.text??"")),trainer:card.raw.effect??""}};
      this.deckPrograms.set(id,program);
      const effects=[...abilities,...attacks,...(card.trainerType?[trainer]:[])].filter(Boolean);
      const supported=effects.every(effect=>effect.status==="supported"||effect.status===undefined)&&
        (!card.trainerType||trainer!==null);
      results.push({officialCardId:id,name:card.name,copies:meta.copies,supported,program});
      onProgress({done:index+1,total:rows.length,card:card.name,result:results.at(-1)});
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    return results;
  }

  scheduleBenchCleanup(state,preferredPlayer=null){
    const order=preferredPlayer===null?[state.stadiumOwner,1-state.stadiumOwner]:[preferredPlayer,1-preferredPlayer];
    const players=[...new Set(order.filter(x=>x===0||x===1))]
      .filter(index=>state.players[index].bench.length>this.benchLimit(state,index));
    if(players.length)state.pendingBenchCleanup={players,index:0};
    else delete state.pendingBenchCleanup;
  }

  benchCleanupActions(state){
    const pending=state.pendingBenchCleanup;
    while(pending.index<pending.players.length&&
      state.players[pending.players[pending.index]].bench.length<=this.benchLimit(state,pending.players[pending.index]))
      pending.index++;
    if(pending.index>=pending.players.length)return [{type:"BENCH_CLEANUP_FINISH"}];
    const player=pending.players[pending.index];
    return state.players[player].bench.map(instance=>({type:"DISCARD_EXCESS_BENCH",player,
      sourceInstanceId:instance.instanceId}));
  }

  searchCandidate(instance, spec, pending, player, state = null, playerIndex = state?.turn ?? null) {
    const card = this.card(instance);
    if(spec.filter==="basicEnergy"||spec.filter.startsWith?.("basicEnergy:")){
      if(card.energyType!=="basic")return false;
      const wanted=spec.filter.split(":")[1];
      return !wanted||card.name.endsWith(({Grass:"草",Fire:"炎",Water:"水",Electric:"雷",Psychic:"超",Fighting:"闘",Dark:"悪",Metal:"鋼"})[wanted]+"エネルギー");
    }
    if(spec.filter==="energy")return card.cardType==="energy";
    if(spec.filter==="trainer")return !!card.trainerType;
    if(spec.filter.startsWith?.("namePrefix:"))return card.name.startsWith(spec.filter.slice(11));
    if(spec.filter.startsWith?.("name:"))return card.name===spec.filter.slice(5);
    if(spec.filter==="basicPokemon")return card.cardType==="pokemon"&&card.raw.stage===BASIC&&
      player.bench.length<(state?this.benchLimit(state,playerIndex):5)&&this.entries(instance).every(x=>x.status==="supported");
    switch (spec.filter) {
      case "pokemon": return card.cardType === "pokemon";
      case "smallBasic": return card.cardType === "pokemon" && card.raw.stage === BASIC && card.raw.hp <= 70 &&
        this.entries(instance).every(x => x.status === "supported") &&
        player.bench.length < (state ? this.benchLimit(state, playerIndex) : 5);
      case "nonRulePokemon": return card.cardType === "pokemon" && !card.raw.rule_box && !(card.raw.tags ?? []).some(x => ["ex", "V", "GX", "メガシンカ"].includes(x));
      case "mega": return card.cardType === "pokemon" && (card.raw.tags ?? []).includes("メガシンカ");
      case "ex": return card.cardType === "pokemon" && (card.raw.tags ?? []).includes("ex");
      case "lantern": return ["基本炎エネルギー", "基本雷エネルギー"].includes(card.name) &&
        !pending.selectedNames.includes(card.name);
      case "supporterStadium": return card.trainerType==="supporter"||card.trainerType==="stadium";
      case "mushitoriSet": return (card.cardType==="pokemon"&&card.raw.types?.includes("Grass"))||
        (card.energyType==="basic"&&card.name==="基本草エネルギー");
      case "secretBox": return ["item","tool","supporter","stadium"].includes(card.trainerType)&&
        !pending.selectedTypes?.includes(card.trainerType);
      case "any": return true;
      default: return false;
    }
  }

  trainerActions(state) {
    const player = state.players[state.turn], actions = [];
    if (state.pendingTrainer) {
      const pending = state.pendingTrainer;
      const source=player.trash.find(x=>x.instanceId===pending.sourceInstanceId);
      const spec=source?this.trainerSpec(source):TRAINERS[pending.name];
      if(pending.name==="カスミの元気"){
        const choices=player.deck.filter(x=>this.card(x).name==="基本水エネルギー");
        if(!pending.selectedTargetId)for(const target of this.field(player))actions.push({type:"KASUMI_TARGET",player:state.turn,targetInstanceId:target.instanceId});
        if(pending.selectedTargetId&&pending.remaining>0)for(const energy of choices)actions.push({type:"KASUMI_ENERGY",player:state.turn,choiceInstanceId:energy.instanceId});
        actions.push({type:"KASUMI_FINISH",player:state.turn});return actions;
      }
      if(pending.name==="大漁ネット"){
        const pokemonCount=pending.selectedTypes.filter(x=>x==="pokemon").length;
        const energyCount=pending.selectedTypes.filter(x=>x==="energy").length;
        const candidates=player.trash.filter(x=>{const c=this.card(x);return c.cardType==="pokemon"&&c.raw.types?.includes("Water")&&pokemonCount<3||c.name==="基本水エネルギー"&&energyCount<3;});
        if(pending.selectedNames.length<6)for(const candidate of candidates)actions.push({type:"TAIRYOU_SELECT",player:state.turn,choiceInstanceId:candidate.instanceId});
        actions.push({type:"TAIRYOU_FINISH",player:state.turn});return actions;
      }
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
      if(pending.name==="スイレンのお世話"||spec?.effect==="care"){
        const choices=player.trash.filter(instance=>{
          const card=this.card(instance);
          return card.energyType==="basic"||card.cardType==="pokemon"&&!card.raw.rule_box&&
            !(card.raw.tags??[]).some(tag=>["ex","V","GX","メガシンカ"].includes(tag));
        });
        if(pending.selectedNames.length<3)for(const instance of choices)actions.push({type:"TRAINER_SELECT",player:state.turn,
          sourceInstanceId:pending.sourceInstanceId,choiceInstanceId:instance.instanceId});
        actions.push({type:"TRAINER_FINISH",player:state.turn,sourceInstanceId:pending.sourceInstanceId});return actions;
      }
      if(pending.name==="むしとりセット"){
        const choices=pending.lookedInstanceIds.map(id=>player.deck.find(x=>x.instanceId===id)).filter(x=>
          x&&this.searchCandidate(x,spec,pending,player,state,state.turn));
        if(pending.selectedNames.length<2)for(const item of choices)actions.push({type:"TRAINER_SELECT",player:state.turn,
          sourceInstanceId:pending.sourceInstanceId,choiceInstanceId:item.instanceId});
        actions.push({type:"TRAINER_FINISH",player:state.turn,sourceInstanceId:pending.sourceInstanceId});return actions;
      }
      if (pending.costLeft) {
        for (const card of player.hand) actions.push({ type: "TRAINER_DISCARD", player: state.turn,
          sourceInstanceId: pending.sourceInstanceId, choiceInstanceId: card.instanceId });
      } else {
        if (pending.selectedNames.length < spec.max) for (const card of player.deck) {
          if (this.searchCandidate(card, spec, pending, player,state,state.turn)) actions.push({ type: "TRAINER_SELECT", player: state.turn,
            sourceInstanceId: pending.sourceInstanceId, choiceInstanceId: card.instanceId });
        }
        if(spec?.effect!=="secretBox"||!actions.some(x=>x.type==="TRAINER_SELECT"))
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
      } else if(spec.effect==="nPoint"){
        const energies=player.trash.filter(x=>this.card(x).energyType==="basic");
        const targets=player.bench.filter(x=>this.card(x).name.startsWith("Nの"));
        for(const energy of energies)for(const target of targets)actions.push({type:"PLAY_TRAINER",player:state.turn,
          sourceInstanceId:instance.instanceId,choiceInstanceId:energy.instanceId,targetInstanceId:target.instanceId});
      } else if(spec.effect==="pokegear"){
        const looked=player.deck.slice(0,7);
        for(const choice of looked)if(this.card(choice).trainerType==="supporter")actions.push({type:"PLAY_TRAINER",player:state.turn,
          sourceInstanceId:instance.instanceId,choiceInstanceId:choice.instanceId});
        actions.push({type:"PLAY_TRAINER",player:state.turn,sourceInstanceId:instance.instanceId});
      } else if(spec.effect==="jumbice"){
        if(player.active&&(player.active.attached??[]).length>=3&&(player.active.damage??0)>0)actions.push({type:"PLAY_TRAINER",player:state.turn,sourceInstanceId:instance.instanceId});
      } else if(spec.effect==="tairyounet"){
        if(player.trash.some(x=>this.card(x).cardType==="pokemon"&&this.card(x).raw.types?.includes("Water"))||
          player.trash.some(x=>this.card(x).name==="基本水エネルギー"))
          actions.push({type:"PLAY_TRAINER",player:state.turn,sourceInstanceId:instance.instanceId});
      } else if(spec.effect==="kasumi"){
        if(player.deck.some(x=>this.card(x).name==="基本水エネルギー")&&this.field(player).length)
          actions.push({type:"PLAY_TRAINER",player:state.turn,sourceInstanceId:instance.instanceId});
      } else if(spec.effect==="suguri"){
        for(const target of player.bench)actions.push({type:"PLAY_TRAINER",player:state.turn,
          sourceInstanceId:instance.instanceId,choiceInstanceId:target.instanceId,mode:"switch"});
        actions.push({type:"PLAY_TRAINER",player:state.turn,sourceInstanceId:instance.instanceId,mode:"damage"});
      } else if(spec.effect==="mushitoriSet"){
        actions.push({type:"PLAY_TRAINER",player:state.turn,sourceInstanceId:instance.instanceId});
      } else if(spec.effect==="tairyounet"){
        const waterPokemon=player.trash.some(x=>this.card(x).cardType==="pokemon"&&this.card(x).raw.types?.includes("Water"));
        const waterEnergy=player.trash.some(x=>this.card(x).name==="基本水エネルギー");
        if(waterPokemon||waterEnergy)actions.push({type:"PLAY_TRAINER",player:state.turn,sourceInstanceId:instance.instanceId});
      } else if(spec.effect==="kasumi"){
        if(player.deck.some(x=>this.card(x).name==="基本水エネルギー")&&this.field(player).length)
          actions.push({type:"PLAY_TRAINER",player:state.turn,sourceInstanceId:instance.instanceId});
      } else if(spec.effect==="suguri"){
        for(const target of player.bench)actions.push({type:"PLAY_TRAINER",player:state.turn,
          sourceInstanceId:instance.instanceId,choiceInstanceId:target.instanceId,mode:"switch"});
        actions.push({type:"PLAY_TRAINER",player:state.turn,sourceInstanceId:instance.instanceId,mode:"damage"});
      } else if(spec.effect==="secretBox"){
        if(player.hand.length>=4)actions.push({type:"PLAY_TRAINER",player:state.turn,sourceInstanceId:instance.instanceId});
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
    if(pending.name === "ほうせきさがし"){
      const choices=own.deck.filter(x=>this.card(x).trainerType);
      return [...choices.map(x=>({type:"ABILITY_SELECT",player:state.turn,sourceInstanceId:pending.sourceInstanceId,
        choiceInstanceId:x.instanceId})),
        {type:"ABILITY_SKIP",player:state.turn,sourceInstanceId:pending.sourceInstanceId}];
    }
    if(pending.name === "ファンコール"){
      const choices=own.deck.filter(x=>this.card(x).cardType==="pokemon"&&
        this.card(x).raw.types?.includes("Colorless")&&this.card(x).raw.hp<=100);
      return [...choices.map(x=>({type:"ABILITY_SELECT",player:state.turn,sourceInstanceId:pending.sourceInstanceId,
        choiceInstanceId:x.instanceId})),
        {type:"ABILITY_SKIP",player:state.turn,sourceInstanceId:pending.sourceInstanceId}];
    }
    if(pending.name === "メタルシグナル"){
      const choices=own.deck.filter(x=>this.card(x).cardType==="pokemon"&&
        this.card(x).raw.types?.includes("Steel")&&this.card(x).raw.stage!==BASIC);
      return [...choices.map(x=>({type:"ABILITY_SELECT",player:state.turn,sourceInstanceId:pending.sourceInstanceId,
        choiceInstanceId:x.instanceId})),
        {type:"ABILITY_SKIP",player:state.turn,sourceInstanceId:pending.sourceInstanceId}];
    }
    if(pending.name === "メタルメーカー"){
      const energies=pending.lookedInstanceIds.map(id=>own.deck.find(x=>x.instanceId===id)).filter(x=>
        x&&this.card(x).energyType==="basic"&&this.card(x).name==="基本鋼エネルギー");
      return [...energies.flatMap(energy=>this.field(own).map(target=>({type:"ABILITY_SELECT",player:state.turn,
        sourceInstanceId:pending.sourceInstanceId,choiceInstanceId:energy.instanceId,targetInstanceId:target.instanceId}))),
        {type:"ABILITY_SKIP",player:state.turn,sourceInstanceId:pending.sourceInstanceId}];
    }
    if(pending.name === "ラピッドバーニア"){
      const source=own.active?.instanceId===pending.sourceInstanceId?own.active:null;
      const energies=this.field(own).filter(x=>x!==source).flatMap(x=>x.attached??[]);
      return [...energies.map(x=>({type:"ABILITY_SELECT",player:state.turn,sourceInstanceId:pending.sourceInstanceId,
        choiceInstanceId:x.instanceId})),
        {type:"ABILITY_SKIP",player:state.turn,sourceInstanceId:pending.sourceInstanceId}];
    }
    if (pending.name === "こんじきのほのお") return [
      ...own.hand.filter(x=>this.card(x).name === "基本炎エネルギー").map(x=>({
        type:"ABILITY_SELECT",player:state.turn,sourceInstanceId:pending.sourceInstanceId,
        choiceInstanceId:x.instanceId,targetInstanceId:pending.targetInstanceId})),
      {type:"ABILITY_SKIP",player:state.turn,sourceInstanceId:pending.sourceInstanceId}];
    if(pending.name === "にげあしドロー") return own.bench.map(x=>({type:"ABILITY_SELECT",player:state.turn,
      sourceInstanceId:pending.sourceInstanceId,targetInstanceId:x.instanceId}));
    const choices=pending.name === "はしゃのほうこう" ? own.deck.slice(0,4).filter(x=>this.card(x).energyType === "basic")
      : own.deck.filter(x=>this.card(x).trainerType === "supporter");
    return [...choices.map(x=>({type:"ABILITY_SELECT",player:state.turn,sourceInstanceId:pending.sourceInstanceId,
      choiceInstanceId:x.instanceId})),
      {type:"ABILITY_SKIP",player:state.turn,sourceInstanceId:pending.sourceInstanceId}];
  }

  beginBenchAbility(state, instance) {
    const entry=this.entries(instance, state)[0];
    if (entry?.trigger !== "ON_BENCH_FROM_HAND") return;
    if(entry.operations.some(op=>op.type==="DISCARD_STADIUM_FROM_PLAY")){
      if(state.stadium){
        const oldOwner=state.stadiumOwner;
        state.players[state.stadiumOwner].trash.push(state.stadium);
        state.stadium=null;
        state.stadiumOwner=null;
        this.scheduleBenchCleanup(state,oldOwner);
      }
      return;
    }
    if(entry.operations.some(op=>op.type==="SWITCH_SELF_ACTIVE_THEN_MOVE_ENERGY")){
      const player=state.players[state.turn],index=player.bench.findIndex(x=>x.instanceId===instance.instanceId);
      if(index<0||!player.active)throw new Error("Rapid Vernier requires an Active Pokémon and a Benched source");
      const incoming=player.bench.splice(index,1)[0],outgoing=player.active;
      player.active=incoming;player.bench.push(outgoing);
      this.clearSwitchStatuses(incoming);this.clearSwitchStatuses(outgoing);
      state.pendingAbility={name:entry.name,sourceInstanceId:instance.instanceId};
      return;
    }
    if (entry.name === "おくのてキャッチ") {
      if (state.usedAbilities?.names?.includes(entry.name)) return;
      state.usedAbilities ??= {instances:[],names:[]};
      state.usedAbilities.names.push(entry.name);
    }
    state.pendingAbility={name:entry.name,sourceInstanceId:instance.instanceId};
  }

  applyBenchAbility(state,action) {
    const next=structuredClone(state),player=next.players[action.player];
    if(next.pendingAbility.name === "ほうせきさがし"){
      if(action.type === "ABILITY_SELECT"){
        const index=player.deck.findIndex(x=>x.instanceId===action.choiceInstanceId);
        if(index<0||!this.card(player.deck[index]).trainerType)throw new Error("Invalid Trainer search choice");
        player.hand.push(player.deck.splice(index,1)[0]);
        next.pendingAbility.remaining--;
        if(next.pendingAbility.remaining&&player.deck.some(x=>this.card(x).trainerType))return next;
      }
      this.shufflePlayer(next,player);
      delete next.pendingAbility;return next;
    }
    if(next.pendingAbility.name === "にげあしドロー"){
      const index=player.bench.findIndex(x=>x.instanceId===action.targetInstanceId);
      player.active=player.bench.splice(index,1)[0];
      delete next.pendingAbility;
      return next;
    }
    if(next.pendingAbility.name==="ラピッドバーニア"){
      if(action.type==="ABILITY_SELECT"){
        const target=player.active?.instanceId===next.pendingAbility.sourceInstanceId?player.active:null;
        let from=null,energyIndex=-1;
        for(const pokemon of this.field(player))if(pokemon!==target){
          const index=(pokemon.attached??[]).findIndex(x=>x.instanceId===action.choiceInstanceId);
          if(index>=0){from=pokemon;energyIndex=index;break;}
        }
        if(!target||!from)throw new Error("Invalid Rapid Vernier Energy selection");
        target.attached??=[];target.attached.push(from.attached.splice(energyIndex,1)[0]);
        if(this.field(player).filter(x=>x!==target).some(x=>(x.attached??[]).length))return next;
      }
      delete next.pendingAbility;return next;
    }
    if (next.pendingAbility.name === "こんじきのほのお") {
      if(action.type === "ABILITY_SELECT"){
        const i=player.hand.findIndex(x=>x.instanceId===action.choiceInstanceId);
        player.bench.find(x=>x.instanceId===action.targetInstanceId).attached.push(player.hand.splice(i,1)[0]);
        next.pendingAbility.remaining--;
        if(next.pendingAbility.remaining) return next;
      }
      delete next.pendingAbility;return next;
    }
    if(next.pendingAbility.name === "ファンコール"){
      if(action.type === "ABILITY_SELECT"){
        const index=player.deck.findIndex(x=>x.instanceId===action.choiceInstanceId),chosen=player.deck[index];
        if(index<0||this.card(chosen).cardType!=="pokemon"||!this.card(chosen).raw.types?.includes("Colorless")||
          this.card(chosen).raw.hp>100)throw new Error("Invalid Fan Call selection");
        player.hand.push(player.deck.splice(index,1)[0]);next.pendingAbility.remaining--;
        const hasMore=player.deck.some(x=>this.card(x).cardType==="pokemon"&&this.card(x).raw.types?.includes("Colorless")&&this.card(x).raw.hp<=100);
        if(next.pendingAbility.remaining&&hasMore)return next;
      }
      this.shufflePlayer(next,player);delete next.pendingAbility;return next;
    }
    if(next.pendingAbility.name === "メタルシグナル"){
      if(action.type === "ABILITY_SELECT"){
        const index=player.deck.findIndex(x=>x.instanceId===action.choiceInstanceId);
        const chosen=player.deck[index];
        if(index<0||this.card(chosen).cardType!=="pokemon"||!this.card(chosen).raw.types?.includes("Steel")||
           this.card(chosen).raw.stage===BASIC)throw new Error("Invalid Steel Evolution search choice");
        player.hand.push(player.deck.splice(index,1)[0]);
        next.pendingAbility.remaining--;
        const hasMore=player.deck.some(x=>this.card(x).cardType==="pokemon"&&
          this.card(x).raw.types?.includes("Steel")&&this.card(x).raw.stage!==BASIC);
        if(next.pendingAbility.remaining&&hasMore)return next;
      }
      this.shufflePlayer(next,player);
      delete next.pendingAbility;return next;
    }
    if(next.pendingAbility.name === "メタルメーカー"){
      if(action.type === "ABILITY_SELECT"){
        const index=player.deck.findIndex(x=>x.instanceId===action.choiceInstanceId);
        const target=this.field(player).find(x=>x.instanceId===action.targetInstanceId);
        if(index<0||!next.pendingAbility.lookedInstanceIds.includes(action.choiceInstanceId)||
           this.card(player.deck[index]).energyType!=="basic"||this.card(player.deck[index]).name!=="基本鋼エネルギー"||!target)
          throw new Error("Invalid Metal Maker selection");
        target.attached??=[];
        target.attached.push(player.deck.splice(index,1)[0]);
        next.pendingAbility.lookedInstanceIds=next.pendingAbility.lookedInstanceIds.filter(id=>id!==action.choiceInstanceId);
        next.pendingAbility.remaining--;
        if(next.pendingAbility.remaining&&next.pendingAbility.lookedInstanceIds.some(id=>{
          const x=player.deck.find(y=>y.instanceId===id);
          return x&&this.card(x).energyType==="basic"&&this.card(x).name==="基本鋼エネルギー";
        }))return next;
      }
      const bottom=[];
      for(const id of next.pendingAbility.lookedInstanceIds){
        const index=player.deck.findIndex(x=>x.instanceId===id);
        if(index>=0)bottom.push(player.deck.splice(index,1)[0]);
      }
      this.shuffleSubset(next,bottom);
      player.deck.push(...bottom);
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

  attackSearchMatches(instance,pending,owner,state=null){
    const card=this.card(instance);
    if(pending.filter==="any")return true;
    if(pending.filter==="pokemon")return card.cardType==="pokemon";
    if(pending.filter==="basicEnergy")return card.energyType==="basic";
    if(pending.filter==="basicPokemon")return card.cardType==="pokemon"&&card.raw.stage==="たね"&&
      owner.bench.length<(state?this.benchLimit(state,pending.player):5)&&
      this.entries(instance).every(entry=>entry.status==="supported");
    if(pending.filter==="exactName")return card.cardType==="pokemon"&&card.name===pending.name&&
      card.raw.stage==="たね"&&owner.bench.length<(state?this.benchLimit(state,pending.player):5)&&
      this.entries(instance).every(entry=>entry.status==="supported");
    return false;
  }

  attackEffectActions(state) {
    const pending=state.pendingAttack,owner=state.players[pending.player];
    if(pending.type==="SEARCH_BASIC_ENERGY_ATTACH_BENCH"){
      const energies=owner.deck.filter(x=>this.card(x).energyType==="basic").slice(0,pending.remaining);
      return [...energies.flatMap(energy=>owner.bench.map(target=>({type:"ATTACK_SEARCH",player:pending.player,
        choiceInstanceId:energy.instanceId,targetInstanceId:target.instanceId}))),
        {type:"ATTACK_SEARCH_FINISH",player:pending.player}];
    }
    if(pending.type==="SEARCH_TRASH_TO_HAND"){
      const choices=owner.trash.filter(x=>this.card(x).cardType==="pokemon");
      return [...choices.map(x=>({type:"ATTACK_SEARCH",player:pending.player,choiceInstanceId:x.instanceId})),
        {type:"ATTACK_SEARCH_FINISH",player:pending.player}];
    }
    if(pending.type==="RETURN_ATTACHED_ENERGY_TO_HAND")return [
      ...(owner.active?.attached??[]).map(x=>({type:"ATTACK_RETURN_ENERGY_TO_HAND",player:pending.player,choiceInstanceId:x.instanceId})),
      {type:"ATTACK_SEARCH_FINISH",player:pending.player}];
    if(pending.type==="SEARCH_TRASH_TO_BENCH"){
      const choices=owner.trash.filter(x=>this.card(x).name===pending.name)
        .slice(0,Math.min(pending.remaining,this.benchLimit(state,pending.player)-owner.bench.length));
      return [...choices.map(x=>({type:"ATTACK_SEARCH",player:pending.player,choiceInstanceId:x.instanceId})),
        {type:"ATTACK_SEARCH_FINISH",player:pending.player}];
    }
    if(pending.type==="ATTACH_BASIC_FIGHTING_FROM_TRASH_TO_BENCH"){
      const energies=owner.trash.filter(x=>this.card(x).name==="基本闘エネルギー").slice(0,pending.remaining);
      return [...energies.flatMap(energy=>owner.bench.map(target=>({type:"ATTACK_SEARCH",player:pending.player,
        choiceInstanceId:energy.instanceId,targetInstanceId:target.instanceId}))),
        {type:"ATTACK_SEARCH_FINISH",player:pending.player}];
    }
    if(pending.type==="OPTIONAL_RETURN_THREE_ENERGY_FOR_BENCH_DAMAGE"){
      const attached=owner.active?.attached??[],combos=[];
      const pick=(start,chosen)=>{
        if(chosen.length===3){combos.push([...chosen]);return;}
        for(let i=start;i<attached.length;i++)pick(i+1,[...chosen,attached[i].instanceId]);
      };
      pick(0,[]);
      return [...combos.map(choiceInstanceIds=>({type:"ATTACK_RETURN_ENERGY",player:pending.player,choiceInstanceIds})),
        {type:"ATTACK_SKIP_ENERGY_RETURN",player:pending.player}];
    }
    if(pending.type==="BENCH_DAMAGE_TARGET")return state.players[1-pending.player].bench.map(target=>
      ({type:"ATTACK_BENCH_DAMAGE_TARGET",player:pending.player,targetInstanceId:target.instanceId}));
    if(pending.type==="SWITCH_OPPONENT_CHOICE")return state.players[1-pending.player].bench.map(target=>
      ({type:"ATTACK_OPPONENT_PROMOTE",player:1-pending.player,targetInstanceId:target.instanceId}));
    if(pending.type==="PLACE_DAMAGE_COUNTERS"){
      const targets=state.players[1-pending.player].bench;
      if(!pending.remaining||!targets.length)return [{type:"ATTACK_COUNTERS_FINISH",player:pending.player}];
      return targets.map(target=>({type:"ATTACK_COUNTER_PLACE",player:pending.player,
        targetInstanceId:target.instanceId}));
    }
    if(pending.type === "PROMOTE_SELF")return owner.bench.map(x=>({type:"ATTACK_PROMOTE",player:pending.player,
      targetInstanceId:x.instanceId}));
    if(pending.type === "DISCARD_ENERGY"){
      const ownerIndex=pending.side==="own"?pending.player:1-pending.player;
      const target=state.players[ownerIndex].active;
      return (target?.attached??[]).map(x=>({type:"ATTACK_DISCARD_ENERGY",player:pending.player,choiceInstanceId:x.instanceId}));
    }
    const choices=owner.deck.filter(x=>this.attackSearchMatches(x,pending,owner,state));
    return [...choices.map(x=>({type:"ATTACK_SEARCH",player:pending.player,choiceInstanceId:x.instanceId})),
      {type:"ATTACK_SEARCH_FINISH",player:pending.player}];
  }

  applyAttackEffect(state,action) {
    const next=structuredClone(state),pending=next.pendingAttack;
    const own=next.players[pending.player];
    if(action.type==="ATTACK_OPPONENT_PROMOTE"){
      if(pending.type!=="SWITCH_OPPONENT_CHOICE")throw new Error("Invalid forced-switch selection");
      const opponent=next.players[1-pending.player],index=opponent.bench.findIndex(x=>x.instanceId===action.targetInstanceId);
      if(index<0)throw new Error("Selected Pokémon is not on the opponent'\''s Bench");
      const outgoing=opponent.active;opponent.active=opponent.bench.splice(index,1)[0];opponent.bench.push(outgoing);
      this.clearSwitchStatuses(opponent.active);this.clearSwitchStatuses(outgoing);delete next.pendingAttack;
      return next.pendingSecondAttack?next:this.endTurn(next);
    }else if(action.type==="ATTACK_COUNTER_PLACE"){
      const opponent=next.players[1-pending.player];
      const target=opponent.bench.find(x=>x.instanceId===action.targetInstanceId);
      if(!target||pending.type!=="PLACE_DAMAGE_COUNTERS")throw new Error("Invalid damage-counter target");
      target.damage=(target.damage??0)+10;pending.remaining--;
      if(pending.remaining&&opponent.bench.length)return next;
      const knockouts=[];
      for(let ownerIndex=0;ownerIndex<2;ownerIndex++){
        const player=next.players[ownerIndex];
        for(const pokemon of [...player.bench,player.active].filter(Boolean))
          if((pokemon.damage??0)>=this.effectiveHP(pokemon))knockouts.push({owner:ownerIndex,instanceId:pokemon.instanceId,active:pokemon===player.active});
      }
      knockouts.sort((a,b)=>Number(a.active)-Number(b.active));
      if(knockouts.length){pending.type="RESOLVE_COUNTER_KNOCKOUTS";pending.delayedKnockouts=knockouts;return this.continueCounterAttack(next);}
      delete next.pendingAttack;return next.pendingSecondAttack?next:this.endTurn(next);
    }else if(action.type==="ATTACK_COUNTERS_FINISH"){
      if(pending.type!=="PLACE_DAMAGE_COUNTERS")throw new Error("Invalid damage-counter finish");
      delete next.pendingAttack;return next.pendingSecondAttack?next:this.endTurn(next);
    }else if(action.type==="ATTACK_SKIP_ENERGY_RETURN"){
      if(pending.type!=="OPTIONAL_RETURN_THREE_ENERGY_FOR_BENCH_DAMAGE")throw new Error("Invalid optional attack choice");
      delete next.pendingAttack;return next.pendingSecondAttack?next:this.endTurn(next);
    }else if(action.type==="ATTACK_RETURN_ENERGY"){
      if(pending.type!=="OPTIONAL_RETURN_THREE_ENERGY_FOR_BENCH_DAMAGE"||!Array.isArray(action.choiceInstanceIds)||action.choiceInstanceIds.length!==3||
         new Set(action.choiceInstanceIds).size!==3)throw new Error("Invalid Energy return selection");
      const attached=own.active?.attached??[];
      const selected=action.choiceInstanceIds.map(id=>attached.find(x=>x.instanceId===id));
      if(selected.some(x=>!x))throw new Error("Selected Energy is not attached to the attacking Pokémon");
      own.active.attached=attached.filter(x=>!action.choiceInstanceIds.includes(x.instanceId));
      own.deck.push(...selected);this.shufflePlayer(next,own);pending.type="BENCH_DAMAGE_TARGET";return next;
    }else if(action.type==="ATTACK_RETURN_ENERGY_TO_HAND"){
      if(pending.type!=="RETURN_ATTACHED_ENERGY_TO_HAND")throw new Error("Invalid Energy return selection");
      const i=(own.active?.attached??[]).findIndex(x=>x.instanceId===action.choiceInstanceId);
      if(i<0)throw new Error("Selected Energy is not attached to the attacking Pokémon");
      own.hand.push(own.active.attached.splice(i,1)[0]);
      delete next.pendingAttack;return next.pendingSecondAttack?next:this.endTurn(next);
    }else if(action.type==="ATTACK_BENCH_DAMAGE_TARGET"){
      if(pending.type!=="BENCH_DAMAGE_TARGET")throw new Error("Invalid Bench damage target");
      const opponent=next.players[1-pending.player],target=opponent.bench.find(x=>x.instanceId===action.targetInstanceId);
      if(!target)throw new Error("Damage target is not on the opponent'\''s Bench");
      const damage=this.incomingAttackDamage(next,target.instanceId,120),before=target.damage??0;
      target.damage=before+damage;
      next.lastAttack.benchDamage={targetInstanceId:target.instanceId,damage,before,hp:this.effectiveHP(target)};
      pending.type="RESOLVE_COUNTER_KNOCKOUTS";
      pending.delayedKnockouts=damage>0&&target.damage>=this.effectiveHP(target)?[{owner:1-pending.player,instanceId:target.instanceId}]:[];
      return this.continueCounterAttack(next);
    }else if(action.type === "ATTACK_SEARCH"){
      if(pending.type==="SEARCH_BASIC_ENERGY_ATTACH_BENCH"){
        const i=own.deck.findIndex(x=>x.instanceId===action.choiceInstanceId);
        const target=own.bench.find(x=>x.instanceId===action.targetInstanceId);
        if(i<0||this.card(own.deck[i]).energyType!=="basic"||!target||pending.remaining<=0)
          throw new Error("Invalid Basic Energy bench attachment choice");
        target.attached.push(own.deck.splice(i,1)[0]);pending.remaining--;
        return next;
      }
      if(pending.type==="SEARCH_TRASH_TO_HAND"){
        const i=own.trash.findIndex(x=>x.instanceId===action.choiceInstanceId);
        if(i<0||this.card(own.trash[i]).cardType!=="pokemon")throw new Error("Invalid discard-pile Pokémon selection");
        own.hand.push(own.trash.splice(i,1)[0]);delete next.pendingAttack;
        return next.pendingSecondAttack?next:this.endTurn(next);
      }
      if(pending.type==="SEARCH_TRASH_TO_BENCH"){
        const i=own.trash.findIndex(x=>x.instanceId===action.choiceInstanceId);
        if(i<0||this.card(own.trash[i]).name!==pending.name||
          own.bench.length>=this.benchLimit(next,pending.player)||pending.remaining<=0)
          throw new Error("Invalid discard-pile Pokémon selection");
        const selected=own.trash.splice(i,1)[0];selected.enteredTurn=next.turnNo;own.bench.push(selected);
        pending.remaining--;
        const canContinue=pending.remaining>0&&own.bench.length<this.benchLimit(next,pending.player)&&
          own.trash.some(x=>this.card(x).name===pending.name);
        if(canContinue)return next;
        delete next.pendingAttack;return next.pendingSecondAttack?next:this.endTurn(next);
      }
      if(pending.type==="ATTACH_BASIC_FIGHTING_FROM_TRASH_TO_BENCH"){
        const i=own.trash.findIndex(x=>x.instanceId===action.choiceInstanceId),target=own.bench.find(x=>x.instanceId===action.targetInstanceId);
        if(i<0||this.card(own.trash[i]).name!=="基本闘エネルギー"||!target||pending.remaining<=0)
          throw new Error("Invalid Fighting Energy attachment choice");
        target.attached??=[];target.attached.push(own.trash.splice(i,1)[0]);pending.remaining--;
        const hasTargets=own.bench.length>0&&own.trash.some(x=>this.card(x).name==="基本闘エネルギー");
        if(pending.remaining&&hasTargets)return next;
        delete next.pendingAttack;return next.pendingSecondAttack?next:this.endTurn(next);
      }
      const i=own.deck.findIndex(x=>x.instanceId===action.choiceInstanceId);
      const selected=own.deck.splice(i,1)[0];
      if(pending.destination==="BENCH"){selected.enteredTurn=next.turnNo;own.bench.push(selected);}
      else own.hand.push(selected);
      pending.chosen++;
      if(pending.chosen<pending.max && own.deck.some(x=>this.attackSearchMatches(x,pending,own,next)))return next;
      this.shufflePlayer(next,own);
    }else if(action.type === "ATTACK_SEARCH_FINISH"){
      if(pending.type==="SEARCH_TRASH_TO_HAND"||pending.type==="RETURN_ATTACHED_ENERGY_TO_HAND"){
        delete next.pendingAttack;return next.pendingSecondAttack?next:this.endTurn(next);
      }
      if(pending.type==="SEARCH_TRASH_TO_BENCH"){
        delete next.pendingAttack;return next.pendingSecondAttack?next:this.endTurn(next);
      }
      if(pending.type==="ATTACH_BASIC_FIGHTING_FROM_TRASH_TO_BENCH"){
        delete next.pendingAttack;return next.pendingSecondAttack?next:this.endTurn(next);
      }
      if(pending.type==="SEARCH_BASIC_ENERGY_ATTACH_BENCH"){
        this.shufflePlayer(next,own);delete next.pendingAttack;
        return next.pendingSecondAttack?next:this.endTurn(next);
      }
      this.shufflePlayer(next,own);
    }
    else if(action.type === "ATTACK_DISCARD_ENERGY"){
      const owner=pending.side==="own"?own:next.players[1-pending.player];
      const target=owner.active,attached=target.attached;
      const i=attached.findIndex(x=>x.instanceId===action.choiceInstanceId);
      owner.trash.push(attached.splice(i,1)[0]);
      pending.count=(pending.count??1)-1;
      if(pending.count>0&&attached.length)return next;
    }else if(action.type === "ATTACK_PROMOTE"){
      const i=own.bench.findIndex(x=>x.instanceId===action.targetInstanceId);
      own.active=own.bench.splice(i,1)[0];
      this.clearSwitchStatuses(own.active);
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
          const isBasic=this.card(card).raw.stage===BASIC;
          const setupActive=this.entries(card).some(e=>e.status==="supported"&&e.trigger==="SETUP_ACTIVE_FROM_HAND");
          if (!isBasic&&!setupActive || this.entries(card).some(e=>e.status!=="supported")) continue;
          if (!player.active) actions.push({ type: "SET_ACTIVE", player: playerIndex,
            sourceInstanceId: card.instanceId });
          else if (isBasic&&player.bench.length < 5) actions.push({ type: "SET_BENCH", player: playerIndex,
            sourceInstanceId: card.instanceId });
        }
        if (player.active) actions.push({ type: "READY_SETUP", player: playerIndex });
      }
      return actions;
    }
    if (state.phase !== "playing") throw new Error("Unsupported match phase");
    if (state.pendingKnockout) return this.getKnockoutActions(state);
    if (state.pendingBenchCleanup) return this.benchCleanupActions(state);
    if (state.pendingAttack) return this.attackEffectActions(state);
    if (state.pendingSecondAttack) return this.getLegalAttacks(state);
    if (state.pendingTrainer) return this.trainerActions(state);
    if (state.pendingAbility) return this.abilityChoiceActions(state);
    const player = state.players[state.turn];
    const actions = [...super.getLegalActions(state), ...this.getLegalAttacks(state), ...this.trainerActions(state),
      ...this.evolveCandidates(state)];
    if (state.stadium && this.card(state.stadium).name === "夜のアカデミー" &&
        state.stadiumEffectUsedTurns?.[state.turn] !== state.turnNo) {
      for (const item of player.hand) actions.push({type:"NIGHT_ACADEMY_RETURN",player:state.turn,
        sourceInstanceId:item.instanceId});
    }
    if(state.stadium&&this.card(state.stadium).name==="なみのりビーチ"&&
        state.stadiumEffectUsedTurns?.[state.turn]!==state.turnNo&&
        player.active&&this.card(player.active).raw.types?.includes("Water")){
      for(const target of player.bench)if(this.card(target).raw.types?.includes("Water"))
        actions.push({type:"SURFING_BEACH_SWITCH",player:state.turn,targetInstanceId:target.instanceId});
    }
    if(player.hand.some(x=>this.card(x).name === "基本炎エネルギー"))
      for(const source of this.field(player)) if(this.entries(source, state).some(x=>x.operations.some(op=>
          op.type === "ATTACH_UP_TO_BASIC_FIRE_TO_BENCHED_HIBIKI")) &&
          !state.usedAbilities?.instances?.includes(source.instanceId))
        for(const target of player.bench) if(this.card(target).name.startsWith("ヒビキの"))
          actions.push({type:"USE_HOOH",player:state.turn,sourceInstanceId:source.instanceId,
            targetInstanceId:target.instanceId});
    for (const card of player.hand) {
      if (this.card(card).raw.stage === BASIC && player.bench.length < this.benchLimit(state,state.turn) &&
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
      if (this.isSupportedTool(card) && this.field(player).some(p=>
          !(p.attached??[]).some(x=>this.card(x).trainerType==="tool"))) {
        for(const target of this.field(player)) if(!(target.attached??[]).some(x=>this.card(x).trainerType==="tool"))
          actions.push({type:"ATTACH_TOOL",player:state.turn,sourceInstanceId:card.instanceId,
            targetInstanceId:target.instanceId});
      }
    }
    if (!state.retreatedThisTurn && player.active && player.bench.length) {
      const blockedStatus=(player.active.statuses??[]).some(x=>["マヒ","ねむり"].includes(typeof x==="string"?x:x.name));
      const retreatLock=(state.temporaryLocks??[]).some(lock=>lock.targetInstanceId===player.active.instanceId&&
        lock.type==="PREVENT_RETREAT_NEXT_TURN"&&lock.expiresTurnNo>=state.turnNo);
      const count = this.retreatCost(state, state.turn, player.active.instanceId);
      const attached = player.active.attached ?? [];
      if (!blockedStatus && !retreatLock && count <= attached.length && attached.every(x => this.isSupportedEnergy(x))) {
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
    const next=this.applyMatchActionCore(state,action);
    if(state.stadium&&this.card(state.stadium).name==="ゼロの大空洞"&&next.stadium&&
      this.card(next.stadium).name==="ゼロの大空洞"&&
      [0,1].some(index=>this.benchLimit(state,index)>this.benchLimit(next,index)))
      this.scheduleBenchCleanup(next);
    return next;
  }

  applyMatchActionCore(state, action) {
    if (!this.getMatchActions(state).some(candidate => JSON.stringify(candidate) === JSON.stringify(action))) {
      throw new Error("Illegal match action");
    }
    if(action.type.startsWith("BENCH_CLEANUP_")||action.type==="DISCARD_EXCESS_BENCH")
      return this.applyBenchCleanupAction(state,action);
    if (action.type === "USE_ABILITY") {
      const next=super.applyAction(state,action);
      if(next.pendingAbility?.name === "にげあしドロー"&&
         !this.field(next.players[action.player]).length){
        delete next.pendingAbility;
        next.winner=1-action.player;
        next.winReason="NO_POKEMON";
      }
      if(next.pendingAbilityKnockoutTargetId){
        const targetId=next.pendingAbilityKnockoutTargetId;
        delete next.pendingAbilityKnockoutTargetId;
        const target=[next.players[action.player].active,...next.players[action.player].bench]
          .find(x=>x?.instanceId===targetId);
        if(target&&(target.damage??0)>=this.effectiveHP(target)){
          next.pendingAbilityResolution=true;
          return this.beginKnockout(next,[action.player],targetId);
        }
      }
      if(next.pendingAbilitySelfKnockoutId){
        const sourceId=next.pendingAbilitySelfKnockoutId;
        delete next.pendingAbilitySelfKnockoutId;
        const own=next.players[action.player];
        const source=[own.active,...own.bench].find(x=>x?.instanceId===sourceId);
        const foe=next.players[1-action.player];
        const target=[foe.active,...foe.bench].find(x=>x?.instanceId===action.targetInstanceId);
        if(!source||!target)throw new Error("Cursed Bomb source or target left the field");
        next.pendingAbilityResolution=true;
        const targetKnockedOut=(target.damage??0)>=this.effectiveHP(target);
        if(targetKnockedOut)return this.beginKnockout(next,[action.player,1-action.player]);
        return this.beginKnockout(next,[action.player],sourceId);
      }
      if(action.targetInstanceId){
        const owner=1-action.player;
        const target=[next.players[owner].active,...next.players[owner].bench].find(x=>x?.instanceId===action.targetInstanceId);
        if(target&&(target.damage??0)>=this.effectiveHP(target)){
          next.pendingAbilityResolution=true;
          return this.beginKnockout(next,[owner],target.instanceId);
        }
      }
      return next;
    }
    if (action.type === "ATTACK") return super.applyAttack(state, action);
    if (["TAKE_PRIZE", "PROMOTE_BENCH", "RESOLVE_KNOCKOUT","HEAVY_BATON_SELECT","HEAVY_BATON_FINISH"].includes(action.type)) return this.applyKnockoutAction(state, action);
    if(action.type.startsWith("ATTACK_SEARCH") || ["ATTACK_DISCARD_ENERGY","ATTACK_PROMOTE",
      "ATTACK_COUNTER_PLACE","ATTACK_COUNTERS_FINISH","ATTACK_RETURN_ENERGY","ATTACK_SKIP_ENERGY_RETURN",
      "ATTACK_RETURN_ENERGY_TO_HAND","ATTACK_BENCH_DAMAGE_TARGET","ATTACK_OPPONENT_PROMOTE"].includes(action.type))
      return this.applyAttackEffect(state,action);
    if (action.type === "END_TURN") return this.endTurn(state);
    if (action.type === "NIGHT_ACADEMY_RETURN") {
      const next=structuredClone(state),own=next.players[action.player];
      const i=own.hand.findIndex(x=>x.instanceId===action.sourceInstanceId);
      own.deck.unshift(own.hand.splice(i,1)[0]);
      next.stadiumEffectUsedTurns ??= [-1,-1];
      next.stadiumEffectUsedTurns[action.player]=state.turnNo;
      return next;
    }
    if(action.type==="SURFING_BEACH_SWITCH"){
      const next=structuredClone(state),own=next.players[action.player];
      const i=own.bench.findIndex(x=>x.instanceId===action.targetInstanceId);
      if(i<0)throw new Error("Surfing Beach target is not on the Bench");
      const outgoing=own.active;own.active=own.bench.splice(i,1)[0];own.bench.push(outgoing);
      this.clearSwitchStatuses(outgoing);this.clearSwitchStatuses(own.active);
      next.stadiumEffectUsedTurns??=[-1,-1];next.stadiumEffectUsedTurns[action.player]=state.turnNo;
      return next;
    }
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
      const target=this.field(player).find(x => x.instanceId === action.targetInstanceId);
      target.attached.push(energy);
      if(this.card(energy).name==="バブル水エネルギー"&&this.card(target).raw.types?.includes("Water"))
        target.statuses=[];
      next.energyAttachedThisTurn = true;
    } else if (action.type === "ATTACH_TOOL") {
      const tool=player.hand.splice(handIndex,1)[0];
      this.field(player).find(x=>x.instanceId===action.targetInstanceId).attached.push(tool);
    } else if (action.type === "PLAY_STADIUM") {
      const oldOwner=next.stadiumOwner;
      const removesZero=next.stadium&&this.card(next.stadium).name==="ゼロの大空洞";
      if(next.stadium)next.players[next.stadiumOwner].trash.push(next.stadium);
      next.stadium=player.hand.splice(handIndex,1)[0];
      next.stadiumOwner=action.player;
      if(removesZero)this.scheduleBenchCleanup(next,oldOwner);
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
      const entry=this.entries(evolved,next).find(x=>x.trigger==="ON_EVOLVE"&&
        x.operations.some(op=>op.type==="SEARCH_UP_TO_N_DECK_TRAINERS")&&
        x.conditions.every(condition=>this.conditionHolds(condition,next,action.player,evolved,
          player.active?.instanceId===evolved.instanceId?"active":"bench")));
      if(entry)next.pendingAbility={name:entry.name,sourceInstanceId:evolved.instanceId,
        remaining:entry.operations.find(op=>op.type==="SEARCH_UP_TO_N_DECK_TRAINERS").count};
    } else throw new Error(`Unsupported match action: ${action.type}`);
    return next;
  }

  applyBenchCleanupAction(state,action){
    const next=structuredClone(state),pending=next.pendingBenchCleanup;
    if(action.type==="BENCH_CLEANUP_FINISH"){
      delete next.pendingBenchCleanup;
      return next;
    }
    const owner=next.players[action.player],index=owner.bench.findIndex(x=>x.instanceId===action.sourceInstanceId);
    if(index<0)throw new Error("Bench Pokémon is no longer available for cleanup");
    const {attached=[],stack=[],...face}=owner.bench.splice(index,1)[0];
    owner.trash.push(...stack,face,...attached);
    while(pending.index<pending.players.length&&
      next.players[pending.players[pending.index]].bench.length<=this.benchLimit(next,pending.players[pending.index]))
      pending.index++;
    if(pending.index>=pending.players.length)delete next.pendingBenchCleanup;
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
      } else if(spec.effect==="suguri"){
        if(action.mode==="switch"){
          const i=player.bench.findIndex(x=>x.instanceId===action.choiceInstanceId);
          this.clearSwitchStatuses(player.active);
          [player.active,player.bench[i]]=[player.bench[i],player.active];
        }else{
          next.damageBonuses??=[];
          next.damageBonuses.push({player:action.player,turnNo:state.turnNo,amount:30,target:"OPPONENT_ACTIVE_EX_V"});
        }
      } else if(spec.effect==="jumbice"){
        player.active.damage=Math.max(0,(player.active.damage??0)-80);
      } else if(spec.effect==="pokegear"){
        const looked=player.deck.splice(0,7),choiceIndex=action.choiceInstanceId?looked.findIndex(x=>x.instanceId===action.choiceInstanceId):-1;
        if(choiceIndex>=0&&this.card(looked[choiceIndex]).trainerType==="supporter")player.hand.push(looked.splice(choiceIndex,1)[0]);
        player.deck.unshift(...looked);this.shufflePlayer(next,player);
      } else if(spec.effect==="kasumi"){
        next.pendingTrainer={name:"カスミの元気",sourceInstanceId:trainer.instanceId,remaining:4,selectedTargetId:null};
      } else if(spec.effect==="tairyounet"){
        next.pendingTrainer={name:"大漁ネット",sourceInstanceId:trainer.instanceId,selectedNames:[],selectedTypes:[],max:6};
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
      } else if(spec.effect === "judge") {
        const opponent=next.players[1-action.player];
        for(const side of [player,opponent]) { side.deck.push(...side.hand.splice(0)); this.shufflePlayer(next,side); }
        for(const side of [player,opponent]) side.hand.push(...side.deck.splice(0,4));
      } else if(spec.effect === "karate") {
        next.damageBonuses ??=[];
        next.damageBonuses.push({player:action.player,turnNo:state.turnNo,amount:40,target:"OPPONENT_ACTIVE_EX"});
      } else if(spec.effect === "nPoint") {
        const i=player.trash.findIndex(x=>x.instanceId===action.choiceInstanceId);
        const energy=player.trash.splice(i,1)[0];
        this.field(player).find(x=>x.instanceId===action.targetInstanceId).attached.push(energy);
      } else if(spec.effect === "care") {
        next.pendingTrainer={name:"スイレンのお世話",sourceInstanceId:trainer.instanceId,
          selectedNames:[],selectedIds:[]};
      } else if(spec.effect==="mushitoriSet"){
        next.pendingTrainer={name:"むしとりセット",sourceInstanceId:trainer.instanceId,
          lookedInstanceIds:player.deck.slice(0,7).map(x=>x.instanceId),selectedNames:[]};
      } else if(spec.effect==="secretBox"){
        next.pendingTrainer={name:"シークレットボックス",sourceInstanceId:trainer.instanceId,
          costLeft:3,selectedNames:[],selectedTypes:[]};
      } else if(spec.effect==="draw") {
        player.hand.push(...player.deck.splice(0,spec.count));
      } else if(spec.effect==="shuffleDraw") {
        player.deck.push(...player.hand.splice(0));this.shufflePlayer(next,player);player.hand.push(...player.deck.splice(0,spec.count));
      } else next.pendingTrainer={name:trainer.cardId?this.card(trainer).name:"",sourceInstanceId:trainer.instanceId,
        costLeft:spec.cost??0,selectedNames:[]};
    } else {
      const pending=next.pendingTrainer;
      const source=player.trash.find(x=>x.instanceId===pending.sourceInstanceId);
      const spec=source?this.trainerSpec(source):TRAINERS[pending.name];
      if(action.type==="KASUMI_TARGET")pending.selectedTargetId=action.targetInstanceId;
      else if(action.type==="KASUMI_ENERGY"){
        const i=player.deck.findIndex(x=>x.instanceId===action.choiceInstanceId);
        if(i>=0){this.field(player).find(x=>x.instanceId===pending.selectedTargetId).attached.push(player.deck.splice(i,1)[0]);pending.remaining--;}
      }else if(action.type==="KASUMI_FINISH"){this.shufflePlayer(next,player);delete next.pendingTrainer;return this.endTurn(next);}
      else if(action.type==="TAIRYOU_SELECT"){
        const i=player.trash.findIndex(x=>x.instanceId===action.choiceInstanceId);
        if(i>=0){const chosen=player.trash.splice(i,1)[0],c=this.card(chosen),type=c.name==="基本水エネルギー"?"energy":"pokemon";player.deck.push(chosen);pending.selectedTypes.push(type);pending.selectedNames.push(c.name);}
        
      }else if(action.type==="TAIRYOU_FINISH"){this.shufflePlayer(next,player);delete next.pendingTrainer;}
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
        if(pending.name==="スイレンのお世話"||spec?.effect === "care") {
          const i=player.trash.findIndex(x=>x.instanceId===action.choiceInstanceId),chosen=player.trash.splice(i,1)[0];
          pending.selectedIds.push(chosen.instanceId);pending.selectedNames.push(this.card(chosen).name);player.hand.push(chosen);
          if(pending.selectedNames.length>=3||!this.trainerActions({...next,pendingTrainer:pending}).some(x=>x.type==="TRAINER_SELECT"))
            delete next.pendingTrainer;
        } else {
          const i=player.deck.findIndex(x=>x.instanceId===action.choiceInstanceId);
          const chosen=player.deck.splice(i,1)[0];pending.selectedNames.push(this.card(chosen).name);
          if(spec.effect==="secretBox")pending.selectedTypes.push(chosen.trainerType);
          if(spec.zone === "bench") {chosen.enteredTurn=next.turnNo;player.bench.push(chosen);}
          else if(spec.zone === "trash")player.trash.push(chosen);
          else player.hand.push(chosen);
        }
        if(pending.name==="むしとりセット"){
          const hasLookedChoice=pending.lookedInstanceIds.some(id=>{
            const item=player.deck.find(x=>x.instanceId===id);
            return item&&this.searchCandidate(item,spec,pending,player,next,next.turn);
          });
          if(pending.selectedNames.length>=spec.max||!hasLookedChoice){
            this.shufflePlayer(next,player);delete next.pendingTrainer;
          }
        } else if(pending.name!=="スイレンのお世話"&&spec?.effect!=="care"&&
          (pending.selectedNames.length >= spec.max || !player.deck.some(x=>this.searchCandidate(x,spec,pending,player,next,next.turn)))){
          this.shufflePlayer(next,player);delete next.pendingTrainer;
        }
      } else if (action.type === "TRAINER_FINISH") {
        if(pending.name!=="スイレンのお世話"&&spec?.effect!=="care")this.shufflePlayer(next,player);delete next.pendingTrainer;
      }
    }
    return next;
  }
}
