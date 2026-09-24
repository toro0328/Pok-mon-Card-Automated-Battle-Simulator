#!/usr/bin/env python3
"""Seed/update our card DB from the public type-null/PTCG-database mirror.

The mirror records official Japanese Pokemon Card detail data keyed by the
official jp_id. We keep the official detail URL and raw mirror payload so the
data can later be verified/reparsed. This is a fallback for environments where
pokemon-card.com blocks individual detail-page requests.
"""
import argparse, json
from datetime import datetime, timezone
from pathlib import Path

DB=Path("data/cards/cards.json")
MANIFEST=Path("data/cards/official-id-manifest.json")

def card_type(raw):
    t=str(raw.get("card_type","")).lower()
    if "pok" in t or raw.get("hp") is not None:
        return "pokemon"
    if "energy" in t or "エネルギー" in t:
        return "energy"
    return "trainer"

def normalize(raw):
    cid=int(raw["jp_id"])
    now=datetime.now(timezone.utc).isoformat()
    return {
        "officialCardId": cid,
        "name": raw.get("name") or f"official-card-{cid}",
        "cardType": card_type(raw),
        "source": {
            "detailUrl": raw.get("url") or f"https://www.pokemon-card.com/card-search/details.php/card/{cid}",
            "imageUrl": raw.get("img"),
            "fetchedAt": now,
            "dataMirror": "type-null/PTCG-database"
        },
        "raw": {
            "referenceData": raw
        },
        "engine": {
            "status": "unparsed",
            "effects": [],
            "handler": None,
            "notes": ["Imported from public mirror of official Japanese card data; semantic engine parsing pending."]
        }
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--source-dir", default="/tmp/PTCG-database/data_jp")
    ap.add_argument("--limit", type=int, default=20)
    args=ap.parse_args()

    source=Path(args.source_dir)
    db=json.loads(DB.read_text(encoding="utf-8"))
    manifest=json.loads(MANIFEST.read_text(encoding="utf-8"))
    allowed={int(x) for x in manifest.get("ids",[])}
    known={int(c["officialCardId"]) for c in db.get("cards",[])}

    candidates=[]
    for p in source.rglob("*.json"):
        try:
            raw=json.loads(p.read_text(encoding="utf-8"))
            cid=int(raw.get("jp_id"))
        except Exception:
            continue
        if cid in known:
            continue
        if allowed and cid not in allowed:
            continue
        candidates.append((cid,p,raw))

    candidates.sort(key=lambda x:x[0], reverse=True)
    batch=candidates[:args.limit]
    print(f"mirror candidates: {len(candidates)} / importing: {len(batch)}")

    for cid,p,raw in batch:
        db["cards"].append(normalize(raw))
        print("added",cid,raw.get("name"),p.parent.name)

    db["cards"].sort(key=lambda x:int(x["officialCardId"]))
    db["updatedAt"]=datetime.now(timezone.utc).isoformat()
    DB.write_text(json.dumps(db,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("added total:",len(batch))

if __name__=="__main__":
    main()
