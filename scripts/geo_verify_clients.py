"""
Geolocation verification for all active Guvnor clients.

Phases (each idempotent/resumable, state cached in scripts/_geo/):
  fetch    - pull all active clients (with geo fields) via the Agent API
  geocode  - for each client, gather evidence: Nominatim address-level hit
             (house number match where possible) + postcodes.io centroid +
             reverse postcode at the best coordinates
  plan     - decide per-client action: set pin / upgrade pin / fill postcode /
             leave alone / flag for manual browser diligence
  apply    - push planned updates through the Agent API updateClientLocation
             (never touches geoSource 'manual' pins)
  report   - summary + list of clients needing manual review

Usage: python scripts/geo_verify_clients.py <phase>
"""

import json
import math
import os
import re
import sys
import time
from pathlib import Path

import requests

API_BASE = "https://us-central1-roundmanagerapp.cloudfunctions.net/agentApi"
API_KEY = os.environ.get("GUVNOR_AGENT_KEY", "")
if not API_KEY:
    raise SystemExit("Set the GUVNOR_AGENT_KEY environment variable (gvnr_... agent API key).")
HEADERS = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

NOMINATIM = "https://nominatim.openstreetmap.org/search"
NOMINATIM_UA = {"User-Agent": "GuvnorRoundOrderAudit/1.0 (contact: owner of roundmanagerapp)"}
POSTCODES_IO = "https://api.postcodes.io"

OUT = Path(__file__).parent / "_geo"
OUT.mkdir(exist_ok=True)

CLIENTS_FILE = OUT / "clients.json"
EVIDENCE_FILE = OUT / "evidence.json"
PLAN_FILE = OUT / "plan.json"
APPLIED_FILE = OUT / "applied.json"

UK_PC = re.compile(r"^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$", re.I)


def api(action, body=None):
    r = requests.post(f"{API_BASE}/{action}", headers=HEADERS, json=body or {}, timeout=60)
    if r.status_code == 429:
        raise RuntimeError("RATE_LIMITED")
    r.raise_for_status()
    return r.json()


