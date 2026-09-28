import test from "node:test";
import assert from "node:assert/strict";
import { analyzeEffectsWithAi, readEffectAiSettings, saveEffectAiSettings } from "../src/decks/effect-ai-client.js";
import { recordAiEffectAnalyses, loadEffectLibrary, recordDeckLearning } from "../src/decks/effect-library.js";
import { handleRequest } from "../effect-ai-worker/worker.js";

const memory = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };
const input = [{ key: "ability:自分の番に1回使える。", kind: "ability", name: "テスト特性", text: "自分の番に1回使える。" }];
const output = { key: input[0].key, summary: "自分の番に1回使えます。", steps: ["使用を宣言する"], timing: "自分の番", conditions: [], questions: [], confidence: "high" };

test("AI settings require HTTPS and persist the endpoint and app token", () => {
  const storage = memory();
  assert.throws(() => saveEffectAiSettings({ endpoint: "http://example.com" }, storage), /https/);
  saveEffectAiSettings({ endpoint: "https://worker.example/analyze", token: "app-token" }, storage);
  assert.deepEqual(readEffectAiSettings(storage), { endpoint: "https://worker.example/analyze", token: "app-token" });
});

test("client deduplicates effects, batches requests, and validates response keys", async () => {
  const calls = [];
  const result = await analyzeEffectsWithAi([...input, ...input], { endpoint: "https://worker.example/analyze", token: "secret" }, async (url, options) => {
    calls.push({ url, options }); return Response.json({ analyses: [{ ...output }] });
  });
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].options.body).effects.length, 1);
  assert.equal(calls[0].options.headers.authorization, "Bearer secret");
  assert.equal(result.analyses[0].status, "ai_review");
  assert.equal(result.analyses[0].officialRulesVerified, false);
  await assert.rejects(() => analyzeEffectsWithAi(input, { endpoint: "https://worker.example" }, async () => Response.json({ analyses: [{ ...output, key: "other" }] })), /不正な効果/);
});

test("AI notes are written to existing encyclopedia entries without upgrading support", () => {
  const storage = memory(), deck = { deckCode: "ABCDEF-GHIJKL-MNOPQR", cards: [{ officialCardId: 101, count: 1 }] };
  const report = { officialCardId: 101, name: "テストカード", type: "pokemon", supported: false,
    details: [{ label: "特性：テスト特性", status: "needs_review", text: "自分の番に1回使える。" }] };
  recordDeckLearning([deck], [report], [{ officialCardId: 101, name: "テストカード", program: { abilities: [], attacks: [] } }], storage);
  assert.deepEqual(recordAiEffectAnalyses([{ ...output, kind: "ability" }], storage), { saved: 1 });
  const effect = loadEffectLibrary(storage).effects[input[0].key];
  assert.equal(effect.aiAnalysis.summary, output.summary);
  assert.equal(effect.aiAnalysis.officialRulesVerified, false);
  assert.equal(effect.status, "needs_learning");
});

test("worker enforces origin, bearer token, and effect-count limits", async () => {
  const env = { ALLOWED_ORIGIN: "https://site.example", CLIENT_TOKEN: "app-token", OPENAI_API_KEY: "unused" };
  const otherOrigin = await handleRequest(new Request("https://worker.example/analyze", { method: "POST", headers: { origin: "https://bad.example" }, body: "{}" }), env);
  assert.equal(otherOrigin.status, 403);
  const unauthorized = await handleRequest(new Request("https://worker.example/analyze", { method: "POST", headers: { origin: env.ALLOWED_ORIGIN }, body: JSON.stringify({ effects: input }) }), env);
  assert.equal(unauthorized.status, 401);
  const tooMany = Array.from({ length: 13 }, (_, i) => ({ key: `x${i}`, text: "x" }));
  const limited = await handleRequest(new Request("https://worker.example/analyze", { method: "POST", headers: { authorization: "Bearer app-token", origin: env.ALLOWED_ORIGIN }, body: JSON.stringify({ effects: tooMany }) }), env);
  assert.equal(limited.status, 400);
});

test("worker calls mocked Responses API and stores the AI analysis in optional KV", async () => {
  const kv = new Map(), env = { ALLOWED_ORIGIN: "https://site.example", CLIENT_TOKEN: "app-token", OPENAI_API_KEY: "test-key",
    EFFECTS: { get: async key => kv.has(key) ? JSON.parse(kv.get(key)) : null, put: async (key, value) => kv.set(key, value) } };
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++; assert.equal(url, "https://api.openai.com/v1/responses"); assert.equal(options.headers.authorization, "Bearer test-key");
    return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ analyses: [output] }) }] }] });
  };
  const request = () => new Request("https://worker.example/analyze", { method: "POST", headers: { authorization: "Bearer app-token", origin: env.ALLOWED_ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ effects: input }) });
  const first = await handleRequest(request(), env, fetcher);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).analyses[0].officialRulesVerified, false);
  assert.equal(kv.size, 1);
  const second = await handleRequest(request(), env, fetcher);
  assert.equal(second.status, 200);
  assert.equal(calls, 1);
});
