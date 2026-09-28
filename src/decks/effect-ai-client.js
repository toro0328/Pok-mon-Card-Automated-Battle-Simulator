const SETTINGS_KEY = "pokemon-card-simulator-effect-ai-settings-v1";

export function readEffectAiSettings(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? "null");
    return {
      endpoint: typeof value?.endpoint === "string" ? value.endpoint : "",
      token: typeof value?.token === "string" ? value.token : "",
    };
  } catch {
    return { endpoint: "", token: "" };
  }
}

export function saveEffectAiSettings(settings, storage = globalThis.localStorage) {
  const endpoint = String(settings?.endpoint ?? "").trim();
  const token = String(settings?.token ?? "").trim();
  if (endpoint) {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") throw new Error("AI解析URLはhttps://で始まるURLを指定してください。");
    if (url.username || url.password) throw new Error("URLにユーザー名やパスワードを含めないでください。");
  }
  storage?.setItem(SETTINGS_KEY, JSON.stringify({ endpoint, token }));
  return { endpoint, token };
}

export async function analyzeEffectsWithAi(effects, settings, fetcher = globalThis.fetch) {
  if (!settings?.endpoint) return { status: "not_configured", analyses: [] };
  const unique = [...new Map(effects.filter(item => item?.key && item?.text)
    .map(item => [item.key, { key: item.key, name: item.name ?? "", kind: item.kind ?? "card_effect", text: item.text }])).values()];
  if (!unique.length) return { status: "nothing_to_analyze", analyses: [] };
  const batches = [];
  for (let i = 0; i < unique.length; i += 12) batches.push(unique.slice(i, i + 12));
  const analyses = [];
  for (const batch of batches) {
    const response = await fetcher(settings.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...(settings.token ? { authorization: `Bearer ${settings.token}` } : {}) },
      body: JSON.stringify({ effects: batch }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try { message = (await response.json()).error ?? message; } catch {}
      throw new Error(`AI効果解析に接続できません（${message}）。設定したURL・トークンを確認してください。`);
    }
    const data = await response.json();
    if (!Array.isArray(data.analyses)) throw new Error("AI効果解析サービスの応答形式が正しくありません。");
    const allowed = new Set(batch.map(item => item.key));
    for (const analysis of data.analyses) {
      if (!allowed.has(analysis.key) || typeof analysis.summary !== "string" || !Array.isArray(analysis.steps))
        throw new Error("AI効果解析サービスから不正な効果データが返りました。");
      analyses.push({ ...analysis, status: "ai_review", officialRulesVerified: false, analyzedAt: new Date().toISOString() });
    }
  }
  return { status: "analyzed", analyses };
}
