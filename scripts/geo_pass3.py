"""
Pass 3: Photon (typo-tolerant OSM geocoder) for clients still unpinned,
with strict validation so its fuzzy matching can't drop pins in the wrong
part of Lincolnshire. Remainder goes to _geo/manual_remaining2.json.

Usage: python scripts/geo_pass3.py
"""

import re
import time

import requests

from geo_verify_clients import OUT, UK_PC, api, load, save, reverse_postcode

REMAINING_IN = OUT / "manual_remaining.json"
REMAINING_OUT = OUT / "manual_remaining2.json"
APPLIED_FILE = OUT / "pass3_applied.json"

PHOTON = "https://photon.komoot.io/api/"
UA = {"User-Agent": "GuvnorRoundOrderAudit/1.0"}

# Tight box around the actual round (Sleaford / Boston / Billinghay / Gosberton)
LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = 52.78, 53.20, -0.60, 0.10

# Suburbs/hamlets -> the town Photon actually files them under
TOWN_ALIASES = {
    "holdingham": ["sleaford", "holdingham"],
    "quarrington": ["sleaford", "quarrington"],
    "greylees": ["sleaford", "greylees"],
    "flaxwell fields": ["sleaford"],
    "wyberton": ["boston", "wyberton"],
    "east heckington": ["heckington", "east heckington"],
    "helpringham fen": ["helpringham"],
    "burton pedwardine": ["burton pedwardine", "heckington", "sleaford"],
}


def house_number(address1):
    m = re.match(r"^\s*(\d+[a-zA-Z]?)\b", address1 or "")
    return m.group(1).lower() if m else None


def town_ok(town, props):
    if not town:
        return False
    accept = TOWN_ALIASES.get(town.lower(), [town.lower()])
    hay = " ".join(
        str(props.get(k) or "").lower()
        for k in ("city", "district", "town", "village", "county", "locality", "name", "street")
    )
    return any(a in hay for a in accept)


def photon(q):
    r = requests.get(PHOTON, params={"q": q, "limit": 5, "lang": "en"}, headers=UA, timeout=30)
    if not r.ok:
        return []
    return r.json().get("features", [])


def pick(client_addr1, town, feats):
    """Return (lat, lon, postcode, precision, label) or None."""
    want_num = house_number(client_addr1)
    best = None  # (rank, ...)
    for f in feats:
        p = f.get("properties") or {}
        lon, lat = f["geometry"]["coordinates"]
        if not (LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX):
            continue
        if not town_ok(town, p):
            continue
        osmv = p.get("osm_value") or ""
        label = ", ".join(str(x) for x in [p.get("name"), p.get("housenumber"), p.get("street"), p.get("city"), p.get("postcode")] if x)
        if want_num and (p.get("housenumber") or "").lower() == want_num and osmv == "house":
            rank = 0  # exact house
        elif osmv in ("residential", "unclassified", "tertiary", "square", "living_street", "service", "track"):
            rank = 1  # street-level
        elif p.get("osm_key") in ("place", "building", "shop", "amenity", "leisure", "tourism") :
            rank = 2  # named place in right village
        else:
            continue
        if best is None or rank < best[0]:
            best = (rank, lat, lon, p.get("postcode"), label)
        if best and best[0] == 0:
            break
    if best is None:
        return None
    precision = {0: "house", 1: "street", 2: "place"}[best[0]]
    return best[1], best[2], best[3], precision, best[4]


def main():
    todo = load(REMAINING_IN, [])
    applied = load(APPLIED_FILE, {})
    remaining = []

    for m in todo:
        if m["id"] in applied:
            continue
        parts = [p.strip() for p in m["address"].split(",")]
        addr1 = parts[0] if parts else ""
        town = parts[1] if len(parts) > 1 else ""

        hit = None
        for q in (f"{addr1}, {town}", f"{addr1}, {town}, Lincolnshire"):
            feats = photon(q)
            time.sleep(0.6)
            hit = pick(addr1, town, feats)
            if hit:
                break

        if not hit:
            remaining.append(m)
            print(f"  unresolved: {m['acct']} {addr1}, {town}")
            continue

        lat, lon, pc, precision, label = hit
        body = {"clientId": m["id"], "latitude": lat, "longitude": lon, "source": "address"}
        pc_final = pc.strip().upper() if (pc and UK_PC.match(pc.strip())) else None
        if not pc_final:
            rev = reverse_postcode(lat, lon)
            if rev and rev.get("postcode"):
                pc_final = rev["postcode"]
        if pc_final:
            body["postcode"] = pc_final
        res = api("updateClientLocation", body)
        applied[m["id"]] = {"precision": precision, "label": label, "postcode": pc_final}
        save(APPLIED_FILE, applied)
        print(f"  pinned[{precision}]: {m['acct']} {addr1[:26]} -> {label[:70]} pc={pc_final}")
        time.sleep(0.35)

    save(REMAINING_OUT, remaining)
    print(f"\npass3 pinned {len(applied)}; {len(remaining)} remain for browser diligence")


if __name__ == "__main__":
    main()
