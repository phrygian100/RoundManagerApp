// One-off reconciliation: GoCardless export (docs/fromGocardless.xlsx) vs Guvnor payments.
// Dry run by default; pass --apply to create the missing payments via the Agent API.
//
// Usage: node scripts/_reconcile_gc.cjs <apiKey> [--apply]

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const API_BASE = 'https://us-central1-roundmanagerapp.cloudfunctions.net/agentApi';
const API_KEY = process.argv[2];
const APPLY = process.argv.includes('--apply');
const MATCH_WINDOW_DAYS = 10;
const OUT_DIR = path.join(__dirname, '_reconcile_out');

// Backfill scope: the period when GoCardless payment auto-generation was broken.
// Charges outside this window are reported but never created (Guvnor's payment
// history only starts Aug 2024, and DD generation recovered mid-Jan 2026).
const WINDOW_START = '2025-07-01';
const WINDOW_END = '2026-01-31';

// GC customers with no gocardlessCustomerId link on any client, resolved manually
// by exact name + address match against the client list.
const MANUAL_CUSTOMER_TO_ACCOUNT = {
  CU002JZC3KX3Q1: 'RWC255', // Katie Vaughan, 13 Alder Grove -> Katie, 13 alder grove
  CU001802TJK8AM: 'RWC70',  // Eve Walker, 18 Lockton Close -> Eve Walker, 18 Lockton Close
  CU003RM9GM7Z8K: 'RWC365', // Adam Mallaby, 28 The Paddock -> Adam Mallaby, 28 the paddock
};

if (!API_KEY || !API_KEY.startsWith('gvnr_')) {
  console.error('Usage: node scripts/_reconcile_gc.cjs <apiKey> [--apply]');
  process.exit(1);
}

