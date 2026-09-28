import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CardRepository } from "../src/card-db/CardRepository.js";
import { AttackEngine } from "../src/engine/AttackEngine.js";
import { MatchEngine } from "../src/engine/MatchEngine.js";
import { inspectAttacks, parseEffectText } from "../src/card-db/parse-effects.js";
import { parseAbility } from "../src/card-db/parse-abilities.js";

const db = JSON.parse(fs.readFileSync("tests/fixtures/ability-cards.json", "utf8"));
db.cards.push(...JSON.parse(fs.readFileSync("tests/fixtures/attack-cards.json", "utf8")));
const metaCards=JSON.parse(fs.readFileSync("tests/fixtures/meta-cards.json","utf8"));
db.cards.push(...metaCards.filter(x=>[45202,49003,49207,45729,47762,49024,50224].includes(x.officialCardId)),
  JSON.parse(fs.readFileSync("tests/fixtures/psychic-energy.json","utf8")),
  JSON.parse(fs.readFileSync("tests/fixtures/water-energy.json","utf8")),
  JSON.parse(fs.readFileSync("tests/fixtures/dark-energy.json","utf8")),
  JSON.parse(fs.readFileSync("tests/fixtures/steel-energy.json","utf8")));
db.cards.push(...JSON.parse(fs.readFileSync("tests/fixtures/frequency-attack-cards.json","utf8")));
db.cards.push(...JSON.parse(fs.readFileSync("tests/fixtures/load-effect-cards.json","utf8")));
const abilities = JSON.parse(fs.readFileSync("tests/fixtures/ability-effects.json", "utf8"));
const deckCoverageCards=JSON.parse(fs.readFileSync("tests/fixtures/deck-effect-coverage.json","utf8"));
db.cards.push(...deckCoverageCards.filter(item=>!db.cards.some(card=>card.officialCardId===item.officialCardId)));
abilities.cardCount = db.cards.length;
for(const item of db.cards.filter(x=>x.raw.abilities?.length))abilities.abilities[item.officialCardId]=
  item.raw.abilities.map((entry,index)=>({index,name:entry.name,text:entry.effect,...parseAbility(entry.name,entry.effect)}));
const engine = new AttackEngine(new CardRepository(db), abilities);
const card = (instanceId, cardId, attached = []) => ({ instanceId, cardId, attached });
const player = (active, hand = [], deck = []) => ({ active, hand, deck, bench: [], trash: [] });
const state = (own, other) => ({ ruleset: "supported_abilities_v1", stadium: null,phase:"playing",
  turn: 0,turnNo:1,turnsTaken:[0,0],energyAttachedThisTurn:false,retreatedThisTurn:false,
  players: [own, other], usedAbilities: { instances: [], names: [] } });

test("Budew has a zero energy 10 damage attack and locks hand items for one opponent turn", () => {
  const budew = card("budew", 49956);
  const item = card("item", 50742);
  const game = state(player(budew), player(card("target", 48466), [item]));
  assert.equal(engine.attacks(budew)[0].status, "supported");
  assert.equal(engine.attacks(budew)[0].cost[0], "Void");
  const [action] = engine.getLegalAttacks(game);
  assert.equal(engine.calculateAttackDamage(game, action), 10);
  const after = engine.applyAttack(game, action);
  assert.equal(after.players[1].active.damage, 10);
  assert.equal(after.turn, 1);
  assert.equal(engine.canPlayItemFromHand(after, 1, "item"), false);
  const expired = engine.endTurn(after);
  assert.equal(expired.itemLocks[1], false);
  const otherTurn = engine.endTurn(expired);
  assert.equal(engine.canPlayItemFromHand(otherTurn, 1, "item"), true);
  assert.equal(game.players[1].active.damage, undefined);
});

test("Heracross draws two after 20 damage; basic Grass Energy pays Grass cost", () => {
  const grass = card("energy", 50745);
  const game = state(player(card("heracross", 50339, [grass]), [],
    [card("draw-1", 50745), card("draw-2", 50745)]), player(card("target", 48466)));
  const legal = engine.getLegalAttacks(game);
  assert.deepEqual(legal.map(x => x.attackIndex), [0]);
  const after = engine.applyAttack(game, legal[0]);
  assert.equal(after.players[1].active.damage, 20);
  assert.deepEqual(after.players[0].hand.map(x => x.instanceId), ["draw-1", "draw-2"]);
  assert.equal(engine.getLegalAttacks(state(player(card("heracross", 50339, [grass]), [],
    [card("only-one", 50745)]), player(card("target", 48466)))).length, 0);
});

test("Heracross self damage is an attack effect and does not gain weakness", () => {
  const energies = [card("energy-1", 50745), card("energy-2", 50745), card("energy-3", 50745)];
  const game = state(player(card("heracross", 50339, energies)), player(card("target", 47069)));
  const strong = engine.getLegalAttacks(game).find(x => x.attackIndex === 1);
  assert.ok(strong);
  assert.equal(engine.calculateAttackDamage(game, strong), 260); // Grass weakness
  const after = engine.applyAttack(game, strong);
  assert.equal(after.players[0].active.damage, 30);
  assert.equal(after.players[1].active.damage, 260);
  assert.equal(after.turn, 1);
});

