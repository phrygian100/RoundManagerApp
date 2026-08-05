"""
Pass 4: apply the postcodes found via web diligence (Land Registry /
StreetList / Companies House / business listings) for the clients that
resisted automated geocoding. Every postcode is validated against
postcodes.io (must exist and sit in the expected parish/area) before the
pin is written via the Agent API.

Usage: python scripts/geo_pass4.py
"""

import time

import requests

from geo_verify_clients import OUT, api, load, save

APPLIED_FILE = OUT / "pass4_applied.json"
UA = {"User-Agent": "GuvnorRoundOrderAudit/1.0"}

# acct -> (clientId, postcode, expected place substrings (any match), note)
POSTCODE_FIXES = [
    ("RWC640", "UTNUH1s4uA98RLEGztIa", "NG34 0BP", ["helpringham"], "The Barn, South Drove, Helpringham Fen"),
    ("RWC355", "6UurS3uQKIf09zdef1Wg", "LN4 4AP", ["south kyme", "kyme"], "The Old Rectory, Church Lane, South Kyme"),
    ("RWC594", "Dn2GDLwIOQP5808CHfOF", "NG34 8ZP", ["sleaford", "holdingham"], "25 Bellflower Road, Holdingham"),
    ("RWC568", "sIZvqofY1qyl4Tz9jV16", "NG34 8ZP", ["sleaford", "holdingham"], "5 Bellflower Road, Holdingham (re-pin from Whittle Rd)"),
    ("RWC39", "I3XQMF2gN5MrBV1i4Ex6", "NG34 0BP", ["helpringham"], "Pear Tree Farm, Helpringham Fen"),
    ("RWC644", "a330ftPUaya9B8FI3tFz", "PE11 4FN", ["donington"], "5 Hartfil Street, Donington"),
    ("RWC361", "ZU8laKkJK0aMWZYEPlWI", "PE11 4FQ", ["donington"], "8 Kilby Court, Donington"),
    ("RWC373", "ABbNClV7MqaRmRIFiWuG", "PE11 4FQ", ["donington"], "3 Kilby Court, Donington"),
    ("RWC359", "1juQLniUv7gYgv8KODaG", "PE11 4FQ", ["donington"], "6 Kilby Court, Donington"),
    ("RWC704", "XEHcX9LD1XmVPDa65IE2", "NG34 0UH", ["helpringham"], "2b The Brambles, Helpringham"),
    ("RWC370", "eZj7nwLtzZtLML4b8Pcy", "PE11 4FR", ["donington"], "3 Morris Close, Donington"),
    ("RWC327", "lTrMOOwbnL72MLyP7V8F", "PE11 4FP", ["donington"], "2 Dodds Way, Donington"),
    ("RWC621", "3OkELfVZbnP2HMuRCxHl", "NG34 9XJ", ["ruskington"], "32 Dunsby Close, Flaxwell Fields, Ruskington"),
    ("RWC251", "bw2ThXxNB5QCWLvKTLwb", "PE20 3BU", ["bicker"], "4 Bishop Way, Bicker"),
    ("RWC517", "pxSJ6YUOremMYCRffN0b", "NG34 0TU", ["helpringham"], "2 Asher Close, Helpringham"),
    ("RWC576", "D19VIzGAybFbAenSgLQN", "PE21 7FG", ["boston"], "20 Alderfield Close, Boston"),
    ("RWC626", "eOJ6ffTnnjPsmCYSyrdK", "PE20 1AT", ["kirton"], "37 Sycamore Way, Kirton"),
    ("RWC158", "ibaLihLd9fsTP8t2E0w9", "NG34 9PT", ["howell", "asgarby"], "The Old Rectory, Howell"),
    ("RWC706", "fOF6GqzSvysDywj2hnci", "NG34 8YN", ["sleaford", "holdingham"], "29 Peake Close, Holdingham"),
    ("RWC467", "ZUkwizY9buW9o0AUFDCW", "PE20 3LH", ["swineshead"], "Flat 5 Ferndale House, High Street, Swineshead"),
    ("RWC417", "tzYeColSwwpfDCDHUqJh", "PE20 2EP", ["sutterton"], "3 Reed Point, Sutterton"),
    ("RWC457", "jIbHwHI7IMChL9LDwDk2", "PE20 2NY", ["sutterton"], "23 Chapelgate, Sutterton"),
    ("RWC315", "dPlKEKPTVe0yA0w6cjue", "LN4 4FZ", ["billinghay"], "3 Churchfields Close, Billinghay"),
    ("RWC674", "7rH2sbqsbAHFnyWPRA0T", "LN4 4PZ", ["chapel hill", "tattershall", "billinghay", "kirkby"], "J15, Chapel Hill Caravan Site"),
    ("RWC597", "9MFhF0W2PLm3TWlHKD6Z", "NG34 0BS", ["helpringham"], "Walnut Tree Farm, Helpringham Fen"),
    ("RWC680", "zksLaLddii6VIYHUHhtO", "NG34 9AY", ["ruskington"], "Just Hair, 50 Westcliffe Road, Ruskington"),
    ("RWC609", "gpOQ4sQhLrlG1dAtcE45", "LN4 4AF", ["south kyme", "kyme"], "Fields View, South Kyme (postcode in address)"),
    ("RWC30", "TGgcDewJNcrWU136TpHO", "NG34 9JH", ["heckington"], "Humdinger Foods, Station Road, Heckington"),
    ("RWC413", "iYnafKA1IGn8Arzo6R1i", "NG34 9SN", ["anwick"], "5 Princess Square, Anwick"),
    ("RWC322", "da4ULVRcS5DlpagTKFhR", "PE11 4HU", ["gosberton"], "19 Welby Drive, Gosberton"),
    ("RWC349", "5DeAIT7TVBfl9R64x5D9", "NG34 0RD", ["helpringham"], "Corner Farm, Highgate, Helpringham"),
    ("RWC375", "udF07uqZcs3SxvDPlLn2", "PE20 1BS", ["kirton"], "37 Harrow Drive, Kirton"),
    ("RWC393", "3dVnlzi4pxTCXQYg6pHS", "PE20 3QG", ["heckington"], "Parks Farm House Lodge, East Heckington (Loweth)"),
    ("RWC392", "SQBAQGaAiCzU3PUyqMx4", "PE20 3QG", ["heckington"], "Parks Farm House, East Heckington (re-pin from White House Farm)"),
]

