#!/usr/bin/env python3
"""Import Japanese card data from type-null/PTCG-database as a fallback source.

The official Japanese search API remains the source of truth for card IDs.
This importer uses the public reference DB for card detail fields when direct
official detail-page access from GitHub Actions is blocked.
"""
import argparse, json, urllib.request
from datetime import datetime, timezone
from pathlib import Path

DB=Path("data/cards/cards.json")
API="https://api.github.com/repos/type-null/PTCG-database/git/trees/main?recursive=1"
RAW="https://raw.githubusercontent.com/type-null/PTCG-database/main/{}"
UA="PokecaBattleSimulator/0.2"
STANDARD={"H","I","J"}

def get_json(url):
    req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"application/vnd.github+json"})
    with urllib.request.urlopen(req,timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))

def regulation_from_set_img(card):
    # Official regulation image filenames are more reliable than guessing from set code.
    # Reference data may not expose H/I/J directly, so keep unknown cards reviewable.
    for key in ("regulation","regulation_mark","regulationMark"):
        v=card.get(key)
        if isinstance(v,str) and v.upper() in STANDARD:
            return v.upper()
    return None

def card_type(v):
    s=str(v or "").lower()
    if "pok" in s: return "pokemon"
    if "energy" in s or "エネルギー" in s: return "energy"
    return "trainer"

def normalize(c,path):
    cid=int(c.get("jp_id") or Path(path).stem)
    reg=regulation_from_set_img(c)
    raw=dict(c)
    return {
      "officialCardId":cid,
      "name":c.get("name") or f"official-card-{cid}",
      "regulation":reg,
      "cardType":card_type(c.get("card_type")),
      "source":{
        "detailUrl":c.get("url") or f"https://www.pokemon-card.com/card-search/details.php/card/{cid}",
        "imageUrl":c.get("img"),
        "fetchedAt":datetime.now(timezone.utc).isoformat(),
        "fallbackDataset":"type-null/PTCG-database",
        "fallbackPath":path
      },
      "raw":raw,
      "engine":{
        "status":"unparsed",
        "effects":[],
        "handler":None,
        "notes":["Imported from fallback reference dataset; official card ID/detail URL retained for verification."]
      }
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--limit",type=int,default=20)
    ap.add_argument("--min-id",type=int,default=0)
    args=ap.parse_args()
    db=json.loads(DB.read_text(encoding="utf-8"))
    known={int(x["officialCardId"]) for x in db.get("cards",[])}
    tree=get_json(API).get("tree",[])
    files=[]
    for x in tree:
        p=x.get("path","")
        if x.get("type")=="blob" and p.startswith("data_jp/") and p.endswith(".json"):
            try: cid=int(Path(p).stem)
            except ValueError: continue
            if cid>=args.min_id and cid not in known:
                files.append((cid,p))
    files.sort(reverse=True)
    added=0
    for cid,p in files:
        try:
            c=get_json(RAW.format(p))
            db["cards"].append(normalize(c,p))
            known.add(cid); added+=1
            print("added",cid,c.get("name"),p)
            if added>=args.limit: break
        except Exception as e:
            print("failed",cid,p,repr(e))
    db["cards"].sort(key=lambda x:int(x["officialCardId"]))
    db["updatedAt"]=datetime.now(timezone.utc).isoformat()
    DB.write_text(json.dumps(db,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("added total:",added)

if __name__=="__main__":
    main()