test("Ogerpon three Grass Energy enables Manyō Shigure and counts both active Pokémon's Energy", () => {
  const grass = index => card(`grass-${index}`, 50745);
  const ogerpon = count => card("ogerpon", 45707, Array.from({ length: count }, (_, i) => grass(i)));
  assert.equal(engine.attacks(ogerpon(3))[0].status, "supported");
  assert.equal(engine.getLegalAttacks(state(player(ogerpon(2)), player(card("target", 50339)))).length, 0);
  const game = state(player(ogerpon(3)), player(card("target", 48466, [grass(4), grass(5)])));
  const [action] = engine.getLegalAttacks(game);
  assert.equal(action.attackIndex, 0);
  assert.equal(engine.calculateAttackDamage(game, action), 180); // 30 + (3 + 2) × 30
  const after = engine.applyAttack(game, action);
  assert.equal(after.players[1].active.damage, 180);
  assert.equal(after.players[0].active.attached.length, 3);
  assert.equal(engine.calculateAttackDamage(state(player(ogerpon(3)),
    player(card("target", 47069))), engine.getLegalAttacks(state(player(ogerpon(3)),
    player(card("target", 47069))))[0]), 240); // Grass weakness, 120 × 2
});

test("Talonflame search attack is supported while unrelated unknown attacks stay unavailable", () => {
  const talonflame = engine.repository.get(50400);
  assert.equal(inspectAttacks(talonflame)[0].status, "supported");
  const game = state(player(card("falcon", 50400, [card("e", 50745), card("f", 50745)])),
    player(card("target", 48466)));
  assert.equal(engine.getLegalAttacks(game).length, 1);
  assert.equal(inspectAttacks(engine.repository.get(47069))[0].status,"supported");
});

test("Slowpoke retrieves one Pokémon from discard to hand and ends after selection",()=>{
  const match=new MatchEngine(new CardRepository(db),abilities);
  const target=card("target",48466),pokemon=card("discard-pokemon",45977),slowpoke=card("slowpoke",45977,[card("energy",50749)]);
  const game=state(player(slowpoke,[],[]),player(target,[],[card("draw",50749)]));game.players[0].trash=[pokemon];
  assert.equal(engine.attacks(slowpoke)[0].status,"supported");
  const afterAttack=engine.applyAttack(game,engine.getLegalAttacks(game)[0]);afterAttack.phase="playing";
  const choice=match.getMatchActions(afterAttack).find(x=>x.type==="ATTACK_SEARCH"&&x.choiceInstanceId==="discard-pokemon");
  assert.ok(choice);
  const done=match.applyMatchAction(afterAttack,choice);
  assert.ok(done.players[0].hand.some(x=>x.instanceId==="discard-pokemon"));
  assert.equal(done.pendingAttack,undefined);
  assert.equal(done.turn,1);
});

test("Chien-Pao's Icicle Loop returns exactly one attached Energy to hand",()=>{
  const match=new MatchEngine(new CardRepository(db),abilities);
  const water1=card("water-1",50747),water2=card("water-2",50747),colorless=card("colorless",50747);
  const attacker=card("chien-pao",46372,[water1,water2,colorless]);
  const game=state(player(attacker),player(card("target",48466),[],[card("draw",50749)]));
  assert.equal(engine.attacks(attacker)[0].status,"supported");
  const afterAttack=engine.applyAttack(game,engine.getLegalAttacks(game)[0]);afterAttack.phase="playing";
  const choice=match.getMatchActions(afterAttack).find(x=>x.type==="ATTACK_RETURN_ENERGY_TO_HAND"&&x.choiceInstanceId==="water-1");
  assert.ok(choice);
  const done=match.applyMatchAction(afterAttack,choice);
  assert.equal(done.players[0].hand[0].instanceId,"water-1");
  assert.equal(done.players[0].active.attached.length,2);
  assert.equal(done.players[1].active.damage,120);
});

test("Dhelmise damage checks actual discard-pile Pokémon with Baked Hidden",()=>{
  const attacker=card("dhelmise",50256,[card("psychic",50749)]);
  const four=Array.from({length:4},(_,i)=>card(`banette-${i}`,50251));
  const game=state(player(attacker),player(card("target",48466)));game.players[0].trash=four;
  const attack=engine.getLegalAttacks(game)[0];
  assert.equal(engine.attacks(attacker)[0].status,"supported");
  assert.equal(engine.calculateAttackDamage(game,attack),170);
  game.players[0].trash.pop();
  assert.equal(engine.calculateAttackDamage(game,attack),30);
});

test("Night Joker chooses and executes a printed attack from a Benched N Pokémon",()=>{
  const zoroark=card("night-joker",47069,[card("dark-1",50751),card("dark-2",50751)]);
  const zorua=card("n-zorua",47068),game=state(player(zoroark),player(card("target",48466)));
  game.players[0].bench=[zorua];
  const attack=engine.getLegalAttacks(game).find(x=>x.attackIndex===0);
  assert.ok(attack);
  assert.equal(attack.copiedAttackName,"ひっかく");
  assert.equal(engine.attacks(zoroark)[0].status,"supported");
  assert.equal(engine.calculateAttackDamage(game,attack),20);
  const after=engine.applyAttack(game,attack);
  assert.equal(after.players[1].active.damage,20);
  const noPartner=state(player(zoroark),player(card("target",48466)));
  assert.equal(engine.getLegalAttacks(noPartner).length,0);
});

