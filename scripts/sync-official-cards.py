#!/usr/bin/env python3
"""Discover Japanese Pokemon Card IDs from the official site's own search API.

This intentionally separates discovery from parsing. It writes an ID manifest
that a later importer can fetch/normalize into data/cards/cards.json.
"""
import json, time, urllib.parse, urllib.request
from pathlib import Path

API="https://www.pokemon-card.com/card-search/resultAPI.php"
OUT=Path("data/cards/official-id-manifest.json")
UA="PokecaBattleSimulator/0.1 (+GitHub; polite card-db sync)"

def get_page(page, regulation="all"):
    qs=urllib.parse.urlencode({"keyword":"","regulation_sidebar_form":regulation,"page":page})
    req=urllib.request.Request(f"{API}?{qs}",headers={"User-Agent":UA,"Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=30) as r:
        return json.load(r)

def discover(regulation="all", delay=1.0):
    page,max_page=1,1
    ids=set()
    while page<=max_page:
        data=get_page(page,regulation)
        if data.get("result")!=1:
            raise RuntimeError(f"official search API returned result={data.get('result')} on page {page}")
        max_page=int(data.get("maxPage",max_page))
        for row in data.get("cardList",[]):
            cid=str(row.get("cardID",""))
            if cid.isdigit(): ids.add(int(cid))
        page+=1
        if page<=max_page: time.sleep(delay)
    return sorted(ids)

def main():
    ids=discover()
    OUT.parent.mkdir(parents=True,exist_ok=True)
    old={}
    if OUT.exists():
        old=json.loads(OUT.read_text(encoding="utf-8"))
    old_ids=set(old.get("ids",[]))
    payload={"schemaVersion":1,"source":API,"count":len(ids),"ids":ids,
             "newIds":sorted(set(ids)-old_ids)}
    OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"official IDs: {len(ids)} / new: {len(payload['newIds'])}")

if __name__=="__main__":
    main()
