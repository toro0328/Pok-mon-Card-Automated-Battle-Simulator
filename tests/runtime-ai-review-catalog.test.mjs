import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {gunzipSync} from "node:zlib";

test("bundled effect review catalog is complete and remains memo-only",()=>{
  const encoded=fs.readFileSync("data/effect-ai-review.json.gz.b64","utf8").trim();
  const catalog=JSON.parse(gunzipSync(Buffer.from(encoded,"base64")).toString("utf8"));
  assert.equal(catalog.schemaVersion,1);
  assert.deepEqual(catalog.sourceTotals,{queued:1213,completed:1213,remaining:0});
  assert.equal(catalog.analyses.length,1213);
  assert.equal(new Set(catalog.analyses.map(item=>item.key)).size,1213);
  for(const entry of catalog.analyses){
    assert.ok(entry.key.startsWith(`${entry.kind}:`));
    assert.equal(entry.aiAnalysis.status,"ai_review");
    assert.equal(entry.aiAnalysis.officialRulesVerified,false);
    assert.ok(Array.isArray(entry.aiAnalysis.steps));
  }
  assert.ok(catalog.analyses.some(entry=>entry.kind==="energy"));
  assert.ok(catalog.analyses.some(entry=>entry.kind==="card_effect"));
});