test("Metallic Hammer optionally discards exactly three attached Steel Energy for 150 extra damage",()=>{
  const energy=Array.from({length:4},(_,i)=>card(`steel-${i}`,50752));
  const metagross=card("metagross",50143,energy),game=state(player(metagross),player(card("target",48466)));
  game.players[0].prizes=Array.from({length:6},(_,i)=>card(`prize-${i}`,50749));
  game.players[1].prizes=Array.from({length:6},(_,i)=>card(`foe-prize-${i}`,50749));
  const options=engine.getLegalAttacks(game).filter(x=>x.attackIndex===1);
  assert.equal(engine.attacks(metagross)[1].status,"supported");
  assert.equal(options.length,5); // decline, or choose any of four distinct triples
  const boost=options.find(x=>x.discardEnergyInstanceIds?.length===3);
  assert.ok(boost);
  assert.equal(engine.calculateAttackDamage(game,boost),300);
  const after=engine.applyAttack(game,boost);
  assert.equal(after.lastAttack.damage,300);
  assert.equal(after.pendingKnockout.owner,1);
  assert.equal(after.players[0].active.attached.length,1);
  assert.equal(after.players[0].trash.length,3);
});

test("coin-gated status is only applied on Heads",()=>{
  const text="コインを1回投げオモテなら、相手のバトルポケモンをマヒにする。";
  const testDb=structuredClone(db),budew=testDb.cards.find(x=>x.officialCardId===49956);
  budew.raw.attacks[0].effect=text;
  const testEngine=new AttackEngine(new CardRepository(testDb),abilities);
  const heads=Array.from({length:10000},(_,i)=>i+1).find(seed=>testEngine.coinSequence(seed,true).heads===1);
  const tails=Array.from({length:10000},(_,i)=>i+1).find(seed=>testEngine.coinSequence(seed,true).heads===0);
  for(const [seed,expected] of [[heads,"マヒ"],[tails,undefined]]){
    const game=state(player(card("budew",49956)),player(card("target",50339)));
    game.randomState=seed;
    const after=testEngine.applyAttack(game,testEngine.getLegalAttacks(game)[0]);
    assert.equal(after.lastAttack.coin?.includes(expected ? "オモテ1回" : "オモテ0回"),true,JSON.stringify({seed,attack:testEngine.attacks(game.players[0].active)[0],lastAttack:after.lastAttack}));
    assert.equal(after.players[1].active.statuses?.[0]?.name,expected,JSON.stringify({seed,status:after.players[1].active.statuses}));
  }
});

test("exact status effect phrases parse; added unknown phrases stay unsupported",()=>{
  assert.equal(parseEffectText("相手のバトルポケモンをねむりにする。").recognized,true);
  assert.equal(parseEffectText("相手のバトルポケモンをねむりにする。追加の効果は不明。").recognized,false);
});

test("meta-deck damage formulas parse and count both Benches",()=>{
  assert.equal(parseEffectText("おたがいのベンチポケモンの数×20ダメージ追加。").recognized,true);
  assert.equal(parseEffectText("相手がすでにとったサイドの枚数×60ダメージ。").recognized,true);
  const own=player(card("clefairy",49003,[card("psychic-1",50749),card("psychic-2",50749)]));
  own.bench=[card("own-bench-1",45202),card("own-bench-2",45202)];
  const foe=player(card("foe",45202));foe.bench=[card("foe-bench-1",45202),card("foe-bench-2",45202)];
  const gameState=state(own,foe),action={player:0,attackIndex:0};
  assert.equal(engine.attacks(own.active)[0].status,"supported");
  assert.equal(engine.calculateAttackDamage(gameState,action),100);
});

test("basic-energy and Basic-to-Bench searches parse as distinct destinations",()=>{
  assert.deepEqual(parseEffectText("自分の山札から基本エネルギーを2枚まで選び、相手に見せて、手札に加える。そして山札を切る。").effects,
    [{type:"SEARCH_DECK",max:2,filter:"basicEnergy",destination:"HAND"}]);
  assert.deepEqual(parseEffectText("自分の山札からたねポケモンを2枚まで選び、ベンチに出す。そして山札を切る。").effects,
    [{type:"SEARCH_DECK",max:2,filter:"basicPokemon",destination:"BENCH"}]);
});

test("healing, energy discard and one-turn attack locks parse as exact primitives",()=>{
  assert.deepEqual(parseEffectText("このポケモンのHPを「30」回復する。").effects,
    [{type:"HEAL",target:"ATTACKING_POKEMON",amount:30}]);
  assert.deepEqual(parseEffectText("このポケモンについているエネルギーを2個選び、トラッシュする。").effects,
    [{type:"DISCARD_ATTACHED",target:"ATTACKING_POKEMON",count:2}]);
  assert.equal(parseEffectText("次の相手の番、このワザを受けたポケモンは、ワザが使えない。").effects[0].type,
    "PREVENT_ATTACK_NEXT_TURN");
});

test("known attack clauses compose in order while any unknown clause stays in review",()=>{
  const parsed=parseEffectText("自分の山札を2枚引く。このポケモンにも20ダメージ。");
  assert.equal(parsed.recognized,true);
  assert.deepEqual(parsed.effects.map(x=>x.type),["DRAW","DAMAGE"]);
  assert.equal(parseEffectText("自分の山札を2枚引く。未知の効果を使う。").recognized,false);
});

test("bench-switch attacks are supported even with no printed damage",()=>{
  const doduo=structuredClone(engine.repository.get(49956));
  doduo.raw.attacks=[{name:"いれかわる",cost:["Colorless"],damage:null,effect:"このポケモンをベンチポケモンと入れ替える。"}];
  assert.equal(inspectAttacks(doduo)[0].status,"supported");
  assert.deepEqual(inspectAttacks(doduo)[0].effects,[{type:"SWITCH_SELF"}]);
});

