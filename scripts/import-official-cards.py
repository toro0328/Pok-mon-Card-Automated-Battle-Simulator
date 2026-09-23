#!/usr/bin/env python3
"""Fetch official Japanese card detail pages and append raw card records.

Discovery comes from official-id-manifest.json. This importer deliberately
stores raw/visible text first. Semantic engine parsing is a separate stage.
"""
import argparse, json, re, time, urllib.request
from datetime import datetime, timezone
from html import unescape
from pathlib import Path

MANIFEST=Path("data/cards/official-id-manifest.json")
DB=Path("data/cards/cards.json")
BASE="https://www.pokemon-card.com/card-search/details.php/card/{}/regu/all"
UA="PokecaBattleSimulator/0.1 (+GitHub; polite card-db sync)"
STANDARD={"H","I","J"}

def fetch(cid):
    url=BASE.format(cid)
    req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept-Language":"ja"})
    with urllib.request.urlopen(req,timeout=30) as r:
        return url,r.read().decode("utf-8","replace")

def clean_html(s):
    s=re.sub(r"<script\b[^>]*>.*?</script>"," ",s,flags=re.I|re.S)
    s=re.sub(r"<style\b[^>]*>.*?</style>"," ",s,flags=re.I|re.S)
    s=re.sub(r"<br\s*/?>","\n",s,flags=re.I)
    s=re.sub(r"</(?:p|li|div|tr|h[1-6])>","\n",s,flags=re.I)
    s=re.sub(r"<[^>]+>"," ",s)
    s=unescape(s).replace("\u3000"," ")
    return "\n".join(x.strip() for x in s.splitlines() if x.strip())

def first(pattern,text,flags=re.I|re.S):
    m=re.search(pattern,text,flags)
    return clean_html(m.group(1)).strip() if m else None

def parse(cid,url,html):
    title=first(r'<h1[^>]*class="[^"]*Heading[^"]*"[^>]*>(.*?)</h1>',html)
    if not title:
        title=first(r"<title[^>]*>(.*?)</title>",html)
        if title: title=re.sub(r"\s*\|.*$","",title).strip()
    reg=None
    # Official detail pages expose the regulation mark in image alt/text or nearby markup.
    for pat in [r'(?:レギュレーション|regulation)[^HIJ]{0,80}\b([HIJ])\b',
                r'alt=["\'][^"\']*\b([HIJ])\b[^"\']*["\']']:
        m=re.search(pat,html,re.I|re.S)
        if m: reg=m.group(1).upper(); break
    text=clean_html(html)
    # Conservative type classification; ambiguous pages remain reviewable raw records.
    if re.search(r"\bHP\s*\d+",text): typ="pokemon"
    elif "基本エネルギー" in text or "特殊エネルギー" in text: typ="energy"
    else: typ="trainer"
    return {
      "officialCardId":cid,"name":title or f"official-card-{cid}",
      "regulation":reg,"cardType":typ,
      "source":{"detailUrl":url,"imageUrl":None,
                "fetchedAt":datetime.now(timezone.utc).isoformat()},
      "raw":{"pageText":text},
      "engine":{"status":"unparsed","effects":[],"handler":None,
                "notes":[] if reg else ["regulation mark not confidently parsed"]}
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--limit",type=int,default=20)
    ap.add_argument("--all-regulations",action="store_true")
    ap.add_argument("--ids",nargs="*",type=int)
    args=ap.parse_args()
    manifest=json.loads(MANIFEST.read_text(encoding="utf-8"))
    db=json.loads(DB.read_text(encoding="utf-8"))
    known={x["officialCardId"] for x in db["cards"]}
    ids=args.ids or list(reversed(manifest.get("ids",[])))
    added=0
    for cid in ids:
        if cid in known: continue
        try:
            url,html=fetch(cid); card=parse(cid,url,html)
            if not args.all_regulations and card["regulation"] not in STANDARD:
                continue
            db["cards"].append(card); known.add(cid); added+=1
            print("added",cid,card["name"],card["regulation"])
            if added>=args.limit: break
            time.sleep(0.8)
        except Exception as e:
            print("failed",cid,repr(e))
    db["cards"].sort(key=lambda x:x["officialCardId"])
    db["updatedAt"]=datetime.now(timezone.utc).isoformat()
    DB.write_text(json.dumps(db,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("added total:",added)

if __name__=="__main__": main()
