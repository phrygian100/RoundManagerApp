"""
Pass 2 for clients that resisted full-address geocoding: try street-level
matches (road + village) so they at least pin to the right road for round
ordering. Remaining failures go to _geo/manual_remaining.json for browser
diligence.

Usage: python scripts/geo_pass2.py
"""

import json
import re
import time
from pathlib import Path

from geo_verify_clients import (
    OUT, PLAN_FILE, UK_PC, api, load, save, nominatim_search, reverse_postcode,
)

REMAINING_FILE = OUT / "manual_remaining.json"
PASS2_APPLIED_FILE = OUT / "pass2_applied.json"

ROAD_SUFFIXES = (
    "lane|road|street|close|drive|avenue|way|court|place|crescent|gardens|"
    "terrace|row|green|end|gate|hill|fen|drove|bank|walk|rise|view|meadows|paddock"
)
ROAD_RE = re.compile(rf"\b([A-Za-z'][A-Za-z' ]*?\s(?:{ROAD_SUFFIXES}))\b", re.I)

# Lincolnshire-ish sanity box
LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = 52.5, 53.7, -1.0, 0.5


def road_candidates(address1):
    """Possible road names hidden in an address like 'grimshaws Coles Lane'."""
    cands = []
    for part in re.split(r"[,;]", address1 or ""):
        part = part.strip()
        if not part:
            continue
        m = ROAD_RE.search(part)
        if m:
            road = m.group(1).strip()
            cands.append(road)
            # Also try dropping a leading house-name word: 'grimshaws Coles Lane' -> 'Coles Lane'
            words = road.split()
            if len(words) > 2:
                cands.append(" ".join(words[1:]))
    seen, out = set(), []
    for c in cands:
        k = c.lower()
        if k not in seen:
            seen.add(k)
            out.append(c)
    return out


def town_matches(client_town, addr):
    if not client_town:
        return True
    hay = " ".join(
        str(addr.get(k) or "").lower()
        for k in ("village", "town", "city", "hamlet", "suburb", "county")
    )
    return client_town.lower() in hay


def in_box(lat, lon):
    return LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX


def main():
    plan = load(PLAN_FILE, {})
    todo = plan.get("manual_review", [])
    applied = load(PASS2_APPLIED_FILE, {})
    remaining = []

    for i, m in enumerate(todo):
        if m["id"] in applied:
            continue
        addr_full = m["address"]
        parts = [p.strip() for p in addr_full.split(",")]
        address1 = parts[0] if parts else ""
        town = parts[1] if len(parts) > 1 else ""

        hit = None
        tried = []
        queries = []
        for road in road_candidates(address1):
            if town:
                queries.append(f"{road}, {town}, Lincolnshire")
            queries.append(f"{road}, Lincolnshire")
        # last resort: just the village/town centre is too coarse - skip
        for q in queries:
            tried.append(q)
            hits = nominatim_search(q)
            time.sleep(1.1)
            for h in hits:
                addr = h.get("address") or {}
                lat, lon = float(h["lat"]), float(h["lon"])
                if not in_box(lat, lon):
                    continue
                if not town_matches(town, addr):
                    continue
                road_name = str(addr.get("road") or "")
                if road_name and any(
                    road_name.lower().find(rc.lower().split()[-2] if len(rc.split()) > 1 else rc.lower()) >= 0
                    for rc in road_candidates(address1)
                ):
                    hit = (lat, lon, addr.get("postcode"), h.get("display_name", "")[:140])
                    break
                # accept village-scoped street hits typed as highway too
                if h.get("class") == "highway" and town and town_matches(town, addr):
                    hit = (lat, lon, addr.get("postcode"), h.get("display_name", "")[:140])
                    break
            if hit:
                break

        if not hit:
            remaining.append(m)
            print(f"  unresolved: {m['acct']} {address1}, {town}")
            continue

        lat, lon, pc, display = hit
        body = {"clientId": m["id"], "latitude": lat, "longitude": lon, "source": "address"}
        pc_final = None
        if pc and UK_PC.match(pc.strip()):
            pc_final = pc.strip().upper()
        else:
            rev = reverse_postcode(lat, lon)
            if rev and rev.get("postcode"):
                pc_final = rev["postcode"]
        if pc_final:
            body["postcode"] = pc_final
        res = api("updateClientLocation", body)
        applied[m["id"]] = {"lat": lat, "lon": lon, "postcode": pc_final, "display": display}
        save(PASS2_APPLIED_FILE, applied)
        print(f"  pinned: {m['acct']} {address1[:28]} -> {display[:60]} pc={pc_final}")
        time.sleep(0.35)

    save(REMAINING_FILE, remaining)
    print(f"\npass2 pinned {len(applied)}; {len(remaining)} remain for browser diligence")


if __name__ == "__main__":
    main()