test("mill, draw-to-size, damage counters, and same-attack locks parse as exact effects",()=>{
  assert.deepEqual(parseEffectText("相手の山札を上から2枚トラッシュする。").effects,
    [{type:"MILL_OPPONENT_DECK",count:2}]);
  assert.deepEqual(parseEffectText("のぞむなら、自分の手札が6枚になるように、山札を引く。").effects,
    [{type:"DRAW_UNTIL_HAND_SIZE",player:"SELF",size:6}]);
  assert.deepEqual(parseEffectText("相手のバトルポケモンに、ダメカンを1個のせる。").effects,
    [{type:"PLACE_DAMAGE_COUNTERS",target:"DEFENDING_ACTIVE",count:1}]);
  assert.deepEqual(parseEffectText("次の自分の番、このポケモンは「メガブレイブ」が使えない。").effects,
    [{type:"PREVENT_SAME_ATTACK_NEXT_TURN",attackName:"メガブレイブ"}]);
  assert.deepEqual(parseEffectText("自分のトラッシュから「ヨマワル」を3枚まで選び、ベンチに出す。").effects,
    [{type:"SEARCH_TRASH_TO_BENCH",name:"ヨマワル",max:3}]);
  assert.deepEqual(parseEffectText("自分のトラッシュから「基本Fightingエネルギー」を3枚まで選び、ベンチポケモンに好きなようにつける。").effects,
    [{type:"ATTACH_BASIC_FIGHTING_FROM_TRASH_TO_BENCH",max:3}]);
  assert.equal(parseEffectText("のぞむなら、このポケモンについているエネルギーを3個選び、山札にもどして切る。その場合、相手のベンチポケモン1匹にも、120ダメージ。［ベンチは弱点・抵抗力を計算しない。］").recognized,true);
  assert.deepEqual(parseEffectText("このポケモンにのっているダメカンの数×20ダメージ。").effects,
    [{type:"SET_DAMAGE",basis:"OWN_DAMAGE_COUNTERS",perCounter:20}]);
  assert.deepEqual(parseEffectText("相手のトラッシュにある基本エネルギーの枚数×30ダメージ。").effects,
    [{type:"SET_DAMAGE",basis:"OPPONENT_DISCARD_BASIC_ENERGY_COUNT",perEnergy:30}]);
  assert.equal(parseEffectText("次の相手の番、このポケモンが受けるワザのダメージは「-30」される。").recognized,true);
  assert.deepEqual(parseEffectText("相手のバトルポケモンをベンチポケモンと入れ替える。［バトル場に出すポケモンは相手が選ぶ。］").effects,
    [{type:"SWITCH_OPPONENT_CHOICE"}]);
});

test("attack effects mill the opponent, draw to hand size, and place counters without weakness",()=>{
  const testDb=structuredClone(db),userCard=testDb.cards.find(x=>x.officialCardId===49956);
  userCard.raw.attacks=[{name:"実験ワザ",cost:["Void"],damage:{amount:0,suffix:""},effect:
    "相手の山札を上から2枚トラッシュする。のぞむなら、自分の手札が6枚になるように、山札を引く。相手のバトルポケモンに、ダメカンを1個のせる。"}];
  const testEngine=new AttackEngine(new CardRepository(testDb),abilities);
  const own=player(card("budew",49956),[card("in-hand",50745)],Array.from({length:8},(_,i)=>card(`draw-${i}`,50745)));
  const foe=player(card("defender",50339),[],[card("mill-1",50745),card("mill-2",50745),card("remain",50745)]);
  const game=state(own,foe),[action]=testEngine.getLegalAttacks(game);
  const after=testEngine.applyAttack(game,action);
  assert.equal(after.players[0].hand.length,6);
  assert.equal(after.players[0].deck.length,3);
  assert.equal(after.players[1].deck.length,1);
  assert.equal(after.players[1].trash.length,2);
  assert.equal(after.players[1].active.damage,10);
  assert.equal(after.lastAttack.damageCounters,1);
});

test("discard-energy count, own damage counters, damage reduction and discard-draw execute",()=>{
  const testDb=structuredClone(db),userCard=testDb.cards.find(x=>x.officialCardId===49956);
  const testEngine=new AttackEngine(new CardRepository(testDb),abilities);
  userCard.raw.attacks=[{name:"バックドラフト",cost:["Void"],damage:{amount:30,suffix:"×"},effect:
    "相手のトラッシュにある基本エネルギーの枚数×30ダメージ。"}];
  const foe=player(card("target",50339));foe.trash=[card("discarded-1",50745),card("discarded-2",50745)];
  const game1=state(player(card("budew",49956)),foe);
  assert.equal(testEngine.calculateAttackDamage(game1,testEngine.getLegalAttacks(game1)[0]),60);
  userCard.raw.attacks=[{name:"パワーレイジ",cost:["Void"],damage:{amount:20,suffix:"×"},effect:
    "このポケモンにのっているダメカンの数×20ダメージ。"}];
  const game2=state(player(card("budew",49956)),player(card("target",50339)));game2.players[0].active.damage=30;
  assert.equal(testEngine.calculateAttackDamage(game2,{player:0,attackIndex:0}),60);
  userCard.raw.attacks=[{name:"プロテクトチャージ",cost:["Void"],damage:{amount:20,suffix:""},effect:
    "次の相手の番、このポケモンが受けるワザのダメージは「-30」される。"}];
  const guarded=testEngine.applyAttack(state(player(card("budew",49956)),player(card("target",50339))),
    testEngine.getLegalAttacks(state(player(card("budew",49956)),player(card("target",50339))))[0]);
  assert.equal(testEngine.incomingAttackDamage(guarded,"budew",100),70);
  assert.equal(testEngine.incomingAttackDamage(testEngine.endTurn(guarded),"budew",100),100);
  userCard.raw.attacks=[{name:"はじけるほうこう",cost:["Void"],damage:{amount:0,suffix:""},effect:
    "自分の手札をすべてトラッシュし、山札を6枚引く。"}];
  const own=player(card("budew",49956),[card("old-hand",50745)],Array.from({length:6},(_,i)=>card(`draw-${i}`,50745)));
  const after=testEngine.applyAttack(state(own,player(card("target",50339))),testEngine.getLegalAttacks(state(own,player(card("target",50339))))[0]);
  assert.equal(after.players[0].hand.length,6);
  assert.equal(after.players[0].trash[0].instanceId,"old-hand");
});

