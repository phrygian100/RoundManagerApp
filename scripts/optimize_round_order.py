"""
Reorganise the entire round order geographically.

Fetches all active clients via the Agent API, backs up the current
clientId -> roundOrderNumber mapping, then computes a travelling-salesman
style open route through every pinned client: start at the pin nearest
Heckington, nearest-neighbour construction, then alternating 2-opt and
Or-opt improvement passes until converged. Unpinned clients go to the end.
Applies the result with the single `setRoundOrder` write action.

No external routing APIs - straight-line haversine distances only.

Usage (set GUVNOR_AGENT_KEY in the environment first):
  python scripts/optimize_round_order.py plan    # fetch, backup, optimise, report - no writes
  python scripts/optimize_round_order.py apply   # push the planned order via setRoundOrder
"""

import datetime
import json
import math
import sys
import time
from pathlib import Path

from geo_verify_clients import OUT, api, load, save

START = (52.981, -0.295)  # Heckington, Lincolnshire
PLAN_FILE = OUT / "round_order_plan.json"


def haversine_km(a, b):
    lat1, lon1 = a
    lat2, lon2 = b
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat = rlat2 - rlat1
    dlon = math.radians(lon2 - lon1)
    h = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(h))


def path_length(order, dist):
    return sum(dist[order[i]][order[i + 1]] for i in range(len(order) - 1))


def nearest_neighbour(start_idx, dist, n):
    unvisited = set(range(n))
    unvisited.remove(start_idx)
    route = [start_idx]
    cur = start_idx
    while unvisited:
        nxt = min(unvisited, key=lambda j: dist[cur][j])
        unvisited.remove(nxt)
        route.append(nxt)
        cur = nxt
    return route


def two_opt_pass(route, dist):
    """One full 2-opt sweep on an open path (start fixed). Returns improvement."""
    improved = 0.0
    n = len(route)
    for i in range(0, n - 2):
        a = route[i]
        d_a_next = dist[a][route[i + 1]]
        for j in range(i + 2, n):
            b = route[j]
            # Reversing route[i+1..j]: replaces edges (a, i+1) and (j, j+1) with
            # (a, j) and (i+1, j+1). For the open path the trailing edge only
            # exists when j < n-1.
            before = d_a_next + (dist[b][route[j + 1]] if j + 1 < n else 0.0)
            after = dist[a][b] + (dist[route[i + 1]][route[j + 1]] if j + 1 < n else 0.0)
            if after + 1e-10 < before:
                route[i + 1:j + 1] = reversed(route[i + 1:j + 1])
                improved += before - after
                d_a_next = dist[a][route[i + 1]]
    return improved


def or_opt_pass(route, dist):
    """Relocate segments of length 1-3 to a better spot (start fixed)."""
    improved = 0.0
    n = len(route)
    for seg_len in (1, 2, 3):
        i = 1
        while i + seg_len <= n:
            prev_node = route[i - 1]
            seg = route[i:i + seg_len]
            after_idx = i + seg_len
            gap_after = dist[seg[-1]][route[after_idx]] if after_idx < n else 0.0
            removal_gain = dist[prev_node][seg[0]] + gap_after - (
                dist[prev_node][route[after_idx]] if after_idx < n else 0.0
            )
            if removal_gain <= 1e-10:
                i += 1
                continue
            rest = route[:i] + route[i + seg_len:]
            best_delta, best_pos = 0.0, None
            for k in range(0, len(rest)):
                p = rest[k]
                q = rest[k + 1] if k + 1 < len(rest) else None
                base = dist[p][q] if q is not None else 0.0
                add = dist[p][seg[0]] + (dist[seg[-1]][q] if q is not None else 0.0)
                delta = removal_gain - (add - base)
                if delta > best_delta + 1e-10:
                    best_delta, best_pos = delta, k + 1
            if best_pos is not None:
                new_route = rest[:best_pos] + seg + rest[best_pos:]
                route[:] = new_route
                improved += best_delta
                n = len(route)
            else:
                i += 1
    return improved