def load(path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def save(path, data):
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")


def dist_m(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def house_number(address1):
    m = re.match(r"^\s*(\d+[a-zA-Z]?)\b", address1 or "")
    return m.group(1).lower() if m else None


# ---------------------------------------------------------------- fetch

def phase_fetch():
    res = api("listClients")
    clients = [c for c in res["clients"] if (c.get("status") or "active") != "ex-client"]
    save(CLIENTS_FILE, clients)
    print(f"saved {len(clients)} active clients to {CLIENTS_FILE}")


# ---------------------------------------------------------------- geocode

def nominatim_search(query):
    params = {
        "q": query,
        "format": "jsonv2",
        "limit": "3",
        "countrycodes": "gb",
        "addressdetails": "1",
    }
    r = requests.get(NOMINATIM, params=params, headers=NOMINATIM_UA, timeout=30)
    if not r.ok:
        return []
    return r.json()


def postcode_lookup(pc):
    r = requests.get(f"{POSTCODES_IO}/postcodes/{requests.utils.quote(pc.strip())}", timeout=30)
    if not r.ok:
        return None
    res = r.json().get("result")
    if res and isinstance(res.get("latitude"), (int, float)):
        return res
    return None


def reverse_postcode(lat, lon):
    r = requests.get(f"{POSTCODES_IO}/postcodes", params={"lon": lon, "lat": lat, "limit": 1, "radius": 1000}, timeout=30)
    if not r.ok:
        return None
    res = r.json().get("result")
    if res:
        return res[0]
    return None


def best_nominatim_hit(client, hits):
    """Score hits; prefer house-number match, then building/house types."""
    want_num = house_number(client.get("address1") or "")
    town = (client.get("town") or "").strip().lower()
    best, best_score = None, -1
    for h in hits:
        addr = h.get("address") or {}
        score = 0
        hit_num = (addr.get("house_number") or "").lower()
        if want_num and hit_num == want_num:
            score += 100
        if h.get("addresstype") in ("house", "building", "residential", "farm", "place"):
            score += 20
        hit_towns = " ".join(
            str(addr.get(k) or "").lower()
            for k in ("village", "town", "city", "hamlet", "suburb")
        )
        if town and town in hit_towns:
            score += 30
        if addr.get("postcode"):
            score += 5
        if score > best_score:
            best, best_score = h, score
    return best, best_score


def phase_geocode():
    clients = load(CLIENTS_FILE, [])
    evidence = load(EVIDENCE_FILE, {})
    todo = [c for c in clients if c["id"] not in evidence and (c.get("geoSource") != "manual")]
    print(f"{len(todo)} clients to gather evidence for ({len(evidence)} cached)")

    for i, c in enumerate(todo):
        ev = {"name": c["name"], "accountNumber": c["accountNumber"]}
        addr1 = (c.get("address1") or "").strip()
        town = (c.get("town") or "").strip()
        pc = (c.get("postcode") or "").strip()

        # 1. postcode centroid when we have a valid postcode
        if UK_PC.match(pc):
            res = postcode_lookup(pc)
            if res:
                ev["pc_centroid"] = {"lat": res["latitude"], "lon": res["longitude"]}

        # 2. Nominatim address search (with, then without, postcode)
        queries = []
        if addr1:
            if pc:
                queries.append(f"{addr1}, {town}, {pc}")
            queries.append(f"{addr1}, {town}, Lincolnshire")
        hit = None
        score = -1
        for q in queries:
            hits = nominatim_search(q)
            time.sleep(1.1)  # Nominatim usage policy
            if hits:
                hit, score = best_nominatim_hit(c, hits)
                if hit is not None:
                    break
        if hit is not None:
            addr = hit.get("address") or {}
            ev["nominatim"] = {
                "lat": float(hit["lat"]),
                "lon": float(hit["lon"]),
                "score": score,
                "addresstype": hit.get("addresstype"),
                "house_number": addr.get("house_number"),
                "postcode": addr.get("postcode"),
                "display": hit.get("display_name", "")[:160],
            }

        # 3. reverse postcode at best coords (nominatim first, else centroid)
        coords = ev.get("nominatim") or ev.get("pc_centroid")
        if coords:
            rev = reverse_postcode(coords["lat"], coords["lon"])
            if rev:
                ev["reverse_pc"] = {"postcode": rev["postcode"], "dist_m": rev.get("distance")}

        evidence[c["id"]] = ev
        if (i + 1) % 10 == 0 or i == len(todo) - 1:
            save(EVIDENCE_FILE, evidence)
            print(f"  {i + 1}/{len(todo)} done (last: {c['accountNumber']} {c['name'][:30]})")

    save(EVIDENCE_FILE, evidence)
    print("evidence complete")


# ---------------------------------------------------------------- plan

def phase_plan():
    clients = load(CLIENTS_FILE, [])
    evidence = load(EVIDENCE_FILE, {})
    plan, manual_review = [], []

    for c in clients:
        if c.get("geoSource") == "manual":
            continue
        ev = evidence.get(c["id"])
        if not ev:
            continue

        cur_lat, cur_lon = c.get("latitude"), c.get("longitude")
        has_pin = isinstance(cur_lat, (int, float))
        pc_current = (c.get("postcode") or "").strip()
        nom = ev.get("nominatim")
        cen = ev.get("pc_centroid")
        rev = (ev.get("reverse_pc") or {}).get("postcode")
        nom_pc = (nom or {}).get("postcode")

        # choose best coordinates + provenance
        new = None  # (lat, lon, source, confidence)
        if nom and nom["score"] >= 100:  # house-number match
            new = (nom["lat"], nom["lon"], "address", "house")
        elif nom and nom["score"] >= 50 and cen and dist_m(nom["lat"], nom["lon"], cen["lat"], cen["lon"]) < 2000:
            new = (nom["lat"], nom["lon"], "address", "town+centroid-agree")
        elif nom and nom["score"] >= 50 and not cen:
            new = (nom["lat"], nom["lon"], "address", "town-match-only")
        elif cen:
            new = (cen["lat"], cen["lon"], "postcode", "centroid")

        # postcode to store: sources must agree, or single strong source
        new_pc = None
        if not UK_PC.match(pc_current):
            cand = None
            if nom_pc and rev and nom_pc.replace(" ", "").upper() == rev.replace(" ", "").upper():
                cand = rev
            elif rev and new and new[3] in ("house", "town+centroid-agree"):
                cand = rev
            if cand and UK_PC.match(cand.strip()):
                new_pc = cand.strip().upper()

        action = None
        if not has_pin:
            if new:
                action = {"why": f"no pin -> {new[3]}", "lat": new[0], "lon": new[1], "source": new[2]}
            else:
                manual_review.append({"id": c["id"], "acct": c["accountNumber"], "name": c["name"],
                                      "address": f"{c.get('address1')}, {c.get('town')}, {pc_current}"})
                continue
        else:
            upgrade = (
                new and new[3] == "house" and c.get("geoSource") == "postcode"
                and dist_m(cur_lat, cur_lon, new[0], new[1]) < 2000
            )
            if upgrade:
                action = {"why": "postcode centroid -> house-level", "lat": new[0], "lon": new[1], "source": "address"}
            elif new_pc:
                # keep existing pin, just fill postcode
                action = {"why": "fill missing postcode", "lat": cur_lat, "lon": cur_lon,
                          "source": c.get("geoSource") or "address"}

        if action:
            if new_pc:
                action["postcode"] = new_pc
            action.update({"id": c["id"], "acct": c["accountNumber"], "name": c["name"]})
            plan.append(action)

    save(PLAN_FILE, {"updates": plan, "manual_review": manual_review})
    kinds = {}
    for p in plan:
        kinds[p["why"]] = kinds.get(p["why"], 0) + 1
    print(f"planned {len(plan)} updates: {json.dumps(kinds, indent=1)}")
    print(f"{len(manual_review)} clients need manual browser diligence")


# ---------------------------------------------------------------- apply

def phase_apply():
    plan = load(PLAN_FILE, {})
    applied = load(APPLIED_FILE, {})
    updates = [u for u in plan.get("updates", []) if u["id"] not in applied]
    print(f"{len(updates)} updates to apply ({len(applied)} already done)")

    for i, u in enumerate(updates):
        body = {"clientId": u["id"], "latitude": u["lat"], "longitude": u["lon"], "source": u["source"]}
        if u.get("postcode"):
            body["postcode"] = u["postcode"]
        try:
            res = api("updateClientLocation", body)
        except RuntimeError:
            print(f"rate limited after {i} updates - rerun 'apply' later to resume")
            break
        applied[u["id"]] = {"why": u["why"], "postcodeUpdated": res.get("postcodeUpdated")}
        if (i + 1) % 20 == 0 or i == len(updates) - 1:
            save(APPLIED_FILE, applied)
            print(f"  {i + 1}/{len(updates)} applied (last: {u['acct']} {u['name'][:30]})")
        time.sleep(0.35)

    save(APPLIED_FILE, applied)
    print(f"total applied: {len(applied)}")


# ---------------------------------------------------------------- report

def phase_report():
    plan = load(PLAN_FILE, {})
    applied = load(APPLIED_FILE, {})
    kinds = {}
    pc_fills = 0
    for aid, a in applied.items():
        kinds[a["why"]] = kinds.get(a["why"], 0) + 1
        if a.get("postcodeUpdated"):
            pc_fills += 1
    print(f"applied: {len(applied)} | postcodes written: {pc_fills}")
    print(json.dumps(kinds, indent=1))
    mr = plan.get("manual_review", [])
    print(f"\nmanual review needed ({len(mr)}):")
    for m in mr:
        print(f"  {m['acct']:>8} {m['name'][:28]:<28} {m['address']}")


if __name__ == "__main__":
    phases = {"fetch": phase_fetch, "geocode": phase_geocode, "plan": phase_plan,
              "apply": phase_apply, "report": phase_report}
    if len(sys.argv) < 2 or sys.argv[1] not in phases:
        print(f"usage: python {sys.argv[0]} <{'|'.join(phases)}>")
        sys.exit(1)
    phases[sys.argv[1]]()