test("attack name locks only block the named attack for the next own turn",()=>{
  const testDb=structuredClone(db),userCard=testDb.cards.find(x=>x.officialCardId===49956);
  userCard.raw.attacks=[
    {name:"メガブレイブ",cost:["Void"],damage:{amount:20,suffix:""},effect:"次の自分の番、このポケモンは「メガブレイブ」が使えない。"},
    {name:"別ワザ",cost:["Void"],damage:{amount:10,suffix:""},effect:""}
  ];
  const testEngine=new AttackEngine(new CardRepository(testDb),abilities);
  const game=state(player(card("budew",49956)),player(card("target",50339)));
  testEngine.applyAttack(game,testEngine.getLegalAttacks(game)[0]);
  game.turn=0;game.turnsTaken=[1,1];game.attackLocks=[{player:0,instanceId:"budew",attackName:"メガブレイブ",turnsTakenAt:0}];
  assert.deepEqual(testEngine.getLegalAttacks(game).map(action=>testEngine.attacks(game.players[0].active)[action.attackIndex].name),["別ワザ"]);
});

test("Baked Hidden blocks opposing attack effects but still takes attack damage",()=>{
  const tea=db.cards.find(x=>x.officialCardId===50224),budew=db.cards.find(x=>x.officialCardId===49956);
  assert.equal(engine.entries(card("tea",50224))[0]?.status,"supported");
  budew.raw.attacks=[{name:"小突き",cost:["Void"],damage:{amount:10,suffix:""},effect:"相手のバトルポケモンをどくにする。"}];
  const testEngine=new AttackEngine(new CardRepository(db),abilities);
  const game=state(player(card("budew",49956)),player(card("tea",50224)));
  const after=testEngine.applyAttack(game,testEngine.getLegalAttacks(game)[0]);
  assert.equal(after.players[1].active.damage,10);
  assert.deepEqual(after.players[1].active.statuses??[],[]);
});

test("fixed-count coin damage continues after tails and resolves reproducibly",()=>{
  const parsed=parseEffectText("コインを3回投げ、オモテの数×20ダメージ。");
  assert.equal(parsed.recognized,true);
  assert.deepEqual(parsed.effects,[{type:"COIN_DAMAGE",count:3,perCoin:20}]);
  assert.equal(engine.coinSequence(1,false,3).flips,3);
  assert.equal(engine.coinSequence(1,true).flips,1);
});

test("damage reduction and resistance do not drop below zero", () => {
  const grass = card("energy", 50745);
  const game = state(player(card("heracross", 50339, [grass]), [],
    [card("a", 50745), card("b", 50745)]), player(card("klinklang", 46008)));
  const [action] = engine.getLegalAttacks(game);
  assert.equal(engine.calculateAttackDamage(game, action), 0);
  const reduced = state(player(card("heracross", 50339, [grass]), [],
    [card("a", 50745), card("b", 50745)]), player(card("tangrowth", 45578)));
  assert.equal(engine.calculateAttackDamage(reduced, engine.getLegalAttacks(reduced)[0]), 0);
});

const prizes = (prefix, count) => Array.from({ length: count }, (_, i) =>
  card(`${prefix}-${i}`, 50745));

test("knockout trashes the Pokémon and attached Energy; prize choice precedes promotion", () => {
  const own = player(card("heracross", 50339, [card("grass", 50745)]), [], prizes("deck", 2));
  own.prizes = prizes("own-prize", 3);
  const foe = player(card("budew", 49956));
  foe.active.damage = 10;
  foe.bench = [card("kichikigisu", 45913)];
  foe.prizes = prizes("foe-prize", 3);
  foe.deck = prizes("foe-deck", 3);
  const game = state(own, foe);
  const after = engine.applyAttack(game, engine.getLegalAttacks(game)[0]);
  assert.equal(after.players[1].active, null);
  assert.deepEqual(after.players[1].trash.map(x => x.instanceId), ["budew"]);
  assert.equal(after.turn, 0);
  assert.deepEqual(engine.getKnockoutActions(after).map(x => x.type), ["TAKE_PRIZE", "TAKE_PRIZE", "TAKE_PRIZE"]);
  assert.equal(engine.getLegalActions(after).length, 0);
  assert.throws(() => engine.endTurn(after), /Resolve knockout/);
  assert.throws(() => engine.applyKnockoutAction(after, { type: "PROMOTE_BENCH", player: 1,
    sourceInstanceId: "kichikigisu" }), /Illegal/);
  const taken = engine.applyKnockoutAction(after, { type: "TAKE_PRIZE", player: 0, prizeIndex: 1 });
  assert.equal(taken.players[0].hand.at(-1).instanceId, "own-prize-1");
  assert.equal(taken.players[0].prizes.length, 2);
  const [promote] = engine.getKnockoutActions(taken);
  assert.equal(promote.sourceInstanceId, "kichikigisu");
  const resumed = engine.applyKnockoutAction(taken, promote);
  assert.equal(resumed.turn, 1);
  assert.equal(resumed.players[1].active.instanceId, "kichikigisu");
  assert.deepEqual(resumed.previousOpponentTurnKnockout, [false, true]);
  assert.equal(engine.getLegalActions(resumed).some(x => x.sourceInstanceId === "kichikigisu"), true);
  assert.equal(game.players[1].active.instanceId, "budew");
});

