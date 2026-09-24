#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { parseAbility } from "../src/card-db/parse-abilities.js";

const input = process.argv[2] ?? "data/cards/cards.json";
const output = process.argv[3] ?? "data/cards/ability-effects.json";
const source = fs.readFileSync(input);
const db = JSON.parse(source);
const abilities = {};
const counts = { supported: 0, needs_review: 0 };
for (const card of db.cards) {
  if (!Array.isArray(card.raw?.abilities) || card.raw.abilities.length === 0) continue;
  const entries = card.raw.abilities.map((ability, index) => {
    const parsed = parseAbility(ability.name, ability.effect);
    counts[parsed.status]++;
    return { index, name: ability.name, text: ability.effect, ...parsed };
  });
  abilities[card.officialCardId] = entries;
}
const result = {
  schemaVersion: 1,
  sourceSha256: crypto.createHash("sha256").update(source).digest("hex"),
  sourceUpdatedAt: db.updatedAt,
  cardCount: db.cards.length,
  abilityCount: counts.supported + counts.needs_review,
  counts,
  abilities
};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(`Compiled ${result.abilityCount} abilities from ${result.cardCount} cards: ${counts.supported} supported, ${counts.needs_review} need review`);
