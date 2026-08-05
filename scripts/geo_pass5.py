"""
Pass 5: clients that already have a pin but no postcode. Fill the postcode
from the nearest postcodes.io unit within 1km of the existing pin (pin and
geoSource unchanged). Skips clients whose nearest postcode is implausibly
far or in a different town.

Usage: python scripts/geo_pass5.py
"""

import time

import requests

from geo_verify_clients import OUT, api, load, save

APPLIED_FILE = OUT / "pass5_applied.json"
UA = {"User-Agent": "GuvnorRoundOrderAudit/1.0"}


def reverse(lat, lon):
    r = requests.get(
        "https://api.postcodes.io/postcodes",
        params={"lat": lat, "lon": lon, "radius": 1000, "limit": 1},
        headers=UA, timeout=30,
    )
    if r.status_code != 200:
        return None
    res = r.json().get("result") or []
    return res[0] if res else None


def main():
    clients = load(OUT / "clients.json", [])
    applied = load(APPLIED_FILE, {})
    skipped = []

    todo = [
        c for c in clients
        if c.get("latitude") and c.get("longitude") and not c.get("postcode")
        and (c.get("geoSource") or "") != "manual"
    ]
    print(f"{len(todo)} pinned clients missing postcode")

    for c in todo:
        if c["id"] in applied:
            continue
        hit = reverse(c["latitude"], c["longitude"])
        time.sleep(0.2)
        if not hit:
            skipped.append((c.get("accountNumber"), "no postcode within 1km"))
            print(f"  skip {c.get('accountNumber')}: nothing within 1km")
            continue
        pc = hit["postcode"]
        town = (c.get("town") or "").strip().lower()
        hay = " ".join(str(hit.get(k) or "").lower() for k in ("parish", "admin_ward", "admin_district"))
        # Soft town check: only warn-skip when the town clearly conflicts
        aliases = {"holdingham": "sleaford", "quarrington": "sleaford", "greylees": "sleaford", "wyberton": "boston"}
        expect = aliases.get(town, town)
        if town and expect not in hay and town not in hay and float(hit.get("distance") or 0) > 400:
            skipped.append((c.get("accountNumber"), f"{pc} in {hit.get('parish')} vs town {c.get('town')}"))
            print(f"  skip {c.get('accountNumber')}: {pc} ({hit.get('parish')}) vs town '{c.get('town')}', {hit.get('distance'):.0f}m away")
            continue
        api("updateClientLocation", {
            "clientId": c["id"],
            "latitude": c["latitude"],
            "longitude": c["longitude"],
            "source": c.get("geoSource") or "address",
            "postcode": pc,
        })
        applied[c["id"]] = {"acct": c.get("accountNumber"), "postcode": pc, "distance_m": hit.get("distance")}
        save(APPLIED_FILE, applied)
        print(f"  ok {c.get('accountNumber')}: {pc} ({float(hit.get('distance') or 0):.0f}m) - {c.get('address1')}")
        time.sleep(0.3)

    save(OUT / "pass5_skipped.json", skipped)
    print(f"\npass5 filled {len(applied)}; skipped {len(skipped)}")


if __name__ == "__main__":
    main()
