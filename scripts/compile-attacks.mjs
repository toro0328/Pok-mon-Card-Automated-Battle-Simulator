#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { inspectAttacks } from "../src/card-db/parse-effects.js";

const input = process.argv[2] ?? "data/cards/cards.json";
const output = process.argv[3] ?? "data/cards/attack-effects.json";
const source = fs.readFileSync(input);
const db = JSON.parse(source);
const attacks = {};
const counts = { supported: 0, needs_review: 0 };
for (const card of db.cards) {
  const entries = inspectAttacks(card);
  if (!entries.length) continue;
  for (const entry of entries) counts[entry.status]++;
  attacks[card.officialCardId] = entries;
}
const catalog = {
  schemaVersion: 1,
  sourceSha256: crypto.createHash("sha256").update(source).digest("hex"),
  sourceUpdatedAt: db.updatedAt, cardCount: db.cards.length,
  attackCount: counts.supported + counts.needs_review, counts, attacks
};
fs.writeFileSync(output, JSON.stringify(catalog, null, 2) + "\n");
console.log(`Compiled ${catalog.attackCount} attacks from ${catalog.cardCount} cards: ${counts.supported} supported, ${counts.needs_review} need review`);
