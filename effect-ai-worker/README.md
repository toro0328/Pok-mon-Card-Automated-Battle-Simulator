# Effect analysis service

This Cloudflare Worker accepts unresolved effect texts from the AI-vs-AI page, asks the OpenAI Responses API for a structured reading, and returns it as an **AI review note**. It never converts model output into an executable battle-engine program or marks an effect as supported. The browser encyclopedia remains the source for runtime reuse.

## Deploy

Requirements: a Cloudflare account with Workers enabled, Wrangler (`npx wrangler`), and an OpenAI API project key. The key belongs only in the Worker secret store; never put it in `spectator.html`, a URL, or browser storage.

From this directory:

```sh
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put CLIENT_TOKEN
npx wrangler deploy
```

Set `CLIENT_TOKEN` to a long random token, then enter that token and the deployed `https://…workers.dev/analyze` URL in **AI効果解析の接続設定** on the AI-vs-AI page. The browser sends only the app token and card text. CORS is limited to the configured GitHub Pages origin. Do not set `CLIENT_TOKEN` to the OpenAI key.

The Worker works without KV; in that mode each browser persists results in its own local encyclopedia. To share cached analyses across browsers, create a KV namespace:

```sh
npx wrangler kv namespace create EFFECTS
```

Add the returned namespace ID to `wrangler.toml` under `[[kv_namespaces]]` as shown in the commented example, then deploy again. The cache key uses the effect kind and normalized text. Treat the analysis cache as a review aid, not a verified ruling database.

## Local smoke test

`npm test` includes mocked provider calls; tests do not make billable API requests. For a local Worker, run `npx wrangler dev` after setting local secrets in an ignored `.dev.vars` file. Never commit `.dev.vars`.