test("ordinary ex takes two prizes; Mega ex takes three, stopping when prizes run out", () => {
  const energy = () => prizes("grass", 3);
  const attacker = () => player(card("heracross", 50339, energy()));
  const ex = player(card("ex", 45913));
  ex.active.damage = 80;
  ex.bench = [card("reserve", 49956)];
  ex.prizes = prizes("their", 6);
  const own = attacker(); own.prizes = prizes("ours", 6);
  const game = state(own, ex);
  let after = engine.applyAttack(game, engine.getLegalAttacks(game).find(x => x.attackIndex === 1));
  assert.equal(after.pendingKnockout.remaining, 2);
  after = engine.applyKnockoutAction(after, engine.getKnockoutActions(after)[0]);
  assert.equal(after.pendingKnockout.remaining, 1);
  after = engine.applyKnockoutAction(after, engine.getKnockoutActions(after)[0]);
  assert.equal(after.players[0].prizes.length, 4);
  const mega = player(card("mega", 48466));
  mega.active.damage = 180;
  mega.bench = [card("reserve", 49956)];
  mega.prizes = prizes("their", 6);
  const megaOwn = attacker(); megaOwn.prizes = prizes("ours", 2);
  const megaGame = state(megaOwn, mega);
  let megaAfter = engine.applyAttack(megaGame,
    engine.getLegalAttacks(megaGame).find(x => x.attackIndex === 1));
  assert.equal(megaAfter.pendingKnockout.remaining, 2); // 3 printed, 2 left
  megaAfter = engine.applyKnockoutAction(megaAfter, engine.getKnockoutActions(megaAfter)[0]);
  megaAfter = engine.applyKnockoutAction(megaAfter, engine.getKnockoutActions(megaAfter)[0]);
  assert.equal(megaAfter.winner, 0);
  assert.equal(megaAfter.winReason, "PRIZES");
  assert.equal(megaAfter.players[0].prizes.length, 0);
  assert.equal(engine.getKnockoutActions(megaAfter).length, 0);
});

test("opponent with no Bench loses after prize selection", () => {
  const own = player(card("heracross", 50339, [card("grass", 50745)]), [], prizes("deck", 2));
  own.prizes = prizes("own", 3);
  const foe = player(card("budew", 49956));
  foe.active.damage = 10;
  foe.prizes = prizes("their", 3);
  const game = state(own, foe);
  const after = engine.applyAttack(game, engine.getLegalAttacks(game)[0]);
  const done = engine.applyKnockoutAction(after, engine.getKnockoutActions(after)[0]);
  assert.equal(done.winner, 0);
  assert.equal(done.winReason, "NO_POKEMON");
  assert.equal(engine.getLegalAttacks(done).length, 0);
});

test("self knockout awards opponent a prize but does not trigger own previous opponent turn condition", () => {
  const own = player(card("heracross", 50339, prizes("grass", 3)));
  own.active.damage = 100;
  own.bench = [card("kichikigisu", 45913)];
  own.prizes = prizes("own", 3);
  const foe = player(card("mega", 48466)); foe.prizes = prizes("their", 3);
  const game = state(own, foe);
  let after = engine.applyAttack(game, engine.getLegalAttacks(game).find(x => x.attackIndex === 1));
  assert.equal(after.pendingKnockout.owner, 0);
  assert.deepEqual(after.players[0].trash.map(x => x.instanceId),
    ["heracross", "grass-0", "grass-1", "grass-2"]);
  after = engine.applyKnockoutAction(after, engine.getKnockoutActions(after)[0]);
  after = engine.applyKnockoutAction(after, engine.getKnockoutActions(after)[0]);
  assert.equal(after.turn, 1);
  assert.deepEqual(after.previousOpponentTurnKnockout, [false, false]);
  assert.equal(after.players[0].active.instanceId, "kichikigisu");
});

test("simultaneous knockouts and missing special prize rules stop safely", () => {
  const own = player(card("heracross", 50339, prizes("grass", 3)));
  own.active.damage = 100; own.prizes = prizes("own", 3);
  const foe = player(card("budew", 49956)); foe.prizes = prizes("their", 3);
  const game = state(own, foe);
  const after = engine.applyAttack(game, engine.getLegalAttacks(game).find(x => x.attackIndex === 1));
  assert.equal(after.pendingKnockout.reason, "SIMULTANEOUS_KNOCKOUT_NEEDS_REVIEW");
  assert.equal(engine.getKnockoutActions(after).length, 0);
  const unknown = player(card("zoroark", 47069));
  unknown.active.damage = 200; unknown.prizes = prizes("their", 3);
  const safeAttacker = structuredClone(own);
  safeAttacker.active.damage = 0;
  const uncertain = state(safeAttacker, unknown);
  assert.equal(engine.getLegalAttacks(uncertain).some(x => x.attackIndex === 1), false);
  assert.throws(() => engine.prizeValue(unknown.active), /Unsupported prize rule/);
  assert.equal(uncertain.players[1].active.damage, 200);
});


