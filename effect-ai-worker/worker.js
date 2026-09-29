const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    analyses: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      key: { type: "string" }, summary: { type: "string" }, executableText: { type: ["string", "null"] }, steps: { type: "array", items: { type: "string" } },
      timing: { type: "string" }, conditions: { type: "array", items: { type: "string" } },
      questions: { type: "array", items: { type: "string" } }, confidence: { type: "string", enum: ["high", "medium", "low"] },
    }, required: ["key", "summary", "executableText", "steps", "timing", "conditions", "questions", "confidence"] } },
  }, required: ["analyses"],
};

const json = (data, status, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
});
function corsHeaders(origin, allowedOrigin) {
  return origin === allowedOrigin ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "authorization, content-type", "access-control-max-age": "86400", vary: "Origin" } : {};
}
function normalizeEffect(input) {
  if (!input || typeof input !== "object") return null;
  if (typeof input.key !== "string" || input.key.length > 160 || typeof input.text !== "string" || !input.text.trim() || input.text.length > 1800) return null;
  return { key: input.key, name: typeof input.name === "string" ? input.name.slice(0, 100) : "", kind: typeof input.kind === "string" ? input.kind.slice(0, 32) : "card_effect", text: input.text.trim() };
}
async function hashKey(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function extractOutputText(data) {
  return (data?.output ?? []).flatMap(item => item?.type === "message" ? (item.content ?? []) : [])
    .filter(item => item?.type === "output_text").map(item => item.text ?? "").join("\n");
}

export async function handleRequest(request, env, fetcher = fetch) {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigin = env.ALLOWED_ORIGIN ?? "https://toro0328.github.io";
  const headers = corsHeaders(origin, allowedOrigin);
  if (origin && origin !== allowedOrigin) return json({ error: "Origin is not allowed" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "effect-ai" }, 200, headers);
  if (request.method !== "POST" || url.pathname !== "/analyze") return json({ error: "Not found" }, 404, headers);
  if (!env.CLIENT_TOKEN) return json({ error: "Worker client token is not configured" }, 503, headers);
  if (request.headers.get("authorization") !== `Bearer ${env.CLIENT_TOKEN}`) return json({ error: "Unauthorized" }, 401, headers);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 24_000) return json({ error: "Request is too large" }, 413, headers);
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 24_000) return json({ error: "Request is too large" }, 413, headers);
  let body;
  try { body = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON" }, 400, headers); }
  if (!Array.isArray(body?.effects) || body.effects.length < 1 || body.effects.length > 12) return json({ error: "Send between 1 and 12 effects" }, 400, headers);
  const effects = body.effects.map(normalizeEffect);
  if (effects.some(effect => !effect) || new Set(effects.map(effect => effect.key)).size !== effects.length) return json({ error: "Effect data is invalid or duplicated" }, 400, headers);
  if (!env.OPENAI_API_KEY) return json({ error: "AI service is not configured" }, 503, headers);
  const result = new Map();
  const missing = [];
  for (const effect of effects) {
    const cacheKey = `v1:${await hashKey(`${effect.kind}:${effect.text}`)}`;
    let cached;
    try { cached = await env.EFFECTS?.get(cacheKey, "json"); } catch { cached = null; }
    if (cached && cached.key === effect.key) result.set(effect.key, cached);
    else missing.push(effect);
  }
  if (missing.length) {
    let response;
    try {
      response = await fetcher("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ model: env.OPENAI_MODEL ?? "gpt-6-luna", store: false,
          instructions: "あなたはポケモンカードの効果文を構造化する補助者です。入力文だけを根拠に意味を説明し、書かれていない条件やルールを補ってはいけません。executableTextは、kindがattackの場合に限り、入力の意味を一切変えず、このシミュレーターの厳密な攻撃文パーサーで扱える日本語文へ正規化できるときだけ設定してください。扱える基本形は「自分の山札をN枚引く。」「相手のバトルポケモンをどく／やけど／ねむり／マヒ／こんらんにする。」「コインを1回投げオモテなら、相手のバトルポケモンを（状態）にする。」「このポケモンにもNダメージ。」「相手のバトルポケモンに、ダメカンをN個のせる。」「このポケモンのHPを『N』回復する。」と、これらの完全一致する文を「。」で連結した形です。Nは入力に明記された数だけ使います。条件、対象、回数、任意性などが完全一致しない、または意味を変えずにこの形にできない場合はnullにしてください。他のkindでは必ずnullです。推測がある場合はexecutableTextをnullにし、confidenceをlowまたはmediumにします。これは公式ルール確認ではありません。返答は指定JSONのみです。",
          input: JSON.stringify(missing.map(({ key, name, kind, text }) => ({ key, name, kind, effect_text: text }))),
          text: { format: { type: "json_schema", name: "pokemon_card_effect_analysis", strict: true, schema: SCHEMA } },
        }),
      });
    } catch (error) { return json({ error: `AI provider connection failed: ${error.message}` }, 502, headers); }
    if (!response.ok) return json({ error: `AI provider returned HTTP ${response.status}` }, 502, headers);
    let payload;
    try { payload = await response.json(); } catch { return json({ error: "AI provider response was not JSON" }, 502, headers); }
    let parsed;
    try { parsed = JSON.parse(extractOutputText(payload)); } catch { return json({ error: "AI provider returned invalid structured output" }, 502, headers); }
    const expected = new Set(missing.map(effect => effect.key));
    if (!Array.isArray(parsed.analyses) || parsed.analyses.length !== missing.length || parsed.analyses.some(item => !expected.has(item.key)) || new Set(parsed.analyses.map(item => item.key)).size !== parsed.analyses.length)
      return json({ error: "AI provider output did not match requested effects" }, 502, headers);
    for (const analysis of parsed.analyses) {
      const record = { ...analysis, kind: missing.find(effect => effect.key === analysis.key).kind, status: "ai_review", officialRulesVerified: false };
      result.set(analysis.key, record);
      const cacheKey = `v1:${await hashKey(`${record.kind}:${missing.find(effect => effect.key === analysis.key).text}`)}`;
      try { await env.EFFECTS?.put(cacheKey, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 365 }); } catch { /* KV is optional; browser library still records the response. */ }
    }
  }
  return json({ analyses: effects.map(effect => result.get(effect.key)).filter(Boolean) }, 200, headers);
}

export default { fetch: handleRequest };
