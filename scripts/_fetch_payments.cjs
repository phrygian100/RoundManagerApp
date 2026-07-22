// Fetch all Guvnor payments via the Agent API and cache to disk for analysis.
// Usage: node scripts/_fetch_payments.cjs <apiKey>

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://us-central1-roundmanagerapp.cloudfunctions.net/agentApi';
const API_KEY = process.argv[2];
const OUT_DIR = path.join(__dirname, '_reconcile_out');

async function api(action, body) {
  const resp = await fetch(`${API_BASE}/${action}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const json = await resp.json();
  if (!resp.ok || json.ok === false) throw new Error(`${action} failed (${resp.status}): ${json.error || 'unknown'}`);
  return json;
}

function addMonths(ymd, n) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const byId = new Map();
  let cursor = '2020-01-01';
  while (cursor < '2026-08-31') {
    const end = addMonths(cursor, 1);
    const resp = await api('listPayments', { startDate: cursor, endDate: end });
    if (resp.truncated) throw new Error(`Chunk ${cursor} truncated`);
    resp.payments.forEach((p) => byId.set(p.id, p));
    cursor = end;
  }
  const all = Array.from(byId.values());
  fs.writeFileSync(path.join(OUT_DIR, 'guvnor_payments.json'), JSON.stringify(all));
  console.log(`Cached ${all.length} payments to _reconcile_out/guvnor_payments.json`);

  const clientsResp = await api('listClients', { includeArchived: true });
  fs.writeFileSync(path.join(OUT_DIR, 'guvnor_clients.json'), JSON.stringify(clientsResp.clients));
  console.log(`Cached ${clientsResp.clients.length} clients to _reconcile_out/guvnor_clients.json`);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