async function api(action, body) {
  const resp = await fetch(`${API_BASE}/${action}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const json = await resp.json();
  if (!resp.ok || json.ok === false) {
    throw new Error(`${action} failed (${resp.status}): ${json.error || 'unknown'}`);
  }
  return json;
}

function excelDateToYmd(serial) {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return d.toISOString().slice(0, 10);
}

function daysBetween(ymdA, ymdB) {
  return Math.abs(new Date(ymdA + 'T00:00:00Z') - new Date(ymdB + 'T00:00:00Z')) / 86400000;
}

function addMonths(ymd, n) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // --- 1. Load GoCardless export ---
  const wb = XLSX.readFile(path.join(__dirname, '..', 'docs', 'fromGocardless.xlsx'));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  const collected = rows
    .filter((r) => r.status === 'paid_out' || r.status === 'confirmed')
    .map((r) => ({
      gcPaymentId: r.id,
      gcCustomerId: r['links.customer'],
      customerName: `${r['customers.given_name'] || ''} ${r['customers.family_name'] || ''}`.trim(),
      address: r['customers.address_line1'] || '',
      email: r['customers.email'] || '',
      amount: Number(r.amount),
      chargeDate: excelDateToYmd(r.charge_date),
      status: r.status,
    }))
    .sort((a, b) => a.chargeDate.localeCompare(b.chargeDate));

  console.log(`GoCardless collected payments: ${collected.length}, total £${collected.reduce((s, r) => s + r.amount, 0).toFixed(2)}`);

  // --- 2. Load Guvnor clients, map GC customer -> client ---
  const clientsResp = await api('listClients', { includeArchived: true });
  const clients = clientsResp.clients;
  console.log(`Guvnor clients: ${clients.length} (incl. archived)`);
  const byGcCustomer = new Map();
  clients.forEach((c) => {
    if (c.gocardlessCustomerId) byGcCustomer.set(c.gocardlessCustomerId, c);
  });
  for (const [gcId, accountNumber] of Object.entries(MANUAL_CUSTOMER_TO_ACCOUNT)) {
    if (byGcCustomer.has(gcId)) continue;
    const client = clients.find((c) => c.accountNumber === accountNumber);
    if (client) byGcCustomer.set(gcId, client);
  }
  console.log(`Clients mapped to a GC customer: ${byGcCustomer.size}`);

  // --- 3. Load ALL Guvnor payments (3-month chunks, cap-aware) ---
  const allPayments = [];
  let cursor = '2021-01-01';
  const endYmd = '2026-08-31';
  while (cursor < endYmd) {
    const chunkEnd = addMonths(cursor, 1);
    const endArg = chunkEnd < endYmd ? chunkEnd : endYmd;
    const resp = await api('listPayments', { startDate: cursor, endDate: endArg });
    if (resp.truncated) throw new Error(`Chunk ${cursor}..${endArg} truncated (${resp.count}); reduce chunk size`);
    // endDate is inclusive; drop boundary duplicates by id later.
    allPayments.push(...resp.payments);
    cursor = endArg;
  }
  const paymentsById = new Map();
  allPayments.forEach((p) => paymentsById.set(p.id, p));
  const payments = Array.from(paymentsById.values());
  console.log(`Guvnor payments fetched: ${payments.length}`);

  // Group payments by clientId.
  const paymentsByClient = new Map();
  payments.forEach((p) => {
    const arr = paymentsByClient.get(p.clientId) || [];
    arr.push(p);
    paymentsByClient.set(p.clientId, arr);
  });

  // --- 4. Match: one-to-one, same client + same amount + within window ---
  const consumed = new Set();
  const missing = [];
  const unmatchedCustomer = [];
  let matched = 0;

  for (const gc of collected) {
    const client = byGcCustomer.get(gc.gcCustomerId);
    if (!client) {
      unmatchedCustomer.push(gc);
      continue;
    }
    const candidates = (paymentsByClient.get(client.id) || [])
      .filter((p) => !consumed.has(p.id))
      .filter((p) => Math.abs(Number(p.amount) - gc.amount) < 0.005)
      .filter((p) => p.date && daysBetween(p.date.slice(0, 10), gc.chargeDate) <= MATCH_WINDOW_DAYS)
      .sort((a, b) => daysBetween(a.date.slice(0, 10), gc.chargeDate) - daysBetween(b.date.slice(0, 10), gc.chargeDate));

    if (candidates.length > 0) {
      consumed.add(candidates[0].id);
      matched++;
    } else {
      missing.push(Object.assign({}, gc, { clientId: client.id, clientName: client.name, clientAccount: client.accountNumber }));
    }
  }

  console.log(`\nMatched: ${matched}`);
  console.log(`Missing in Guvnor (client known, all time): ${missing.length}, total £${missing.reduce((s, r) => s + r.amount, 0).toFixed(2)}`);
  console.log(`GC customer not linked to any client: ${unmatchedCustomer.length}, total £${unmatchedCustomer.reduce((s, r) => s + r.amount, 0).toFixed(2)}`);

  // Restrict creation to the breakage window.
  const toCreate = missing.filter((m) => m.chargeDate >= WINDOW_START && m.chargeDate <= WINDOW_END);
  console.log(`In backfill window ${WINDOW_START}..${WINDOW_END}: ${toCreate.length}, total £${toCreate.reduce((s, r) => s + r.amount, 0).toFixed(2)}`);

  // Distribution of in-window missing by month
  const byMonth = {};
  toCreate.forEach((m) => { const k = m.chargeDate.slice(0, 7); byMonth[k] = (byMonth[k] || 0) + 1; });
  console.log('\nIn-window missing by month:', JSON.stringify(byMonth, null, 2));

  fs.writeFileSync(path.join(OUT_DIR, 'missing.json'), JSON.stringify(missing, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'to_create.json'), JSON.stringify(toCreate, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'unmatched_customers.json'), JSON.stringify(unmatchedCustomer, null, 2));
  console.log(`\nDetail written to ${OUT_DIR}\\missing.json, to_create.json and unmatched_customers.json`);

  if (!APPLY) {
    console.log('\nDRY RUN ONLY - no payments created. Re-run with --apply to create the in-window payments.');
    return;
  }

  // --- 5. Create the missing payments ---
  console.log(`\nCreating ${toCreate.length} payments...`);
  const results = [];
  let created = 0, failed = 0;
  for (const m of toCreate) {
    try {
      const resp = await api('createPayment', {
        clientId: m.clientId,
        amount: m.amount,
        date: m.chargeDate,
        method: 'direct_debit',
        reference: m.gcPaymentId,
        notes: `Backfilled from GoCardless export (charge ${m.chargeDate}, status ${m.status})`,
      });
      results.push({ gcPaymentId: m.gcPaymentId, paymentId: resp.paymentId, client: m.clientName, amount: m.amount, date: m.chargeDate });
      created++;
    } catch (err) {
      results.push({ gcPaymentId: m.gcPaymentId, error: String(err.message || err), client: m.clientName, amount: m.amount, date: m.chargeDate });
      failed++;
      console.error(`FAILED ${m.gcPaymentId} (${m.clientName} £${m.amount} ${m.chargeDate}): ${err.message}`);
    }
    if ((created + failed) % 50 === 0) console.log(`  progress: ${created + failed}/${toCreate.length}`);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'created.json'), JSON.stringify(results, null, 2));
  console.log(`\nDone. Created: ${created}, failed: ${failed}. Log: ${OUT_DIR}\\created.json`);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
