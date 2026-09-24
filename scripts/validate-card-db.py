#!/usr/bin/env python3
"""Fail a sync before commit when imported card records are inconsistent."""
import json
from pathlib import Path

db = json.loads(Path("data/cards/cards.json").read_text(encoding="utf-8"))
manifest = json.loads(Path("data/cards/official-id-manifest.json").read_text(encoding="utf-8"))
allowed = set(manifest["ids"])
seen = set()
trainers = {"item", "supporter", "stadium", "tool"}
energies = {"basic", "special"}
statuses = {"unparsed", "supported", "needs_review", "custom_handler"}
for card in db["cards"]:
    cid = card["officialCardId"]
    assert type(cid) is int and cid in allowed and cid not in seen, f"invalid/duplicate ID: {cid}"
    seen.add(cid)
    assert card["name"] and isinstance(card["raw"], dict), f"invalid raw: {cid}"
    if card["source"].get("fallbackDataset") == "type-null/PTCG-database":
        assert card["raw"].get("jp_id") == cid, f"mirror ID mismatch: {cid}"
    assert card["source"]["detailUrl"].startswith(
        f"https://www.pokemon-card.com/card-search/details.php/card/{cid}"
    ), f"invalid URL: {cid}"
    kind = card["cardType"]
    assert kind in {"pokemon", "trainer", "energy"}, f"unknown card type: {cid}"
    if kind == "trainer":
        assert card.get("trainerType") in trainers, f"unknown trainer type: {cid}"
    if kind == "energy":
        assert card.get("energyType") in energies, f"unknown energy type: {cid}"
    assert card.get("regulation") in {None, "H", "I", "J"}, f"invalid mark: {cid}"
    assert card["engine"]["status"] in statuses, f"invalid status: {cid}"
    assert isinstance(card["engine"]["effects"], list), f"invalid effects: {cid}"
print(f"Validated {len(seen)} cards")