def optimise(points):
    n = len(points)
    dist = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            d = haversine_km(points[i], points[j])
            dist[i][j] = d
            dist[j][i] = d

    start_idx = min(range(n), key=lambda i: haversine_km(points[i], START))
    route = nearest_neighbour(start_idx, dist, n)
    print(f"nearest-neighbour route: {path_length(route, dist):.1f} km")

    sweep = 0
    while True:
        sweep += 1
        gain = two_opt_pass(route, dist) + or_opt_pass(route, dist)
        print(f"  sweep {sweep}: -{gain:.2f} km -> {path_length(route, dist):.1f} km")
        if gain < 0.01:
            break
    return route, dist, start_idx


def cmd_plan():
    clients = api("listClients").get("clients", [])
    active = [c for c in clients if (c.get("status") or "active") != "ex-client"]
    print(f"{len(active)} active clients fetched")

    stamp = datetime.date.today().isoformat()
    backup = {c["id"]: c.get("roundOrderNumber") for c in active}
    save(OUT / f"round_order_backup_{stamp}.json", backup)
    print(f"backed up current order for {len(backup)} clients")

    pinned = [c for c in active if isinstance(c.get("latitude"), (int, float)) and isinstance(c.get("longitude"), (int, float))]
    pinned_ids = {c["id"] for c in pinned}
    unpinned = [c for c in active if c["id"] not in pinned_ids]
    points = [(c["latitude"], c["longitude"]) for c in pinned]

    # Old route length: pinned clients walked in current roundOrderNumber order.
    by_current = sorted(
        [c for c in pinned if isinstance(c.get("roundOrderNumber"), (int, float))],
        key=lambda c: c["roundOrderNumber"],
    )
    old_km = sum(
        haversine_km(
            (by_current[i]["latitude"], by_current[i]["longitude"]),
            (by_current[i + 1]["latitude"], by_current[i + 1]["longitude"]),
        )
        for i in range(len(by_current) - 1)
    )

    route, dist, start_idx = optimise(points)
    new_km = path_length(route, dist)

    ordered = [pinned[i] for i in route] + unpinned
    save(PLAN_FILE, {
        "computedAt": datetime.datetime.now().isoformat(),
        "oldRouteKm": round(old_km, 1),
        "newRouteKm": round(new_km, 1),
        "start": {"acct": pinned[start_idx].get("accountNumber"), "name": pinned[start_idx].get("name"),
                  "address": pinned[start_idx].get("address1"), "town": pinned[start_idx].get("town")},
        "unpinnedAtEnd": [{"acct": c.get("accountNumber"), "address": c.get("address1")} for c in unpinned],
        "order": [c["id"] for c in ordered],
        "preview": [
            {"pos": i + 1, "acct": c.get("accountNumber"), "address": c.get("address1"), "town": c.get("town")}
            for i, c in enumerate(ordered)
        ],
    })
    print(f"\nOLD route (current order): {old_km:.1f} km over {len(by_current)} pinned clients")
    print(f"NEW route (optimised):     {new_km:.1f} km over {len(route)} pinned clients")
    print(f"start: {pinned[start_idx].get('accountNumber')} {pinned[start_idx].get('address1')}, {pinned[start_idx].get('town')}")
    print(f"{len(unpinned)} unpinned client(s) appended at the end")
    print(f"plan saved to {PLAN_FILE}")


def cmd_apply():
    plan = load(PLAN_FILE, None)
    if not plan:
        raise SystemExit("No plan found - run the plan phase first.")
    order = plan["order"]
    for attempt in range(12):
        try:
            res = api("setRoundOrder", {"order": order})
            print(json.dumps(res, indent=1))
            return
        except RuntimeError as e:
            if "RATE_LIMITED" in str(e) and attempt < 11:
                print("rate limited, waiting 120s...")
                time.sleep(120)
            else:
                raise


if __name__ == "__main__":
    phase = sys.argv[1] if len(sys.argv) > 1 else "plan"
    {"plan": cmd_plan, "apply": cmd_apply}[phase]()