test("load-time compiled text runs Bug Panic bottom-seven math and card split",()=>{
  const grass=card("grass-bug",50745), attacker=card("amemousse",50341,[grass]);
  const bug1=card("bug-1",50344), bug2=card("bug-2",50382);
  const other=[card("nonbug-1",50340),card("nonbug-2",49973),card("nonbug-3",50340),card("nonbug-4",49973),card("nonbug-5",50340)];
  const game=state(player(attacker,[],[...other,bug1,bug2]),player(card("target",48466)));
  const entry=engine.attacks(attacker)[1];assert.equal(entry.status,"supported");
  const action=engine.getLegalAttacks(game).find(x=>x.attackIndex===1);assert.ok(action);
  assert.equal(engine.calculateAttackDamage(game,action),100);
  const after=engine.applyAttack(game,action);
  assert.equal(after.players[1].active.damage,100);
  assert.deepEqual(new Set(after.players[0].deck.filter(x=>["bug-1","bug-2"].includes(x.instanceId)).map(x=>x.instanceId)),new Set(["bug-1","bug-2"]));
  assert.equal(after.players[0].trash.length,5);
});

test("Ametama's parsed search only benches named Basic Pokémon and completes automatically",()=>{
  const matchEngine=new MatchEngine(engine.repository,abilities),attacker=card("ametama",50340,[card("colorless",50745)]);
  const match=state(player(attacker,[],[card("ametama-1",50340),card("ametama-2",50340),card("rotom",49973)]),player(card("target",48466)));match.turnNo=2;
  const attack=matchEngine.getLegalAttacks(match).find(x=>x.attackIndex===0);assert.ok(attack);
  assert.equal(matchEngine.attacks(attacker)[0].status,"supported");
  let after=matchEngine.applyAttack(match,attack);
  const choices=matchEngine.attackEffectActions(after);
  assert.deepEqual(choices.filter(x=>x.type==="ATTACK_SEARCH").map(x=>x.choiceInstanceId),["ametama-1","ametama-2"]);
  after=matchEngine.applyAttackEffect(after,choices.find(x=>x.choiceInstanceId==="ametama-1"));
  after=matchEngine.applyAttackEffect(after,matchEngine.attackEffectActions(after).find(x=>x.choiceInstanceId==="ametama-2"));
  assert.equal(after.players[0].bench.length,2);
  assert.equal(after.pendingAttack,undefined);
  assert.equal(after.players[0].deck.some(x=>x.instanceId==="rotom"),true);
});

test("Fan Call parses its first-turn limit and searches up to three eligible Colorless Pokémon",()=>{
  const matchEngine=new MatchEngine(engine.repository,abilities);
  const rotom=card("rotom-fan",49973),eligible1=card("eligible-1",49973),eligible2=card("eligible-2",49973),eligible3=card("eligible-3",49973),notEligible=card("ametama",50340);
  const game=state(player(rotom,[],[eligible1,notEligible,eligible2,eligible3]),player(card("target",48466)));
  const ability=matchEngine.entries(rotom)[0];assert.equal(ability.status,"supported");
  assert.equal(matchEngine.getMatchActions(game).some(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId===rotom.instanceId),true);
  let next=matchEngine.applyMatchAction(game,matchEngine.getMatchActions(game).find(x=>x.type==="USE_ABILITY"&&x.sourceInstanceId===rotom.instanceId));
  for(let i=0;i<3;i++){
    const pick=matchEngine.abilityChoiceActions(next).find(x=>x.type==="ABILITY_SELECT");assert.ok(pick);
    next=matchEngine.applyMatchAction(next,pick);
  }
  assert.equal(next.players[0].hand.length,3);
  assert.deepEqual(new Set(next.players[0].hand.map(x=>x.instanceId)),new Set(["eligible-1","eligible-2","eligible-3"]));
  assert.equal(next.pendingAbility,undefined);
  assert.equal(next.usedAbilities.names.filter(x=>x==="ファンコール").length,1);
  const secondTurn=structuredClone(game);secondTurn.turnsTaken[0]=1;
  assert.equal(matchEngine.getMatchActions(secondTurn).some(x=>x.type==="USE_ABILITY"),false);
});

test("all distinct cards from the newly loaded pair compile from their own printed text",()=>{
  const match=new MatchEngine(new CardRepository(db),abilities);
  for(const item of deckCoverageCards){
    const ref=card(`coverage-${item.officialCardId}`,item.officialCardId);
    if(item.cardType==="pokemon"){
      assert.ok(engine.attacks(ref).every(entry=>entry.status==="supported"),item.name+" attack text");
      assert.ok(engine.entries(ref).every(entry=>entry.status==="supported"),item.name+" ability text");
    }else if(item.trainerType==="stadium")assert.equal(engine.isSupportedStadium(ref),true,item.name);
    else if(item.trainerType==="tool")assert.equal(engine.isSupportedTool(ref),true,item.name);
    else if(item.cardType==="trainer")assert.ok(match.trainerSpec(ref),item.name+" trainer text");
  }
});

test("ability text is compiled from raw card data when the generated index has no entry",()=>{
  const catalog=structuredClone(abilities);delete catalog.abilities[46019];
  const runtime=new AttackEngine(new CardRepository(db),catalog),spinRotom=card("runtime-spin",46019);
  assert.equal(runtime.entries(spinRotom)[0].name,"ファンコール");
  assert.equal(runtime.entries(spinRotom)[0].status,"supported");
  assert.equal(runtime.entries(spinRotom)[0].operations[0].filter,"colorlessHP100");
});

