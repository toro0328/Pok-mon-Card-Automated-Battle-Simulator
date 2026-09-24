#!/usr/bin/env python3
"""Import Japanese cards from a local mirror, restricted to official search IDs."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

TRAINERS = {"グッズ": "item", "サポート": "supporter", "スタジアム": "stadium", "ポケモンのどうぐ": "tool", "トレーナー": "unspecified"}
ENERGIES = {"基本エネルギー": "basic", "特殊エネルギー": "special"}

def normalize(raw, path, now):
    cid = raw["jp_id"]
    if type(cid) is not int or cid <= 0 or path.stem != str(cid):
        raise ValueError(f"ID mismatch: {path}")
    kind = raw.get("card_type")
    if kind in ("Pokémon", "Pokemon"):
        card_type, trainer_type, energy_type = "pokemon", None, None
    elif kind in TRAINERS:
        card_type, trainer_type, energy_type = "trainer", TRAINERS[kind], None
    elif kind in ENERGIES:
        card_type, trainer_type, energy_type = "energy", None, ENERGIES[kind]
    else:
        raise ValueError(f"unknown card_type {kind!r}: {path}")
    expected = f"https://www.pokemon-card.com/card-search/details.php/card/{cid}"
    url = raw.get("url") or expected
    if url != expected and not url.startswith(expected + "/"):
        raise ValueError(f"unexpected official URL: {url}")
    if not isinstance(raw.get("name"), str) or not raw["name"].strip():
        raise ValueError(f"missing name: {path}")
    return {
        "officialCardId": cid, "name": raw["name"], "regulation": None,
        "cardType": card_type, "trainerType": trainer_type, "energyType": energy_type,
        "source": {"detailUrl": url, "imageUrl": raw.get("img"),
                   "fetchedAt": now, "fallbackDataset": "type-null/PTCG-database",
                   "fallbackPath": "data_jp/" + str(path).split("data_jp/", 1)[-1]},
        "raw": raw,
        "engine": {"status": "needs_review" if trainer_type == "unspecified" else "unparsed",
                   "effects": [], "handler": None,
                   "notes": ["Reference data only; printed regulation and effects are unverified."]
                   + (["Unclassified trainer (e.g. a fossil); special play rules need review."]
                      if trainer_type == "unspecified" else [])},
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-dir", type=Path, default=Path("/tmp/PTCG-database/data_jp"))
    ap.add_argument("--db", type=Path, default=Path("data/cards/cards.json"))
    ap.add_argument("--manifest", type=Path, default=Path("data/cards/official-id-manifest.json"))
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--min-id", type=int, default=0)
    ap.add_argument("--ids", type=int, nargs="+", help="Import only these official IDs")
    args = ap.parse_args()
    if args.limit < 1 or not args.source_dir.is_dir():
        ap.error("positive --limit and existing --source-dir required")
    db = json.loads(args.db.read_text(encoding="utf-8"))
    allowed = set(json.loads(args.manifest.read_text(encoding="utf-8"))["ids"])
    if not allowed:
        raise ValueError("official ID manifest is empty")
    known = {card["officialCardId"] for card in db["cards"]}
    if len(known) != len(db["cards"]):
        raise ValueError("duplicate officialCardId in database")
    requested = set(args.ids or [])
    if requested - allowed:
        raise ValueError(f"IDs absent from official search: {sorted(requested - allowed)}")
    paths = []
    for path in args.source_dir.rglob("*.json"):
        try:
            cid = int(path.stem)
        except ValueError:
            continue
        if cid in allowed and cid not in known and cid >= args.min_id and (not requested or cid in requested):
            paths.append((cid, path))
    missing = requested - known - {cid for cid, _ in paths}
    if missing:
        raise ValueError(f"IDs missing from mirror: {sorted(missing)}")
    paths.sort(key=lambda pair: (-pair[0], str(pair[1])))
    seen = {}
    for cid, path in paths:
        if cid in seen:
            raise ValueError(f"duplicate mirror ID {cid}: {seen[cid]} and {path}")
        seen[cid] = path
    now = datetime.now(timezone.utc).isoformat()
    added = []
    errors = []
    for cid, path in paths:
        if len(added) >= args.limit:
            break
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            added.append(normalize(raw, path, now))
        except (ValueError, KeyError, json.JSONDecodeError) as exc:
            errors.append(f"{path}: {exc}")
    if errors:
        raise ValueError(f"{len(errors)} invalid mirror cards; first 20: " + "; ".join(errors[:20]))
    if added:
        db["cards"].extend(added)
        db["cards"].sort(key=lambda card: card["officialCardId"])
        db["updatedAt"] = now
        args.db.write_text(json.dumps(db, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for card in added[:20]:
        print("added", card["officialCardId"], card["name"], card["cardType"])
    print("added total:", len(added))

if __name__ == "__main__":
    main()
