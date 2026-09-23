#!/usr/bin/env python3
"""Discover Standard-regulation Japanese card IDs from the official search API."""
import json, time, urllib.parse, urllib.request
from pathlib import Path

API="https://www.pokemon-card.com/card-search/resultAPI.php"
OUT=Path("data/cards/official-id-manifest.json")
UA="PokecaBattleSimulator/0.1 (+GitHub; polite card-db sync)"
REGS=("H","I","J")

def get_page(page, regulation):
    qs=urllib.parse.urlencode({"keyword":"","regulation_sidebar_form":regulation,"page":page})
    req=urllib.request.Request(f"{API}?{qs}",headers={"User-Agent":UA,"Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=30) as r:
        return json.load(r)

def discover(regulation, delay=1.2):
    page,max_page=1,1
    ids=set()
    while page<=max_page:
        data=get_page(page,regulation)
        if data.get("result")!=1:
            raise RuntimeError(f"{regulation}: result={data.get('result')} page={page}")
        max_page=int(data.get("maxPage",max_page))
        for row in data.get("cardList",[]):
            cid=str(row.get("cardID",""))
            if cid.isdigit(): ids.add(int(cid))
        page+=1
        if page<=max_page: time.sleep(delay)
    return sorted(ids)

def main():
    OUT.parent.mkdir(parents=True,exist_ok=True)
    old=json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    old_ids=set(old.get("ids",[]))
    by_reg={}
    all_ids=set()
    for reg in REGS:
        ids=discover(reg)
        by_reg[reg]=ids
        all_ids.update(ids)
        print(f"{reg}: {len(ids)} IDs")
        time.sleep(2)
    ids=sorted(all_ids)
    payload={"schemaVersion":2,"source":API,"regulations":list(REGS),
             "count":len(ids),"ids":ids,"idsByRegulation":by_reg,
             "newIds":sorted(set(ids)-old_ids)}
    OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Standard IDs: {len(ids)} / new: {len(payload['newIds'])}")

if __name__=="__main__":
    main()