# Exact coordinates known from UPRN data
COORD_FIXES = [
    ("RWC334", "2vtTA4mbufFDsJFRQGrF", 52.935045, -0.037199, "PE20 1AL", "The Beeches, Clatterdyke Road, Frampton"),
]

# Village/street-level fallbacks (approximate, better than no pin)
FALLBACKS = [
    ("RWC399", "JsLBizsXzKvGfwU2h1Zk", "Helpringham, Lincolnshire, UK", ["helpringham"], "Holly Hock House - village-level only"),
    ("RWC389", "j6t3NwrEIFT3Z6hCAiSu", "Greylees, Sleaford, UK", ["greylees", "sleaford"], "Farm House, Greylees - settlement-level only"),
    ("RWC182", "9W4BLGZ2gUYnjQD2R8M1", "Quarrington, Sleaford, UK", ["quarrington", "sleaford"], "Greetham House - suburb-level only"),
    ("RWC245", "3RXdDeHTTDGPDr9E2jxl", "Boston Road, Kirton, Boston, UK", ["kirton"], "Westview, Boston Road - street-level only"),
]


def api_retry(action, body, tries=12):
    for i in range(tries):
        try:
            return api(action, body)
        except RuntimeError as e:
            if "RATE_LIMITED" in str(e) and i < tries - 1:
                print("    rate limited, waiting 90s...")
                time.sleep(90)
            else:
                raise


def pc_lookup(pc):
    r = requests.get(f"https://api.postcodes.io/postcodes/{pc.replace(' ', '')}", headers=UA, timeout=30)
    if r.status_code != 200:
        return None
    return r.json().get("result")


def place_ok(expected, info):
    hay = " ".join(
        str(info.get(k) or "").lower()
        for k in ("parish", "admin_ward", "admin_district", "nuts")
    )
    return any(e in hay for e in expected)


def nominatim(q):
    r = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": q, "format": "jsonv2", "limit": 1, "countrycodes": "gb"},
        headers=UA, timeout=30,
    )
    hits = r.json()
    return (float(hits[0]["lat"]), float(hits[0]["lon"])) if hits else None


def main():
    applied = load(APPLIED_FILE, {})
    failures = []

    for acct, cid, pc, expected, note in POSTCODE_FIXES:
        if cid in applied:
            continue
        info = pc_lookup(pc)
        time.sleep(0.2)
        if not info:
            failures.append((acct, pc, "postcode not found"))
            print(f"  FAIL {acct}: {pc} not found ({note})")
            continue
        if not place_ok(expected, info):
            failures.append((acct, pc, f"place mismatch: {info.get('parish')} / {info.get('admin_ward')}"))
            print(f"  FAIL {acct}: {pc} in {info.get('parish')} / {info.get('admin_ward')}, expected {expected}")
            continue
        body = {
            "clientId": cid,
            "latitude": info["latitude"],
            "longitude": info["longitude"],
            "source": "postcode",
            "postcode": pc,
            "force": True,
        }
        api_retry("updateClientLocation", body)
        applied[cid] = {"acct": acct, "postcode": pc, "note": note}
        save(APPLIED_FILE, applied)
        print(f"  ok {acct}: {pc} ({info.get('parish') or info.get('admin_ward')}) - {note}")
        time.sleep(0.3)

    for acct, cid, lat, lon, pc, note in COORD_FIXES:
        if cid in applied:
            continue
        api_retry("updateClientLocation", {"clientId": cid, "latitude": lat, "longitude": lon, "source": "address", "postcode": pc, "force": True})
        applied[cid] = {"acct": acct, "postcode": pc, "note": note}
        save(APPLIED_FILE, applied)
        print(f"  ok {acct}: exact coords - {note}")
        time.sleep(0.3)

    for acct, cid, query, expected, note in FALLBACKS:
        if cid in applied:
            continue
        hit = nominatim(query)
        time.sleep(1.1)
        if not hit:
            failures.append((acct, query, "no nominatim hit"))
            print(f"  FAIL {acct}: no hit for {query}")
            continue
        api_retry("updateClientLocation", {"clientId": cid, "latitude": hit[0], "longitude": hit[1], "source": "address", "force": True})
        applied[cid] = {"acct": acct, "approx": True, "note": note}
        save(APPLIED_FILE, applied)
        print(f"  ok {acct} (APPROX): {note}")
        time.sleep(0.3)

    save(OUT / "pass4_failures.json", failures)
    print(f"\npass4 applied {len(applied)}; {len(failures)} failures")


if __name__ == "__main__":
    main()