test("Judge reshuffles both players' hands and draws four; Karate bonus applies to an Active ex",()=>{
  const match=new MatchEngine(new CardRepository(db),abilities);
  const judge=card("judge",25405), ownDraw=Array.from({length:4},(_,i)=>card(`own-${i}`,50749));
  const foeDraw=Array.from({length:4},(_,i)=>card(`foe-${i}`,50749));
  const game=state(player(card("own-active",49956),[judge,...ownDraw],[card("d1",50749)]),
    player(card("foe-active",47069),[card("foe-hand",50749)],foeDraw));
  game.phase="playing";game.turnNo=2;game.supporterUsedThisTurn=false;
  const play=match.getMatchActions(game).find(x=>x.type==="PLAY_TRAINER"&&x.sourceInstanceId==="judge");
  assert.ok(play);
  const afterJudge=match.applyMatchAction(game,play);
  assert.equal(afterJudge.players[0].hand.length,4);assert.equal(afterJudge.players[1].hand.length,4);
  const karate=card("karate",46597);
  const withKarate=state(player(card("own-active-2",49956),[karate]),player(card("foe-active-2",47069)));
  withKarate.phase="playing";withKarate.turnNo=2;
  const use=match.getMatchActions(withKarate).find(x=>x.type==="PLAY_TRAINER"&&x.sourceInstanceId==="karate");
  const boosted=match.applyMatchAction(withKarate,use);
  const [attack]=match.getLegalAttacks(boosted);
  assert.equal(match.calculateAttackDamage(boosted,attack),100); // +40, then Grass weakness
});

test("N Point Up, Care, Mixer, Night Academy and Chain Mochi produce their printed results",()=>{
  const match=new MatchEngine(new CardRepository(db),abilities);
  const energy=card("discard-energy",50745),nPokemon=card("n-bench",48651);
  const nPoint=card("n-point",47097);
  const game=state(player(card("active",50339),[nPoint],[]),player(card("foe",48466)));
  game.players[0].bench.push(nPokemon);game.players[0].trash.push(energy);game.phase="playing";game.turnNo=2;
  const use=match.getMatchActions(game).find(x=>x.type==="PLAY_TRAINER"&&x.sourceInstanceId==="n-point");
  assert.ok(use);const attached=match.applyMatchAction(game,use);
  assert.equal(attached.players[0].bench[0].attached[0].instanceId,"discard-energy");
  assert.ok(attached.players[0].trash.every(x=>x.instanceId!=="discard-energy"));

  const care=card("care",45637),recover=card("recover-pokemon",49956),recoverEnergy=card("recover-energy",50745);
  const careState=state(player(card("care-active",50339),[care]),player(card("care-foe",48466)));
  careState.phase="playing";careState.turnNo=2;careState.players[0].trash=[recover,recoverEnergy];
  const carePlay=match.getMatchActions(careState).find(x=>x.type==="PLAY_TRAINER"&&x.sourceInstanceId==="care");
  let careNext=match.applyMatchAction(careState,carePlay);
  for(const id of ["recover-pokemon","recover-energy"]){
    const select=match.getMatchActions(careNext).find(x=>x.type==="TRAINER_SELECT"&&x.choiceInstanceId===id);
    assert.ok(select);careNext=match.applyMatchAction(careNext,select);
  }
  assert.equal(careNext.players[0].hand.length,2);assert.equal(careNext.players[0].trash.some(x=>
    ["recover-pokemon","recover-energy"].includes(x.instanceId)),false);

  const mixer=card("mixer",46197),picked=card("mill-target",48466);
  const mixState=state(player(card("mix-active",50339),[mixer],[picked]),player(card("mix-foe",48466)));
  mixState.phase="playing";mixState.turnNo=2;
  const mixPlay=match.getMatchActions(mixState).find(x=>x.type==="PLAY_TRAINER"&&x.sourceInstanceId==="mixer");
  let mixNext=match.applyMatchAction(mixState,mixPlay);
  const choose=match.getMatchActions(mixNext).find(x=>x.type==="TRAINER_SELECT"&&x.choiceInstanceId==="mill-target");
  mixNext=match.applyMatchAction(mixNext,choose);
  assert.equal(mixNext.players[0].trash.at(-1).instanceId,"mill-target");

  const academy=card("academy",45939),returned=card("returned",50749);
  const academyState=state(player(card("academy-active",50339),[returned]),player(card("academy-foe",48466)));
  academyState.phase="playing";academyState.turnNo=2;academyState.stadium=academy;
  let academyNext=match.applyMatchAction(academyState,match.getMatchActions(academyState).find(x=>x.type==="NIGHT_ACADEMY_RETURN"));
  assert.equal(academyNext.players[0].deck[0].instanceId,"returned");
  assert.equal(match.getMatchActions(academyNext).some(x=>x.type==="NIGHT_ACADEMY_RETURN"),false);

  const tool=card("mochi",45932),poisoned=card("poisoned",49956,[card("tool-grass",50745)]);
  poisoned.statuses=["どく"];
  const toolState=state(player(poisoned,[tool]),player(card("tool-target",47069)));
  toolState.phase="playing";toolState.turnNo=2;
  const equip=match.getMatchActions(toolState).find(x=>x.type==="ATTACH_TOOL"&&x.sourceInstanceId==="mochi");
  const equipped=match.applyMatchAction(toolState,equip),[toolAttack]=match.getLegalAttacks(equipped);
  assert.equal(match.calculateAttackDamage(equipped,toolAttack),100); // +40 before weakness
});
