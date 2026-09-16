/**
 * Agent Admin API ("Governor" API).
 *
 * HTTP surface that lets an external AI agent (or any scripted client)
 * administer a single account's business data using a per-account API key.
 *
 * Auth model:
 * - Keys are minted via the `createAgentApiKey` callable (account owners only).
 * - Only a SHA-256 hash of the key is stored (collection `agentApiKeys`).
 * - Requests present the plaintext key as `Authorization: Bearer <key>`.
 * - Every query is scoped to the key's accountId (mirrors app-side
 *   getDataOwnerId(): jobs/payments use ownerId, clients merge ownerId+accountId).
 *
 * All write/comms actions are appended to the `agentAuditLog` collection.
 *
 * Exported as a builder so index.js can inject shared deps (admin, Resend,
 * RESEND_KEY secret) without duplicate defineSecret() calls or circular requires.
 */

const crypto = require('crypto');

const KEY_PREFIX = 'gvnr_';
const MAX_ACTIVE_KEYS_PER_ACCOUNT = 5;
const MAX_LIST_RESULTS = 500;
const MAX_SEARCH_RESULTS = 25;
const MAX_GET_CLIENTS = 40;
const MAX_BATCH_RESCHEDULE = 200;
const MAX_BATCH_CREATE = 50;
const MAX_BATCH_NOTES = 100;
const GETALL_CHUNK = 100;
const UPCOMING_JOB_STATUSES = ['pending', 'scheduled', 'in_progress'];

const VALID_PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'cheque', 'other', 'auto_balance', 'direct_debit'];
// Pin provenance values understood by the app (types/client.ts geoSource).
const VALID_GEO_SOURCES = ['postcode', 'address', 'manual'];
const UK_POSTCODE_REGEX = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/;
// Job statuses the agent may set: complete a job, or revert it to pending.
const AGENT_SETTABLE_JOB_STATUSES = ['completed', 'pending'];

module.exports = function buildAgentApi(deps) {
  const { admin, onRequest, onCall, HttpsError, Resend, RESEND_KEY } = deps;

  // ---------------------------------------------------------------------------
  // Generic helpers
  // ---------------------------------------------------------------------------

  function sha256Hex(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
    if (Array.isArray(xff) && xff.length) return String(xff[0]).split(',')[0].trim();
    return req.ip || 'unknown';
  }

  // Firestore-backed rate limiting (same scheme as portalApi in index.js).
  async function enforceRateLimit(db, key, limit, windowMs) {
    const ref = db.collection('rateLimits').doc(key);
    const now = Date.now();
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? (snap.data() || {}) : {};
      const resetAt = typeof data.resetAt === 'number' ? data.resetAt : 0;
      const count = typeof data.count === 'number' ? data.count : 0;

      if (now > resetAt) {
        tx.set(ref, { count: 1, resetAt: now + windowMs, updatedAt: new Date().toISOString() }, { merge: true });
        return;
      }
      if (count >= limit) {
        throw new HttpsError('resource-exhausted', 'Too many requests. Please try again later.');
      }
      tx.set(ref, { count: count + 1, updatedAt: new Date().toISOString() }, { merge: true });
    });
  }

  function isYmd(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function ymd(date) {
    return date.toISOString().slice(0, 10);
  }

  // Monday of the week containing the given yyyy-MM-dd date (weeks start Monday).
  function mondayOf(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d;
  }

  function addDaysUtc(date, days) {
    const d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }

  function badRequest(message) {
    return new HttpsError('invalid-argument', message);
  }

  // ---------------------------------------------------------------------------
  // Key management callables
  // ---------------------------------------------------------------------------

  function resolveOwnerAccountId(auth) {
    if (!auth) {
      throw new HttpsError('unauthenticated', 'You must be logged in.');
    }
    const tokenAccountId = auth.token && auth.token.accountId;
    const accountId = tokenAccountId || auth.uid;
    // Team members (accountId differs from uid) must hold the owner claim.
    if (accountId !== auth.uid && auth.token.isOwner !== true) {
      throw new HttpsError('permission-denied', 'Only account owners can manage agent API keys.');
    }
    return accountId;
  }

  const createAgentApiKey = onCall(async (request) => {
    const accountId = resolveOwnerAccountId(request.auth);
    const db = admin.firestore();
    const rawLabel = request.data && request.data.label;
    const label = typeof rawLabel === 'string' ? rawLabel.slice(0, 100) : '';

    const existingSnap = await db.collection('agentApiKeys').where('accountId', '==', accountId).get();
    const activeCount = existingSnap.docs.filter((d) => !(d.data() || {}).revokedAt).length;
    if (activeCount >= MAX_ACTIVE_KEYS_PER_ACCOUNT) {
      throw new HttpsError(
        'resource-exhausted',
        `Limit of ${MAX_ACTIVE_KEYS_PER_ACCOUNT} active agent keys reached. Revoke one first.`
      );
    }

    const key = KEY_PREFIX + crypto.randomBytes(24).toString('hex');
    const now = new Date().toISOString();
    const ref = await db.collection('agentApiKeys').add({
      keyHash: sha256Hex(key),
      accountId,
      createdByUid: request.auth.uid,
      label,
      createdAt: now,
      lastUsedAt: null,
      revokedAt: null,
    });

    // Plaintext key is returned exactly once and never stored.
    return { keyId: ref.id, key };
  });

  const listAgentApiKeys = onCall(async (request) => {
    const accountId = resolveOwnerAccountId(request.auth);
    const db = admin.firestore();
    const snap = await db.collection('agentApiKeys').where('accountId', '==', accountId).get();
    const keys = snap.docs
      .map((docSnap) => {
        const d = docSnap.data() || {};
        return {
          keyId: docSnap.id,
          label: d.label || '',
          createdAt: d.createdAt || null,
          lastUsedAt: d.lastUsedAt || null,
          revokedAt: d.revokedAt || null,
        };
      })
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return { keys };
  });

  const revokeAgentApiKey = onCall(async (request) => {
    const accountId = resolveOwnerAccountId(request.auth);
    const db = admin.firestore();
    const keyId = request.data && request.data.keyId;
    const now = new Date().toISOString();

    if (keyId) {
      const ref = db.collection('agentApiKeys').doc(String(keyId));
      const snap = await ref.get();
      if (!snap.exists || (snap.data() || {}).accountId !== accountId) {
        throw new HttpsError('not-found', 'Key not found.');
      }
      await ref.update({ revokedAt: now });
      return { revoked: 1 };
    }

    // No keyId provided: revoke every active key for this account.
    const snap = await db.collection('agentApiKeys').where('accountId', '==', accountId).get();
    let revoked = 0;
    for (const docSnap of snap.docs) {
      if (!(docSnap.data() || {}).revokedAt) {
        await docSnap.ref.update({ revokedAt: now });
        revoked++;
      }
    }
    return { revoked };
  });

  // ---------------------------------------------------------------------------
  // Data access helpers (scoped to one account)
  // ---------------------------------------------------------------------------

  // Clients: merge ownerId + accountId queries (matches app-side behaviour for
  // legacy/team-created docs — see services/jobService.ts).
  async function loadClientsForAccount(db, accountId) {
    const [byOwner, byAccount] = await Promise.all([
      db.collection('clients').where('ownerId', '==', accountId).get(),
      db.collection('clients').where('accountId', '==', accountId).get(),
    ]);
    const map = new Map();
    byOwner.docs.forEach((d) => map.set(d.id, Object.assign({ id: d.id }, d.data())));
    byAccount.docs.forEach((d) => {
      if (!map.has(d.id)) map.set(d.id, Object.assign({ id: d.id }, d.data()));
    });
    return Array.from(map.values());
  }

  function clientBelongsToAccount(clientData, accountId) {
    return clientData.ownerId === accountId || clientData.accountId === accountId;
  }

  async function getOwnedClient(db, accountId, clientId) {
    if (!clientId || typeof clientId !== 'string') {
      throw badRequest('clientId is required.');
    }
    const snap = await db.collection('clients').doc(clientId).get();
    if (!snap.exists || !clientBelongsToAccount(snap.data() || {}, accountId)) {
      throw new HttpsError('not-found', 'Client not found.');
    }
    return Object.assign({ id: snap.id }, snap.data());
  }

  async function loadJobsForClient(db, accountId, clientId) {
    const snap = await db.collection('jobs')
      .where('ownerId', '==', accountId)
      .where('clientId', '==', clientId)
      .get();
    return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  }

  // Firestore getAll is capped at a few hundred refs; chunk to stay safe.
  async function getAllDocs(db, refs) {
    const out = [];
    for (let i = 0; i < refs.length; i += GETALL_CHUNK) {
      const chunk = await db.getAll(...refs.slice(i, i + GETALL_CHUNK));
      out.push(...chunk);
    }
    return out;
  }

  async function loadClientsByIds(db, ids) {
    const unique = Array.from(new Set((ids || []).filter(Boolean)));
    const map = new Map();
    if (unique.length === 0) return map;
    const snaps = await getAllDocs(db, unique.map((id) => db.collection('clients').doc(id)));
    snaps.forEach((s) => {
      if (s.exists) map.set(s.id, Object.assign({ id: s.id }, s.data()));
    });
    return map;
  }

  function nextUpcomingFromJobs(jobs) {
    const upcoming = (jobs || [])
      .filter((j) => UPCOMING_JOB_STATUSES.indexOf(j.status) !== -1)
      .sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));
    return upcoming.length ? upcoming[0] : null;
  }

  function clientJoinFields(c) {
    if (!c) {
      return {
        clientName: '',
        address: '',
        mobileNumber: '',
        email: '',
        frequency: null,
        runsheetNotes: '',
      };
    }
    return {
      clientName: c.name || '',
      address: [c.address1 || c.address, c.town, c.postcode].filter(Boolean).join(', '),
      mobileNumber: c.mobileNumber || '',
      email: c.email || '',
      frequency: c.frequency !== undefined && c.frequency !== null ? c.frequency : null,
      runsheetNotes: c.runsheetNotes || '',
    };
  }

  async function loadPaymentsForClient(db, accountId, clientId) {
    const snap = await db.collection('payments')
      .where('ownerId', '==', accountId)
      .where('clientId', '==', clientId)
      .get();
    return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  }

  // Balance formula mirrors app/client-balance.tsx:
  // balance = totalPaid - totalCompletedJobs + startingBalance (negative = client owes).
  function computeFinancials(client, jobs, payments) {
    const completedJobs = jobs.filter((j) => j.status === 'completed');
    const totalBilled = completedJobs.reduce((sum, j) => sum + (Number(j.price) || 0), 0);
    const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const startingBalance = Number(client.startingBalance) || 0;
    return {
      totalBilled,
      totalPaid,
      startingBalance,
      balance: totalPaid - totalBilled + startingBalance,
    };
  }

  function clientSummary(c) {
    return {
      id: c.id,
      name: c.name || '',
      accountNumber: c.accountNumber || '',
      address1: c.address1 || c.address || '',
      town: c.town || '',
      postcode: c.postcode || '',
      email: c.email || '',
      mobileNumber: c.mobileNumber || '',
      status: c.status || 'active',
      roundOrderNumber: typeof c.roundOrderNumber === 'number' ? c.roundOrderNumber : null,
      quote: typeof c.quote === 'number' ? c.quote : null,
      startingBalance: Number(c.startingBalance) || 0,
      frequency: c.frequency !== undefined && c.frequency !== null ? c.frequency : null,
    };
  }

  function jobSummary(j) {
    return {
      id: j.id,
      clientId: j.clientId || '',
      serviceId: j.serviceId || '',
      scheduledTime: j.scheduledTime || '',
      status: j.status || '',
      price: Number(j.price) || 0,
      paymentStatus: j.paymentStatus || '',
      completedAt: j.completedAt || null,
      jobNote: j.jobNote || null,
      isDeferred: j.isDeferred === true,
      originalScheduledTime: j.originalScheduledTime || null,
    };
  }

  function jobWithClient(j, client) {
    return Object.assign(jobSummary(j), clientJoinFields(client));
  }

  function paymentSummary(p) {
    return {
      id: p.id,
      clientId: p.clientId || '',
      jobId: p.jobId || null,
      amount: Number(p.amount) || 0,
      date: p.date || '',
      method: p.method || '',
      reference: p.reference || null,
      notes: p.notes || null,
    };
  }

  function sortByDateDesc(items, getDate) {
    return items.slice().sort((a, b) => {
      const ta = new Date(getDate(a) || 0).getTime();
      const tb = new Date(getDate(b) || 0).getTime();
      return tb - ta;
    });
  }

  async function writeAudit(db, entry) {
    try {
      await db.collection('agentAuditLog').add(Object.assign({ createdAt: new Date().toISOString() }, entry));
    } catch (err) {
      console.error('agentApi: failed to write audit log entry (non-fatal)', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Read actions
  // ---------------------------------------------------------------------------

  async function actionGetAccountSummary(db, accountId) {
    const clients = await loadClientsForAccount(db, accountId);
    const activeClients = clients.filter((c) => (c.status || '') !== 'ex-client');

    const [jobsSnap, paymentsSnap] = await Promise.all([
      db.collection('jobs').where('ownerId', '==', accountId).where('status', '==', 'completed').get(),
      db.collection('payments').where('ownerId', '==', accountId).get(),
    ]);

    const billedByClient = new Map();
    let totalBilled = 0;
    jobsSnap.docs.forEach((d) => {
      const j = d.data() || {};
      const price = Number(j.price) || 0;
      totalBilled += price;
      if (j.clientId) billedByClient.set(j.clientId, (billedByClient.get(j.clientId) || 0) + price);
    });

    const paidByClient = new Map();
    let totalPaid = 0;
    paymentsSnap.docs.forEach((d) => {
      const p = d.data() || {};
      const amount = Number(p.amount) || 0;
      totalPaid += amount;
      if (p.clientId) paidByClient.set(p.clientId, (paidByClient.get(p.clientId) || 0) + amount);
    });

    const outstanding = [];
    clients.forEach((c) => {
      const balance = (paidByClient.get(c.id) || 0) - (billedByClient.get(c.id) || 0) + (Number(c.startingBalance) || 0);
      if (balance < 0) {
        outstanding.push(Object.assign(clientSummary(c), { balance: Number(balance.toFixed(2)) }));
      }
    });
    outstanding.sort((a, b) => a.balance - b.balance); // most owed first

    return {
      ok: true,
      summary: {
        activeClients: activeClients.length,
        archivedClients: clients.length - activeClients.length,
        completedJobsCount: jobsSnap.size,
        paymentsCount: paymentsSnap.size,
        totalBilled: Number(totalBilled.toFixed(2)),
        totalPaid: Number(totalPaid.toFixed(2)),
        outstandingClientCount: outstanding.length,
      },
      outstandingClients: outstanding.slice(0, 100),
    };
  }

  async function actionListClients(db, accountId, body) {
    const includeArchived = !!(body && body.includeArchived);
    const clients = await loadClientsForAccount(db, accountId);
    const filtered = includeArchived ? clients : clients.filter((c) => (c.status || '') !== 'ex-client');
    const list = filtered.map((c) => Object.assign(clientSummary(c), {
      gocardlessEnabled: !!c.gocardlessEnabled,
      gocardlessCustomerId: c.gocardlessCustomerId || null,
      dateAdded: c.dateAdded || null,
      latitude: typeof c.latitude === 'number' ? c.latitude : null,
      longitude: typeof c.longitude === 'number' ? c.longitude : null,
      geoSource: c.geoSource || null,
      geoUpdatedAt: c.geoUpdatedAt || null,
    }));
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return { ok: true, count: list.length, clients: list };
  }

  async function actionSearchClients(db, accountId, body) {
    const q = String((body && body.query) || '').trim().toLowerCase();
    if (!q) throw badRequest('query is required (name, address, town, postcode or account number).');

    const clients = await loadClientsForAccount(db, accountId);
    const matches = clients.filter((c) => {
      const haystack = [c.name, c.address1, c.address, c.town, c.postcode, c.accountNumber]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    const sliced = matches.slice(0, MAX_SEARCH_RESULTS);
    const clientsWithNext = await Promise.all(sliced.map(async (c) => {
      const jobs = await loadJobsForClient(db, accountId, c.id);
      const next = nextUpcomingFromJobs(jobs);
      return Object.assign(clientSummary(c), {
        runsheetNotes: c.runsheetNotes || '',
        nextJob: next ? jobSummary(next) : null,
      });
    }));

    return {
      ok: true,
      count: matches.length,
      truncated: matches.length > MAX_SEARCH_RESULTS,
      clients: clientsWithNext,
    };
  }

  async function actionGetClient(db, accountId, body) {
    const client = await getOwnedClient(db, accountId, body && body.clientId);
    const [jobs, payments] = await Promise.all([
      loadJobsForClient(db, accountId, client.id),
      loadPaymentsForClient(db, accountId, client.id),
    ]);

    const financials = computeFinancials(client, jobs, payments);
    const completedJobs = sortByDateDesc(jobs.filter((j) => j.status === 'completed'), (j) => j.scheduledTime);
    const next = nextUpcomingFromJobs(jobs);
    const recentPayments = sortByDateDesc(payments, (p) => p.date);

    return {
      ok: true,
      client: Object.assign(clientSummary(client), {
        runsheetNotes: client.runsheetNotes || '',
        gocardlessEnabled: !!client.gocardlessEnabled,
      }),
      financials: {
        balance: Number(financials.balance.toFixed(2)),
        totalBilled: Number(financials.totalBilled.toFixed(2)),
        totalPaid: Number(financials.totalPaid.toFixed(2)),
        startingBalance: financials.startingBalance,
      },
      nextJob: next ? jobSummary(next) : null,
      recentCompletedJobs: completedJobs.slice(0, 10).map(jobSummary),
      recentPayments: recentPayments.slice(0, 10).map(paymentSummary),
    };
  }

  /**
   * Lightweight batch client lookup — same core fields + nextJob as a
   * search hit, without pulling every payment / completed job. Replaces
   * N sequential getClient round-trips when you already have IDs.
   */
  async function actionGetClients(db, accountId, body) {
    const ids = body && body.clientIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw badRequest('clientIds must be a non-empty array of client ids.');
    }
    if (ids.length > MAX_GET_CLIENTS) {
      throw badRequest(`Maximum ${MAX_GET_CLIENTS} clientIds per call.`);
    }
    const unique = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id)));
    const map = await loadClientsByIds(db, unique);
    const results = await Promise.all(unique.map(async (id) => {
      const client = map.get(id);
      if (!client || !clientBelongsToAccount(client, accountId)) {
        return { ok: false, clientId: id, error: 'not found' };
      }
      const jobs = await loadJobsForClient(db, accountId, id);
      const next = nextUpcomingFromJobs(jobs);
      return {
        ok: true,
        clientId: id,
        client: Object.assign(clientSummary(client), { runsheetNotes: client.runsheetNotes || '' }),
        nextJob: next ? jobSummary(next) : null,
      };
    }));
    return { ok: true, count: results.length, clients: results };
  }

  async function actionListJobs(db, accountId, body) {
    const clientId = body && body.clientId;
    const startDate = body && body.startDate;
    const endDate = body && body.endDate;
    const status = body && body.status;

    if (!clientId && !(isYmd(startDate) && isYmd(endDate))) {
      throw badRequest('Provide clientId, or startDate and endDate (yyyy-MM-dd), to bound the query.');
    }
    if (startDate && !isYmd(startDate)) throw badRequest('startDate must be yyyy-MM-dd.');
    if (endDate && !isYmd(endDate)) throw badRequest('endDate must be yyyy-MM-dd.');

    let jobs;
    if (clientId) {
      await getOwnedClient(db, accountId, clientId);
      jobs = await loadJobsForClient(db, accountId, clientId);
      if (startDate) jobs = jobs.filter((j) => (j.scheduledTime || '') >= startDate + 'T00:00:00');
      if (endDate) jobs = jobs.filter((j) => (j.scheduledTime || '') < endDate + 'T23:59:59');
    } else {
      // Server-side range on (ownerId, scheduledTime) — composite index exists.
      const snap = await db.collection('jobs')
        .where('ownerId', '==', accountId)
        .where('scheduledTime', '>=', startDate + 'T00:00:00')
        .where('scheduledTime', '<', endDate + 'T23:59:59')
        .get();
      jobs = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    }

    if (status) jobs = jobs.filter((j) => j.status === status);
    jobs.sort((a, b) => new Date(a.scheduledTime || 0).getTime() - new Date(b.scheduledTime || 0).getTime());

    const sliced = jobs.slice(0, MAX_LIST_RESULTS);
    const clientMap = await loadClientsByIds(db, sliced.map((j) => j.clientId));

    return {
      ok: true,
      count: jobs.length,
      truncated: jobs.length > MAX_LIST_RESULTS,
      jobs: sliced.map((j) => jobWithClient(j, clientMap.get(j.clientId))),
    };
  }

  async function actionListPayments(db, accountId, body) {
    const clientId = body && body.clientId;
    const startDate = body && body.startDate;
    const endDate = body && body.endDate;

    if (!clientId && !(isYmd(startDate) && isYmd(endDate))) {
      throw badRequest('Provide clientId, or startDate and endDate (yyyy-MM-dd), to bound the query.');
    }
    if (startDate && !isYmd(startDate)) throw badRequest('startDate must be yyyy-MM-dd.');
    if (endDate && !isYmd(endDate)) throw badRequest('endDate must be yyyy-MM-dd.');

    let payments;
    if (clientId) {
      await getOwnedClient(db, accountId, clientId);
      payments = await loadPaymentsForClient(db, accountId, clientId);
    } else {
      try {
        const snap = await db.collection('payments')
          .where('ownerId', '==', accountId)
          .where('date', '>=', startDate)
          .where('date', '<=', endDate)
          .get();
        payments = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      } catch (_err) {
        // Missing composite index fallback: fetch by owner, filter in memory.
        const snap = await db.collection('payments').where('ownerId', '==', accountId).get();
        payments = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      }
    }
    if (startDate) payments = payments.filter((p) => (p.date || '') >= startDate);
    if (endDate) payments = payments.filter((p) => (p.date || '') <= endDate + '\uf8ff');

    payments = sortByDateDesc(payments, (p) => p.date);

    return {
      ok: true,
      count: payments.length,
      truncated: payments.length > MAX_LIST_RESULTS,
      payments: payments.slice(0, MAX_LIST_RESULTS).map(paymentSummary),
    };
  }

  async function actionGetRunsheet(db, accountId, body) {
    const date = body && body.week;
    if (!isYmd(date)) throw badRequest('week is required (yyyy-MM-dd; any date within the desired week).');

    const weekStart = mondayOf(date);
    const weekEnd = addDaysUtc(weekStart, 7);
    const startStr = ymd(weekStart) + 'T00:00:00';
    const endStr = ymd(weekEnd) + 'T00:00:00';

    const snap = await db.collection('jobs')
      .where('ownerId', '==', accountId)
      .where('scheduledTime', '>=', startStr)
      .where('scheduledTime', '<', endStr)
      .get();
    const jobs = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));

    const clientMap = await loadClientsByIds(db, jobs.map((j) => j.clientId));

    const days = {};
    for (let i = 0; i < 7; i++) {
      days[ymd(addDaysUtc(weekStart, i))] = [];
    }
    jobs.forEach((j) => {
      const day = typeof j.scheduledTime === 'string' ? j.scheduledTime.slice(0, 10) : '';
      if (!days[day]) return;
      const client = clientMap.get(j.clientId);
      days[day].push(Object.assign(jobWithClient(j, client), {
        roundOrderNumber: client && typeof client.roundOrderNumber === 'number' ? client.roundOrderNumber : null,
      }));
    });
    Object.keys(days).forEach((day) => {
      days[day].sort((a, b) => (a.roundOrderNumber || 0) - (b.roundOrderNumber || 0));
    });

    return {
      ok: true,
      weekStart: ymd(weekStart),
      jobCount: jobs.length,
      days,
    };
  }

  // ---------------------------------------------------------------------------
  // Write actions
  // ---------------------------------------------------------------------------

  async function actionCreatePayment(db, accountId, body) {
    const client = await getOwnedClient(db, accountId, body && body.clientId);

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw badRequest('amount must be a positive number.');
    if (!isYmd(body.date)) throw badRequest('date must be yyyy-MM-dd.');
    const method = String(body.method || '');
    if (VALID_PAYMENT_METHODS.indexOf(method) === -1) {
      throw badRequest(`method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}.`);
    }

    // Doc shape mirrors services/paymentService.ts createPayment().
    const now = new Date().toISOString();
    const paymentData = {
      ownerId: accountId,
      clientId: client.id,
      amount,
      date: body.date,
      method,
      createdAt: now,
      updatedAt: now,
    };
    if (body.jobId && typeof body.jobId === 'string') paymentData.jobId = body.jobId;
    if (body.reference && typeof body.reference === 'string') paymentData.reference = String(body.reference).slice(0, 200);
    if (body.notes && typeof body.notes === 'string') paymentData.notes = String(body.notes).slice(0, 1000);

    const ref = await db.collection('payments').add(paymentData);
    return { ok: true, paymentId: ref.id, clientName: client.name || '' };
  }

  async function getOwnedJob(db, accountId, jobId) {
    if (!jobId || typeof jobId !== 'string') throw badRequest('jobId is required.');
    const snap = await db.collection('jobs').doc(jobId).get();
    const data = snap.exists ? (snap.data() || {}) : null;
    if (!data || (data.ownerId !== accountId && data.accountId !== accountId)) {
      throw new HttpsError('not-found', 'Job not found.');
    }
    return Object.assign({ id: snap.id }, data);
  }

  async function actionUpdateJobStatus(db, accountId, body) {
    const job = await getOwnedJob(db, accountId, body && body.jobId);
    const status = String((body && body.status) || '');
    if (AGENT_SETTABLE_JOB_STATUSES.indexOf(status) === -1) {
      throw badRequest(`status must be one of: ${AGENT_SETTABLE_JOB_STATUSES.join(', ')}.`);
    }

    // Update shape mirrors services/jobService.ts updateJobStatus().
    // NOTE: the app-side recurring-schedule top-up does NOT run here (documented).
    const updateData = { status };
    if (status === 'completed') {
      updateData.completedAt = new Date().toISOString();
      updateData.completedBy = 'agent';
      updateData.completedByName = 'Guvnor agent';
    } else {
      updateData.completionSequence = null;
      updateData.completedAt = null;
      updateData.completedBy = null;
      updateData.completedByName = null;
    }
    await db.collection('jobs').doc(job.id).update(updateData);
    return { ok: true, jobId: job.id, previousStatus: job.status || '', newStatus: status };
  }

  async function actionRescheduleJob(db, accountId, body) {
    const job = await getOwnedJob(db, accountId, body && body.jobId);
    const newDate = body && body.newDate;
    if (!isYmd(newDate)) throw badRequest('newDate must be yyyy-MM-dd.');
    if (job.status === 'completed') {
      throw badRequest('Cannot reschedule a completed job. Revert it to pending first.');
    }

    // Preserve the original slot the first time a job is moved (mirrors the
    // runsheet defer convention so schedule dedupe keeps working).
    const updateData = { scheduledTime: newDate + 'T09:00:00' };
    if (!job.originalScheduledTime && job.scheduledTime) {
      updateData.originalScheduledTime = job.scheduledTime;
    }
    await db.collection('jobs').doc(job.id).update(updateData);
    return {
      ok: true,
      jobId: job.id,
      previousScheduledTime: job.scheduledTime || '',
      newScheduledTime: updateData.scheduledTime,
    };
  }

  function buildCreateJobData(accountId, client, scheduledDate, serviceId, price, note) {
    const jobData = {
      ownerId: accountId,
      accountId: accountId,
      clientId: client.id,
      providerId: 'test-provider-1',
      serviceId,
      propertyDetails: `${client.address1 || client.address || ''}, ${client.town || ''}, ${client.postcode || ''}`,
      scheduledTime: scheduledDate + 'T09:00:00',
      status: 'pending',
      price,
      paymentStatus: 'unpaid',
      gocardlessEnabled: client.gocardlessEnabled || false,
    };
    if (client.gocardlessCustomerId) jobData.gocardlessCustomerId = client.gocardlessCustomerId;
    if (note && typeof note === 'string' && note.trim()) {
      jobData.jobNote = note.trim();
    }
    return jobData;
  }

  async function actionCreateJob(db, accountId, body) {
    const client = await getOwnedClient(db, accountId, body && body.clientId);
    const scheduledDate = body && body.scheduledDate;
    if (!isYmd(scheduledDate)) throw badRequest('scheduledDate must be yyyy-MM-dd.');

    const serviceId = (body.serviceId && typeof body.serviceId === 'string') ? body.serviceId : 'window-cleaning';
    let price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) {
      price = typeof client.quote === 'number' ? client.quote : 25;
    }

    const jobData = buildCreateJobData(accountId, client, scheduledDate, serviceId, price, body && body.note);
    const ref = await db.collection('jobs').add(jobData);
    return { ok: true, jobId: ref.id, clientName: client.name || '', scheduledTime: jobData.scheduledTime, price };
  }

  async function commitWrites(db, ops) {
    const BATCH = 400;
    for (let i = 0; i < ops.length; i += BATCH) {
      const batch = db.batch();
      ops.slice(i, i + BATCH).forEach((op) => {
        if (op.type === 'update') batch.update(op.ref, op.data);
        else if (op.type === 'set') batch.set(op.ref, op.data);
        else if (op.type === 'delete') batch.delete(op.ref);
      });
      await batch.commit();
    }
  }

  /**
   * Move many non-completed jobs in one call (one write token). Same
   * originalScheduledTime convention as rescheduleJob.
   */
  async function actionBatchRescheduleJobs(db, accountId, body) {
    const items = body && body.items;
    if (!Array.isArray(items) || items.length === 0) {
      throw badRequest('items must be a non-empty array of { jobId, newDate }.');
    }
    if (items.length > MAX_BATCH_RESCHEDULE) {
      throw badRequest(`Maximum ${MAX_BATCH_RESCHEDULE} jobs per call.`);
    }
    items.forEach((it, i) => {
      if (!it || typeof it.jobId !== 'string') throw badRequest(`items[${i}].jobId is required.`);
      if (!isYmd(it.newDate)) throw badRequest(`items[${i}].newDate must be yyyy-MM-dd.`);
    });

    const snaps = await getAllDocs(db, items.map((it) => db.collection('jobs').doc(it.jobId)));
    const results = [];
    const ops = [];
    items.forEach((it, idx) => {
      const snap = snaps[idx];
      const data = snap.exists ? (snap.data() || {}) : null;
      if (!data || (data.ownerId !== accountId && data.accountId !== accountId)) {
        results.push({ jobId: it.jobId, ok: false, error: 'not found' });
        return;
      }
      if (data.status === 'completed') {
        results.push({ jobId: it.jobId, ok: false, error: 'Cannot reschedule a completed job.' });
        return;
      }
      const updateData = { scheduledTime: it.newDate + 'T09:00:00' };
      if (!data.originalScheduledTime && data.scheduledTime) {
        updateData.originalScheduledTime = data.scheduledTime;
      }
      ops.push({ type: 'update', ref: snap.ref, data: updateData });
      results.push({
        jobId: it.jobId,
        ok: true,
        previousScheduledTime: data.scheduledTime || '',
        newScheduledTime: updateData.scheduledTime,
      });
    });
    await commitWrites(db, ops);
    return {
      ok: true,
      moved: ops.length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  /**
   * Create several one-off jobs in one call. Check listJobs first for
   * duplicates on the same client/date/service.
   */
  async function actionBatchCreateJobs(db, accountId, body) {
    const jobs = body && body.jobs;
    if (!Array.isArray(jobs) || jobs.length === 0) {
      throw badRequest('jobs must be a non-empty array of { clientId, scheduledDate, serviceId?, price?, note? }.');
    }
    if (jobs.length > MAX_BATCH_CREATE) {
      throw badRequest(`Maximum ${MAX_BATCH_CREATE} jobs per call.`);
    }
    jobs.forEach((j, i) => {
      if (!j || typeof j.clientId !== 'string') throw badRequest(`jobs[${i}].clientId is required.`);
      if (!isYmd(j.scheduledDate)) throw badRequest(`jobs[${i}].scheduledDate must be yyyy-MM-dd.`);
    });

    const clientIds = Array.from(new Set(jobs.map((j) => j.clientId)));
    const clientMap = await loadClientsByIds(db, clientIds);
    const created = [];
    const failed = [];
    const ops = [];
    jobs.forEach((j, i) => {
      const client = clientMap.get(j.clientId);
      if (!client || !clientBelongsToAccount(client, accountId)) {
        failed.push({ index: i, clientId: j.clientId, error: 'not found' });
        return;
      }
      const serviceId = (j.serviceId && typeof j.serviceId === 'string') ? j.serviceId : 'window-cleaning';
      let price = Number(j.price);
      if (!Number.isFinite(price) || price <= 0) {
        price = typeof client.quote === 'number' ? client.quote : 25;
      }
      const jobData = buildCreateJobData(accountId, client, j.scheduledDate, serviceId, price, j.note);
      const ref = db.collection('jobs').doc();
      ops.push({ type: 'set', ref, data: jobData });
      created.push({
        jobId: ref.id,
        clientId: client.id,
        clientName: client.name || '',
        scheduledTime: jobData.scheduledTime,
        serviceId,
        price,
      });
    });
    await commitWrites(db, ops);
    return { ok: true, created: created.length, failed: failed.length, jobs: created, errors: failed };
  }

  async function actionBatchSetJobNotes(db, accountId, body) {
    const items = body && body.items;
    if (!Array.isArray(items) || items.length === 0) {
      throw badRequest('items must be a non-empty array of { jobId, note }.');
    }
    if (items.length > MAX_BATCH_NOTES) {
      throw badRequest(`Maximum ${MAX_BATCH_NOTES} notes per call.`);
    }
    items.forEach((it, i) => {
      if (!it || typeof it.jobId !== 'string') throw badRequest(`items[${i}].jobId is required.`);
      if (it.note !== undefined && typeof it.note !== 'string') {
        throw badRequest(`items[${i}].note must be a string.`);
      }
    });

    const snaps = await getAllDocs(db, items.map((it) => db.collection('jobs').doc(it.jobId)));
    const results = [];
    const ops = [];
    items.forEach((it, idx) => {
      const snap = snaps[idx];
      const data = snap.exists ? (snap.data() || {}) : null;
      if (!data || (data.ownerId !== accountId && data.accountId !== accountId)) {
        results.push({ jobId: it.jobId, ok: false, error: 'not found' });
        return;
      }
      const note = typeof it.note === 'string' ? it.note.trim() : '';
      ops.push({ type: 'update', ref: snap.ref, data: { jobNote: note || null } });
      results.push({
        jobId: it.jobId,
        ok: true,
        previousNote: data.jobNote || null,
        newNote: note || null,
      });
    });
    await commitWrites(db, ops);
    return {
      ok: true,
      updated: ops.length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  /**
   * Update the owner's Twilio broadcast credentials. Supports either the
   * account auth token or an API key pair (SK sid + secret). Values are
   * verified against Twilio (read-only account fetch) before being saved;
   * secrets are never written to the audit log.
   */
  async function actionUpdateTwilioSettings(db, accountId, body) {
    const accountSid = body && typeof body.accountSid === 'string' ? body.accountSid.trim() : '';
    const authToken = body && typeof body.authToken === 'string' ? body.authToken.trim() : '';
    const apiKeySid = body && typeof body.apiKeySid === 'string' ? body.apiKeySid.trim() : '';
    const apiKeySecret = body && typeof body.apiKeySecret === 'string' ? body.apiKeySecret.trim() : '';
    const fromNumber = body && typeof body.fromNumber === 'string' ? body.fromNumber.trim() : '';

    if (!accountSid || !/^AC[0-9a-fA-F]{32}$/.test(accountSid)) {
      throw badRequest('accountSid must be the AC... Account SID.');
    }
    const usingApiKey = !!(apiKeySid || apiKeySecret);
    if (usingApiKey && (!/^SK[0-9a-fA-F]{32}$/.test(apiKeySid) || !apiKeySecret)) {
      throw badRequest('API key auth needs both apiKeySid (SK...) and apiKeySecret.');
    }
    if (!usingApiKey && !authToken) {
      throw badRequest('Provide either authToken or an apiKeySid + apiKeySecret pair.');
    }
    if (fromNumber) {
      const isPhone = /^\+\d{8,15}$/.test(fromNumber);
      if (!isPhone && (fromNumber.length > 11 || !/^[A-Za-z0-9 ]+$/.test(fromNumber))) {
        throw badRequest('fromNumber must be E.164 (+...) or an alphanumeric name up to 11 chars.');
      }
    }

    // Verify against Twilio before saving (no SMS sent, no cost).
    const { Buffer } = require('buffer');
    const user = usingApiKey ? apiKeySid : accountSid;
    const pass = usingApiKey ? apiKeySecret : authToken;
    const check = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`,
      { headers: { 'Authorization': 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64') } },
    );
    const checkJson = await check.json().catch(() => ({}));
    if (!check.ok) {
      throw new HttpsError('failed-precondition',
        `Twilio rejected these credentials (HTTP ${check.status}: ${checkJson.message || 'Authenticate'}). Nothing was saved.`);
    }

    const update = { twilioAccountSid: accountSid };
    if (usingApiKey) {
      update.twilioApiKeySid = apiKeySid;
      update.twilioApiKeySecret = apiKeySecret;
    } else {
      update.twilioAuthToken = authToken;
      // Clear any stale API key so the send path doesn't prefer it.
      update.twilioApiKeySid = null;
      update.twilioApiKeySecret = null;
    }
    if (fromNumber) update.twilioFromNumber = fromNumber;
    await db.collection('users').doc(accountId).update(update);

    return {
      ok: true,
      authMethod: usingApiKey ? 'apiKey' : 'authToken',
      accountStatus: checkJson.status || null,
      accountName: checkJson.friendly_name || null,
      fromNumberUpdated: !!fromNumber,
    };
  }

  /** Delete a single non-completed job (e.g. an accidental duplicate). */
  async function actionDeleteJob(db, accountId, body) {
    const job = await getOwnedJob(db, accountId, body && body.jobId);
    if (job.status === 'completed') {
      throw badRequest('Cannot delete a completed job (it is part of the billing history).');
    }
    await db.collection('jobs').doc(job.id).delete();
    return {
      ok: true,
      jobId: job.id,
      clientId: job.clientId || '',
      serviceId: job.serviceId || '',
      scheduledTime: job.scheduledTime || '',
      price: Number(job.price) || 0,
    };
  }

  /** Set or clear the one-off note shown inline on the runsheet for one job. */
  async function actionSetJobNote(db, accountId, body) {
    const job = await getOwnedJob(db, accountId, body && body.jobId);
    const note = body && typeof body.note === 'string' ? body.note.trim() : '';
    await db.collection('jobs').doc(job.id).update({ jobNote: note || null });
    return {
      ok: true,
      jobId: job.id,
      scheduledTime: job.scheduledTime || '',
      previousNote: job.jobNote || null,
      newNote: note || null,
    };
  }

  /**
   * Update a client's notes. `runsheetNote` is the client-level note shown
   * behind the "!" icon on every runsheet job for this client (appended to
   * any existing text unless `replaceRunsheetNote: true`). `appendAccountNote`
   * prepends a timestamped entry to the account-notes list on the client page.
   */
  async function actionUpdateClientNotes(db, accountId, body) {
    const client = await getOwnedClient(db, accountId, body && body.clientId);
    const runsheetNote = body && typeof body.runsheetNote === 'string' ? body.runsheetNote.trim() : '';
    const accountNote = body && typeof body.appendAccountNote === 'string' ? body.appendAccountNote.trim() : '';
    if (!runsheetNote && !accountNote) {
      throw badRequest('Provide runsheetNote and/or appendAccountNote.');
    }

    const update = {};
    if (runsheetNote) {
      const existing = typeof client.runsheetNotes === 'string' ? client.runsheetNotes.trim() : '';
      update.runsheetNotes = (body && body.replaceRunsheetNote === true) || !existing
        ? runsheetNote
        : existing + '\n' + runsheetNote;
    }
    if (accountNote) {
      const note = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        author: 'Agent API',
        authorId: 'agent-api',
        text: accountNote,
      };
      const existingNotes = Array.isArray(client.accountNotes) ? client.accountNotes : [];
      update.accountNotes = [note].concat(existingNotes);
    }
    await db.collection('clients').doc(client.id).update(update);
    return {
      ok: true,
      clientId: client.id,
      clientName: client.name || '',
      runsheetNotes: update.runsheetNotes !== undefined ? update.runsheetNotes : (client.runsheetNotes || null),
      accountNoteAdded: !!accountNote,
    };
  }

  /**
   * Set a client's map pin (and optionally correct their postcode).
   * Mirrors the round-order-manager map's manual pin confirmation
   * (app/round-order-manager.tsx handleConfirmPin): latitude/longitude/
   * geoSource/geoUpdatedAt. Pins with geoSource 'manual' were placed by a
   * person in the app and are only overwritten when force:true is passed.
   */
  async function actionUpdateClientLocation(db, accountId, body) {
    const client = await getOwnedClient(db, accountId, body && body.clientId);

    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    // Sanity bounds: UK including Northern Ireland and outlying isles.
    if (!Number.isFinite(latitude) || latitude < 49 || latitude > 61.5) {
      throw badRequest('latitude must be a number within the UK (49 to 61.5).');
    }
    if (!Number.isFinite(longitude) || longitude < -8.7 || longitude > 2.1) {
      throw badRequest('longitude must be a number within the UK (-8.7 to 2.1).');
    }

    const source = body.source === undefined ? 'address' : String(body.source);
    if (VALID_GEO_SOURCES.indexOf(source) === -1) {
      throw badRequest(`source must be one of: ${VALID_GEO_SOURCES.join(', ')}.`);
    }

    if (client.geoSource === 'manual' && body.force !== true) {
      throw new HttpsError(
        'failed-precondition',
        'This client\'s pin was placed manually in the app and is protected. Pass force:true to overwrite it.'
      );
    }

    const updateData = {
      latitude,
      longitude,
      geoSource: source,
      geoUpdatedAt: new Date().toISOString(),
    };

    let postcodeUpdated = false;
    if (body.postcode !== undefined && body.postcode !== null && String(body.postcode).trim() !== '') {
      const compact = String(body.postcode).trim().toUpperCase().replace(/\s+/g, '');
      const formatted = compact.slice(0, -3) + ' ' + compact.slice(-3);
      if (!UK_POSTCODE_REGEX.test(formatted)) {
        throw badRequest('postcode must be a valid UK postcode.');
      }
      updateData.postcode = formatted;
      postcodeUpdated = true;
    }

    await db.collection('clients').doc(client.id).update(updateData);

    return {
      ok: true,
      clientId: client.id,
      clientName: client.name || '',
      latitude,
      longitude,
      geoSource: source,
      previousGeoSource: client.geoSource || null,
      postcodeUpdated,
      newPostcode: postcodeUpdated ? updateData.postcode : null,
    };
  }

  /**
   * Replace the round order for ALL active clients in one call.
   * body.order = the full ordered array of active client ids; position in the
   * array becomes roundOrderNumber (1-based), matching the app's own
   * round-order-manager save convention. The list must cover every active
   * client exactly once (ex-clients are excluded app-side wherever round
   * order is used, so their stale numbers are left untouched).
   */
  async function actionSetRoundOrder(db, accountId, body) {
    const order = body && body.order;
    if (!Array.isArray(order) || order.length === 0) {
      throw badRequest('order must be a non-empty array of client ids covering every active client.');
    }
    if (!order.every((id) => typeof id === 'string' && id.length > 0)) {
      throw badRequest('order must contain only non-empty client id strings.');
    }

    const seen = new Set();
    const duplicates = [];
    order.forEach((id) => {
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
    });
    if (duplicates.length > 0) {
      throw badRequest(`order contains ${duplicates.length} duplicate id(s): ${duplicates.slice(0, 10).join(', ')}${duplicates.length > 10 ? ', …' : ''}`);
    }

    const clients = await loadClientsForAccount(db, accountId);
    const active = clients.filter((c) => (c.status || '') !== 'ex-client');
    const activeIds = new Set(active.map((c) => c.id));

    const missing = active.filter((c) => !seen.has(c.id)).map((c) => c.id);
    const extra = order.filter((id) => !activeIds.has(id));
    if (missing.length > 0 || extra.length > 0) {
      const fmt = (ids) => `${ids.slice(0, 10).join(', ')}${ids.length > 10 ? ', …' : ''}`;
      throw badRequest(
        `order must cover every active client exactly once. ` +
        `Missing ${missing.length} active client(s)${missing.length ? `: ${fmt(missing)}` : ''}. ` +
        `Unknown or inactive ${extra.length} id(s)${extra.length ? `: ${fmt(extra)}` : ''}.`
      );
    }

    // Firestore batches cap at 500 ops; chunk conservatively.
    const CHUNK = 400;
    for (let i = 0; i < order.length; i += CHUNK) {
      const batch = db.batch();
      order.slice(i, i + CHUNK).forEach((id, j) => {
        batch.update(db.collection('clients').doc(id), { roundOrderNumber: i + j + 1 });
      });
      await batch.commit();
    }

    return {
      ok: true,
      clientsOrdered: order.length,
      batches: Math.ceil(order.length / CHUNK),
      orderSha256: sha256Hex(order.join(',')),
    };
  }

  // ---------------------------------------------------------------------------
  // Comms action
  // ---------------------------------------------------------------------------

  async function actionSendChaseEmail(db, accountId, body) {
    const client = await getOwnedClient(db, accountId, body && body.clientId);
    if (!client.email) {
      throw new HttpsError('failed-precondition', 'Client has no email address on record.');
    }

    const [jobs, payments] = await Promise.all([
      loadJobsForClient(db, accountId, client.id),
      loadPaymentsForClient(db, accountId, client.id),
    ]);
    const financials = computeFinancials(client, jobs, payments);
    if (financials.balance >= 0) {
      throw new HttpsError('failed-precondition', `Client has no outstanding balance (balance is £${financials.balance.toFixed(2)}).`);
    }
    const amountOwed = -financials.balance;

    const ownerDoc = await db.collection('users').doc(accountId).get();
    const owner = ownerDoc.exists ? (ownerDoc.data() || {}) : {};
    const businessName = owner.businessName || 'Your service provider';

    const apiKey = RESEND_KEY.value() || process.env.RESEND_KEY;
    if (!apiKey) {
      console.error('agentApi: no Resend API key configured');
      throw new HttpsError('internal', 'Email configuration error.');
    }
    const resend = new Resend(apiKey);

    const customMessage = (body.message && typeof body.message === 'string') ? String(body.message).slice(0, 2000) : '';
    const bankDetailsHtml = (owner.bankSortCode && owner.bankAccountNumber)
      ? `<p style="margin: 0 0 16px;">You can pay by bank transfer:<br/>
           Sort code: <strong>${owner.bankSortCode}</strong><br/>
           Account number: <strong>${owner.bankAccountNumber}</strong><br/>
           Reference: <strong>${client.accountNumber || client.name || ''}</strong></p>`
      : '';

    const sendPayload = {
      from: 'Guvnor <noreply@guvnor.app>',
      to: client.email,
      subject: `Payment reminder from ${businessName}`,
      html: `
        <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #111;">
          <h2 style="margin: 0 0 12px;">Payment reminder</h2>
          <p style="margin: 0 0 16px;">Hi ${client.name || 'there'},</p>
          <p style="margin: 0 0 16px;">This is a friendly reminder from <strong>${businessName}</strong> that your account currently has an outstanding balance of <strong>£${amountOwed.toFixed(2)}</strong>.</p>
          ${customMessage ? `<p style="margin: 0 0 16px;">${customMessage}</p>` : ''}
          ${bankDetailsHtml}
          <p style="margin: 0 0 16px;">If you have already made this payment, please disregard this email.</p>
          <p style="margin: 0; color: #6b7280; font-size: 13px;">Sent on behalf of ${businessName} via Guvnor.</p>
        </div>
      `,
    };
    if (owner.email) sendPayload.replyTo = owner.email;

    const sendResult = await resend.emails.send(sendPayload);
    if (sendResult.error) {
      console.error('agentApi: Resend error (chase email):', sendResult.error);
      throw new HttpsError('internal', 'Failed to send email.');
    }

    return {
      ok: true,
      sentTo: client.email,
      clientName: client.name || '',
      amountOwed: Number(amountOwed.toFixed(2)),
      emailId: (sendResult.data && sendResult.data.id) || null,
    };
  }

  /**
   * Shift the whole upcoming schedule by N days: every non-completed job
   * (pending / scheduled / in_progress) moves by `days`, preserving each
   * job's time-of-day. Because the app's recurring-job top-up anchors on the
   * next already-scheduled job, shifting all pending jobs keeps every
   * frequency cadence (4-weekly stays 4-weekly) on the new dates.
   * Future servicePlans.startDate values are shifted too (cosmetic "Next
   * Service" anchor; it self-realigns on the next completion anyway).
   * `dryRun: true` changes nothing and returns the full per-job from/to list.
   */
  async function actionShiftSchedule(db, accountId, body) {
    const days = Number(body && body.days);
    if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 28) {
      throw badRequest('days must be a non-zero integer between -28 and 28.');
    }
    const dryRun = !!(body && body.dryRun);
    // Only jobs on/after this date move (excludes stale past rows).
    const minDate = body && body.minDate;
    if (minDate !== undefined && !isYmd(minDate)) throw badRequest('minDate must be yyyy-MM-dd.');
    // For deferred jobs whose originalScheduledTime is on/after this date,
    // shift from the ORIGINAL slot instead of the deferred one - restores the
    // natural weekday spread when a pile of incomplete jobs was rolled to the
    // end of a week. The deferral flag is cleared on those jobs.
    const restoreOriginalFrom = body && body.restoreOriginalFrom;
    if (restoreOriginalFrom !== undefined && !isYmd(restoreOriginalFrom)) {
      throw badRequest('restoreOriginalFrom must be yyyy-MM-dd.');
    }
    // Optional: shift a single client's schedule instead of the whole account.
    const onlyClient = body && body.clientId ? await getOwnedClient(db, accountId, body.clientId) : null;

    // Some legacy jobs carry only ownerId, newer ones both ownerId and
    // accountId - query both and merge (same fallback the app uses).
    const [ownerSnap, accountSnap] = await Promise.all([
      db.collection('jobs').where('ownerId', '==', accountId).get(),
      db.collection('jobs').where('accountId', '==', accountId).get(),
    ]);
    const merged = new Map();
    ownerSnap.docs.forEach((d) => merged.set(d.id, d));
    accountSnap.docs.forEach((d) => merged.set(d.id, d));

    const UPCOMING = ['pending', 'scheduled', 'in_progress'];
    const shifts = [];
    for (const docSnap of merged.values()) {
      const j = docSnap.data() || {};
      if (UPCOMING.indexOf(j.status) === -1) continue;
      if (onlyClient && j.clientId !== onlyClient.id) continue;
      const st = typeof j.scheduledTime === 'string' ? j.scheduledTime : '';
      const datePart = st.includes('T') ? st.split('T')[0] : st;
      if (!isYmd(datePart)) continue;
      if (minDate && datePart < minDate) continue;
      const timePart = st.includes('T') ? st.slice(st.indexOf('T')) : 'T09:00:00';

      const orig = typeof j.originalScheduledTime === 'string' ? j.originalScheduledTime : '';
      const origDate = orig.includes('T') ? orig.split('T')[0] : orig;
      const restore = !!(restoreOriginalFrom && isYmd(origDate) &&
        origDate >= restoreOriginalFrom && origDate < datePart);
      const baseDate = restore ? origDate : datePart;
      const newDate = ymd(addDaysUtc(new Date(baseDate + 'T00:00:00Z'), days));

      shifts.push({
        jobId: docSnap.id,
        clientId: j.clientId || '',
        serviceId: j.serviceId || '',
        status: j.status,
        isDeferred: j.isDeferred === true,
        originalScheduledTime: orig || null,
        restoredFromOriginal: restore,
        baseDate,
        from: st,
        to: newDate + timePart,
      });
    }
    shifts.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));

    // Shift future service-plan anchors as well.
    const todayStr = ymd(new Date());
    const plansSnap = await db.collection('servicePlans').where('ownerId', '==', accountId).get();
    const planShifts = [];
    plansSnap.docs.forEach((d) => {
      const p = d.data() || {};
      if (onlyClient && p.clientId !== onlyClient.id) return;
      const sd = typeof p.startDate === 'string' && isYmd(p.startDate) ? p.startDate : null;
      if (!sd || sd < todayStr) return;
      planShifts.push({ planId: d.id, from: sd, to: ymd(addDaysUtc(new Date(sd + 'T00:00:00Z'), days)) });
    });

    if (!dryRun) {
      const BATCH = 400;
      for (let i = 0; i < shifts.length; i += BATCH) {
        const batch = db.batch();
        shifts.slice(i, i + BATCH).forEach((s) => {
          const update = { scheduledTime: s.to };
          // The deferral is resolved by restoring the (shifted) original slot.
          if (s.restoredFromOriginal) update.isDeferred = false;
          batch.update(db.collection('jobs').doc(s.jobId), update);
        });
        await batch.commit();
      }
      for (let i = 0; i < planShifts.length; i += BATCH) {
        const batch = db.batch();
        planShifts.slice(i, i + BATCH).forEach((s) => {
          batch.update(db.collection('servicePlans').doc(s.planId), {
            startDate: s.to,
            updatedAt: new Date().toISOString(),
          });
        });
        await batch.commit();
      }
    }

    return {
      ok: true,
      dryRun,
      days,
      jobsShifted: shifts.length,
      plansShifted: planShifts.length,
      earliestFrom: shifts.length ? shifts[0].from : null,
      latestFrom: shifts.length ? shifts[shifts.length - 1].from : null,
      jobs: shifts,
    };
  }

  /**
   * Temporarily suspend a client's services without archiving the account:
   * deletes their upcoming (non-completed) jobs from `fromDate` (default
   * today), deactivates their active service plans so the schedule top-up
   * raises nothing new, and prepends an account note. The client stays
   * active; reactivating the plan in-app resumes job generation.
   */
  async function actionSuspendClientServices(db, accountId, body) {
    const client = await getOwnedClient(db, accountId, body && body.clientId);
    const fromDate = (body && body.fromDate) || ymd(new Date());
    if (!isYmd(fromDate)) throw badRequest('fromDate must be yyyy-MM-dd.');
    const noteText = body && typeof body.note === 'string' ? body.note.trim() : '';

    const UPCOMING = ['pending', 'scheduled', 'in_progress'];
    const jobs = await loadJobsForClient(db, accountId, client.id);
    const toDelete = jobs.filter((j) => {
      if (UPCOMING.indexOf(j.status) === -1) return false;
      const st = typeof j.scheduledTime === 'string' ? j.scheduledTime : '';
      const datePart = st.includes('T') ? st.split('T')[0] : st;
      return isYmd(datePart) && datePart >= fromDate;
    });

    const plansSnap = await db.collection('servicePlans')
      .where('ownerId', '==', accountId)
      .where('clientId', '==', client.id)
      .get();
    const activePlans = plansSnap.docs.filter((d) => (d.data() || {}).isActive === true);

    const BATCH = 400;
    for (let i = 0; i < toDelete.length; i += BATCH) {
      const batch = db.batch();
      toDelete.slice(i, i + BATCH).forEach((j) => batch.delete(db.collection('jobs').doc(j.id)));
      await batch.commit();
    }
    for (const planDoc of activePlans) {
      await planDoc.ref.update({ isActive: false, updatedAt: new Date().toISOString() });
    }

    if (noteText) {
      // Same shape and ordering the client screen uses (newest first).
      const note = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        author: 'Agent API',
        authorId: 'agent-api',
        text: noteText,
      };
      const existing = Array.isArray(client.accountNotes) ? client.accountNotes : [];
      await db.collection('clients').doc(client.id).update({ accountNotes: [note].concat(existing) });
    }

    const deletedDates = toDelete
      .map((j) => (j.scheduledTime || '').slice(0, 10))
      .sort();
    return {
      ok: true,
      clientId: client.id,
      clientName: client.name || '',
      jobsDeleted: toDelete.length,
      firstDeletedDate: deletedDates[0] || null,
      lastDeletedDate: deletedDates[deletedDates.length - 1] || null,
      plansDeactivated: activePlans.length,
      noteAdded: !!noteText,
      clientStatus: client.status || 'active',
    };
  }

  function makeAccountNote(text) {
    return {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      date: new Date().toISOString(),
      author: 'Agent API',
      authorId: 'agent-api',
      text: text,
    };
  }

  /**
   * Change a client's regular service frequency and/or price, then rebuild
   * upcoming jobs for that service from the next already-scheduled visit
   * (so the next clean stays put, but the cadence after it is correct).
   * Defaults to window-cleaning. Generates ~24 months of pending jobs.
   */
  async function actionUpdateClientService(db, accountId, body) {
    const client = await getOwnedClient(db, accountId, body && body.clientId);
    const serviceType = (body.serviceType && typeof body.serviceType === 'string')
      ? body.serviceType : 'window-cleaning';

    let newFreq = body.frequencyWeeks;
    if (newFreq !== undefined && newFreq !== null) {
      newFreq = Number(newFreq);
      if (!Number.isInteger(newFreq) || newFreq < 1 || newFreq > 52) {
        throw badRequest('frequencyWeeks must be an integer 1-52.');
      }
    } else {
      const parsed = Number(client.frequency);
      newFreq = Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
    }

    let newPrice = body.quote;
    if (newPrice !== undefined && newPrice !== null) {
      newPrice = Number(newPrice);
      if (!Number.isFinite(newPrice) || newPrice < 0) {
        throw badRequest('quote must be a non-negative number.');
      }
    } else {
      newPrice = typeof client.quote === 'number' ? client.quote : 25;
    }

    const jobs = await loadJobsForClient(db, accountId, client.id);
    const upcoming = jobs
      .filter((j) => UPCOMING_JOB_STATUSES.indexOf(j.status) !== -1 && (j.serviceId || '') === serviceType)
      .sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));
    const next = upcoming[0] || null;
    let anchor = body.startDate;
    if (anchor && !isYmd(anchor)) throw badRequest('startDate must be yyyy-MM-dd.');
    if (!anchor) {
      if (next) {
        const st = next.scheduledTime || '';
        anchor = st.includes('T') ? st.split('T')[0] : st;
      } else {
        anchor = ymd(new Date());
      }
    }

    const toDelete = upcoming;
    const BATCH = 400;
    for (let i = 0; i < toDelete.length; i += BATCH) {
      const batch = db.batch();
      toDelete.slice(i, i + BATCH).forEach((j) => batch.delete(db.collection('jobs').doc(j.id)));
      await batch.commit();
    }

    const created = [];
    const horizon = ymd(addDaysUtc(new Date(anchor + 'T00:00:00Z'), 24 * 30));
    let visit = anchor;
    const ops = [];
    while (visit <= horizon) {
      const jobData = buildCreateJobData(accountId, client, visit, serviceType, newPrice, null);
      const ref = db.collection('jobs').doc();
      ops.push({ type: 'set', ref, data: jobData });
      created.push(visit);
      visit = ymd(addDaysUtc(new Date(visit + 'T00:00:00Z'), newFreq * 7));
    }
    await commitWrites(db, ops);

    const now = new Date().toISOString();
    const plansSnap = await db.collection('servicePlans')
      .where('ownerId', '==', accountId)
      .where('clientId', '==', client.id)
      .get();
    const matching = plansSnap.docs.filter((d) => {
      const p = d.data() || {};
      return (p.serviceType || '') === serviceType;
    });
    if (matching.length > 0) {
      await matching[0].ref.update({
        frequencyWeeks: newFreq,
        price: newPrice,
        scheduleType: 'recurring',
        startDate: anchor,
        isActive: true,
        updatedAt: now,
      });
      for (let i = 1; i < matching.length; i++) {
        await matching[i].ref.update({ isActive: false, updatedAt: now });
      }
    } else {
      await db.collection('servicePlans').add({
        ownerId: accountId,
        accountId: accountId,
        clientId: client.id,
        serviceType,
        scheduleType: 'recurring',
        frequencyWeeks: newFreq,
        startDate: anchor,
        lastServiceDate: null,
        price: newPrice,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const clientUpdate = {
      frequency: newFreq,
      quote: newPrice,
    };
    const noteText = body && typeof body.note === 'string' ? body.note.trim() : '';
    if (noteText) {
      const existing = Array.isArray(client.accountNotes) ? client.accountNotes : [];
      clientUpdate.accountNotes = [makeAccountNote(noteText)].concat(existing);
    }
    await db.collection('clients').doc(client.id).update(clientUpdate);

    return {
      ok: true,
      clientId: client.id,
      clientName: client.name || '',
      serviceType,
      previousFrequency: client.frequency || null,
      newFrequency: newFreq,
      previousQuote: typeof client.quote === 'number' ? client.quote : null,
      newQuote: newPrice,
      jobsDeleted: toDelete.length,
      jobsCreated: created.length,
      firstJob: created[0] || null,
      lastJob: created[created.length - 1] || null,
    };
  }

  /**
   * Archive a client (status: ex-client) the same way the client screen does:
   * delete upcoming jobs, deactivate plans, clear round order, compact the
   * numbers after them. If they owe money, services are still cancelled but
   * the account is left open unless force:true.
   */
  async function actionArchiveClient(db, accountId, body) {
    const client = await getOwnedClient(db, accountId, body && body.clientId);
    const force = !!(body && body.force);
    const [jobs, payments] = await Promise.all([
      loadJobsForClient(db, accountId, client.id),
      loadPaymentsForClient(db, accountId, client.id),
    ]);
    const financials = computeFinancials(client, jobs, payments);
    const owes = financials.balance < -0.005;

    const fromDate = ymd(new Date());
    const toDelete = jobs.filter((j) => {
      if (UPCOMING_JOB_STATUSES.indexOf(j.status) === -1) return false;
      const st = typeof j.scheduledTime === 'string' ? j.scheduledTime : '';
      const datePart = st.includes('T') ? st.split('T')[0] : st;
      return isYmd(datePart) && datePart >= fromDate;
    });
    const plansSnap = await db.collection('servicePlans')
      .where('ownerId', '==', accountId)
      .where('clientId', '==', client.id)
      .get();
    const activePlans = plansSnap.docs.filter((d) => (d.data() || {}).isActive === true);

    const BATCH = 400;
    for (let i = 0; i < toDelete.length; i += BATCH) {
      const batch = db.batch();
      toDelete.slice(i, i + BATCH).forEach((j) => batch.delete(db.collection('jobs').doc(j.id)));
      await batch.commit();
    }
    for (const planDoc of activePlans) {
      await planDoc.ref.update({ isActive: false, updatedAt: new Date().toISOString() });
    }

    const noteText = (body && typeof body.note === 'string' && body.note.trim())
      ? body.note.trim()
      : 'Account archived via Agent API.';
    const existing = Array.isArray(client.accountNotes) ? client.accountNotes : [];
    const notes = [makeAccountNote(noteText)].concat(existing);

    if (owes && !force) {
      await db.collection('clients').doc(client.id).update({ accountNotes: notes });
      return {
        ok: true,
        archived: false,
        reason: 'outstanding_balance',
        clientId: client.id,
        clientName: client.name || '',
        balance: Number(financials.balance.toFixed(2)),
        jobsDeleted: toDelete.length,
        plansDeactivated: activePlans.length,
        clientStatus: client.status || 'active',
        noteAdded: true,
      };
    }

    const archivedPosition = typeof client.roundOrderNumber === 'number' ? client.roundOrderNumber : null;
    await db.collection('clients').doc(client.id).update({
      status: 'ex-client',
      roundOrderNumber: null,
      accountNotes: notes,
    });

    let compacted = 0;
    if (archivedPosition) {
      const all = await loadClientsForAccount(db, accountId);
      const toShift = all.filter((c) =>
        c.id !== client.id
        && (c.status || '') !== 'ex-client'
        && typeof c.roundOrderNumber === 'number'
        && c.roundOrderNumber > archivedPosition
      );
      for (let i = 0; i < toShift.length; i += BATCH) {
        const batch = db.batch();
        toShift.slice(i, i + BATCH).forEach((c) => {
          batch.update(db.collection('clients').doc(c.id), { roundOrderNumber: c.roundOrderNumber - 1 });
        });
        await batch.commit();
      }
      compacted = toShift.length;
    }

    return {
      ok: true,
      archived: true,
      clientId: client.id,
      clientName: client.name || '',
      balance: Number(financials.balance.toFixed(2)),
      jobsDeleted: toDelete.length,
      plansDeactivated: activePlans.length,
      roundOrderCompacted: compacted,
      previousRoundOrder: archivedPosition,
      clientStatus: 'ex-client',
    };
  }

  /**
   * Schedule a quote visit on the runsheet (quotes collection + a serviceId
   * 'quote' job), matching app/quotes.tsx / new-business.tsx.
   */
  async function actionCreateQuote(db, accountId, body) {
    const name = body && typeof body.name === 'string' ? body.name.trim() : '';
    const address = body && typeof body.address === 'string' ? body.address.trim() : '';
    const town = body && typeof body.town === 'string' ? body.town.trim() : '';
    const number = body && typeof body.number === 'string' ? body.number.trim() : '';
    const scheduledDate = body && body.scheduledDate;
    if (!name) throw badRequest('name is required.');
    if (!address) throw badRequest('address is required.');
    if (!isYmd(scheduledDate)) throw badRequest('scheduledDate must be yyyy-MM-dd.');
    const source = (body.source && typeof body.source === 'string') ? body.source.trim() : 'WhatsApp';
    const notes = (body.notes && typeof body.notes === 'string') ? body.notes.trim() : '';
    const lines = Array.isArray(body.lines) ? body.lines : [];

    const quoteRef = db.collection('quotes').doc();
    const jobRef = db.collection('jobs').doc();
    const quoteData = {
      name,
      address,
      town,
      number,
      date: scheduledDate,
      scheduledTime: scheduledDate,
      status: 'scheduled',
      source,
      notes,
      lines,
      ownerId: accountId,
      accountId: accountId,
      createdAt: new Date().toISOString(),
    };
    const jobData = {
      ownerId: accountId,
      accountId: accountId,
      clientId: 'QUOTE_' + quoteRef.id,
      scheduledTime: scheduledDate + 'T09:00:00',
      status: 'pending',
      type: 'quote',
      serviceId: 'quote',
      label: 'Quote',
      name,
      address,
      town,
      number,
      quoteId: quoteRef.id,
      source,
    };
    const batch = db.batch();
    batch.set(quoteRef, quoteData);
    batch.set(jobRef, jobData);
    await batch.commit();

    return {
      ok: true,
      quoteId: quoteRef.id,
      jobId: jobRef.id,
      scheduledTime: jobData.scheduledTime,
      name,
      address,
    };
  }

  /**
   * Send pre-rendered SMS messages through the account owner's Twilio
   * credentials (users/{accountId}.twilioAccountSid / twilioAuthToken /
   * twilioFromNumber - the same creds the in-app broadcast screen uses).
   * Max 100 per call to stay inside the function timeout.
   */
  async function actionSendBroadcastSms(db, accountId, body) {
    const messages = body && body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw badRequest('messages must be a non-empty array of { to, body, clientId? }.');
    }
    if (messages.length > 100) {
      throw badRequest('Maximum 100 messages per call - send in chunks.');
    }
    for (const m of messages) {
      if (!m || typeof m.to !== 'string' || !/^\+\d{8,15}$/.test(m.to)) {
        throw badRequest(`Invalid recipient number: ${m && m.to}`);
      }
      if (typeof m.body !== 'string' || m.body.trim().length === 0 || m.body.length > 1600) {
        throw badRequest('Each message body must be 1-1600 characters.');
      }
    }

    const ownerSnap = await db.collection('users').doc(accountId).get();
    const owner = ownerSnap.exists ? (ownerSnap.data() || {}) : {};
    const accountSid = owner.twilioAccountSid;
    const fromSender = owner.twilioFromNumber;
    // Prefer an API key pair (SK sid + secret) when stored; fall back to the
    // account auth token. Either way the URL is addressed by the AC sid.
    const authUser = owner.twilioApiKeySid || accountSid;
    const authPass = owner.twilioApiKeySid ? owner.twilioApiKeySecret : owner.twilioAuthToken;
    if (!accountSid || !authUser || !authPass || !fromSender) {
      throw new HttpsError('failed-precondition', 'Twilio is not configured on this account (Settings > Broadcast).');
    }

    const { Buffer } = require('buffer');
    const authHeader = 'Basic ' + Buffer.from(`${authUser}:${authPass}`).toString('base64');
    const apiUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;

    const results = [];
    const CONCURRENCY = 5;
    for (let i = 0; i < messages.length; i += CONCURRENCY) {
      const chunk = messages.slice(i, i + CONCURRENCY);
      const settled = await Promise.all(chunk.map(async (m) => {
        try {
          const form = new URLSearchParams({ To: m.to, From: fromSender, Body: m.body });
          const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: form.toString(),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            return { to: m.to, clientId: m.clientId || null, ok: false, error: json.message || `HTTP ${res.status}` };
          }
          return { to: m.to, clientId: m.clientId || null, ok: true, sid: json.sid || null };
        } catch (err) {
          return { to: m.to, clientId: m.clientId || null, ok: false, error: err.message || 'Network error' };
        }
      }));
      results.push(...settled);
    }

    const sent = results.filter((r) => r.ok).length;
    return { ok: true, sent, failed: results.length - sent, results };
  }

  // ---------------------------------------------------------------------------
  // HTTP entry point
  // ---------------------------------------------------------------------------

  const READ_ACTIONS = {
    getAccountSummary: actionGetAccountSummary,
    listClients: actionListClients,
    searchClients: actionSearchClients,
    getClient: actionGetClient,
    getClients: actionGetClients,
    listJobs: actionListJobs,
    listPayments: actionListPayments,
    getRunsheet: actionGetRunsheet,
  };

  const WRITE_ACTIONS = {
    createPayment: actionCreatePayment,
    updateJobStatus: actionUpdateJobStatus,
    rescheduleJob: actionRescheduleJob,
    batchRescheduleJobs: actionBatchRescheduleJobs,
    createJob: actionCreateJob,
    batchCreateJobs: actionBatchCreateJobs,
    updateClientLocation: actionUpdateClientLocation,
    setRoundOrder: actionSetRoundOrder,
    sendChaseEmail: actionSendChaseEmail,
    shiftSchedule: actionShiftSchedule,
    sendBroadcastSms: actionSendBroadcastSms,
    suspendClientServices: actionSuspendClientServices,
    updateClientService: actionUpdateClientService,
    archiveClient: actionArchiveClient,
    createQuote: actionCreateQuote,
    setJobNote: actionSetJobNote,
    batchSetJobNotes: actionBatchSetJobNotes,
    updateClientNotes: actionUpdateClientNotes,
    deleteJob: actionDeleteJob,
    updateTwilioSettings: actionUpdateTwilioSettings,
  };

  /**
   * Keep audit log entries readable: setRoundOrder bodies carry hundreds of
   * ids, so log a count + hash instead of the raw array (the same hash is
   * returned to the caller for correlation).
   */
  function auditParams(action, body) {
    if (action === 'setRoundOrder' && body && Array.isArray(body.order)) {
      return Object.assign({}, body, {
        order: { count: body.order.length, sha256: sha256Hex(body.order.join(',')) },
      });
    }
    if (action === 'sendBroadcastSms' && body && Array.isArray(body.messages)) {
      return Object.assign({}, body, {
        messages: {
          count: body.messages.length,
          sha256: sha256Hex(body.messages.map((m) => `${m && m.to}:${m && m.body}`).join('\n')),
        },
      });
    }
    if (action === 'updateTwilioSettings' && body) {
      // Never write secrets to the audit log.
      return Object.assign({}, body, {
        authToken: body.authToken ? '(redacted)' : undefined,
        apiKeySecret: body.apiKeySecret ? '(redacted)' : undefined,
      });
    }
    if (action === 'batchRescheduleJobs' && body && Array.isArray(body.items)) {
      return { count: body.items.length };
    }
    if (action === 'batchCreateJobs' && body && Array.isArray(body.jobs)) {
      return { count: body.jobs.length };
    }
    if (action === 'batchSetJobNotes' && body && Array.isArray(body.items)) {
      return { count: body.items.length };
    }
    return body;
  }

  /** Keep audit `detail` payloads small for bulk actions (Firestore 1MB doc cap). */
  function auditDetail(action, result) {
    if (action === 'shiftSchedule' && result && Array.isArray(result.jobs)) {
      const copy = Object.assign({}, result);
      delete copy.jobs;
      return copy;
    }
    if (action === 'sendBroadcastSms' && result) {
      return { ok: result.ok, sent: result.sent, failed: result.failed };
    }
    if (action === 'batchRescheduleJobs' && result) {
      return { ok: result.ok, moved: result.moved, failed: result.failed };
    }
    if (action === 'batchCreateJobs' && result) {
      return { ok: result.ok, created: result.created, failed: result.failed };
    }
    if (action === 'batchSetJobNotes' && result) {
      return { ok: result.ok, updated: result.updated, failed: result.failed };
    }
    return result;
  }

  async function authenticateKey(db, req) {
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(String(header).trim());
    if (!match || !match[1].startsWith(KEY_PREFIX)) {
      throw new HttpsError('unauthenticated', 'Missing or malformed API key. Send it as: Authorization: Bearer <key>');
    }
    const keyHash = sha256Hex(match[1]);
    const snap = await db.collection('agentApiKeys').where('keyHash', '==', keyHash).limit(1).get();
    if (snap.empty) {
      throw new HttpsError('unauthenticated', 'Invalid API key.');
    }
    const keyDoc = snap.docs[0];
    const keyData = keyDoc.data() || {};
    if (keyData.revokedAt) {
      throw new HttpsError('unauthenticated', 'This API key has been revoked.');
    }
    if (!keyData.accountId) {
      throw new HttpsError('unauthenticated', 'Invalid API key.');
    }
    // Best-effort usage timestamp; never blocks the request.
    keyDoc.ref.update({ lastUsedAt: new Date().toISOString() }).catch(() => {});
    return { keyId: keyDoc.id, accountId: keyData.accountId };
  }

  function httpStatusForError(err) {
    const code = err && err.code;
    if (code === 'unauthenticated') return 401;
    if (code === 'permission-denied') return 403;
    if (code === 'not-found') return 404;
    if (code === 'invalid-argument' || code === 'failed-precondition') return 400;
    if (code === 'resource-exhausted') return 429;
    return 500;
  }

  const agentApi = onRequest({
    secrets: [RESEND_KEY],
    timeoutSeconds: 300,
    memory: '512MiB',
  }, async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(200).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed. Use POST.' });
      return;
    }

    const db = admin.firestore();
    const ip = getClientIp(req);
    const ipKey = sha256Hex(ip).slice(0, 32);

    const parts = String(req.path || '').split('/').filter(Boolean);
    const action = parts[parts.length - 1] || '';
    const handler = READ_ACTIONS[action] || WRITE_ACTIONS[action];
    const isWrite = !!WRITE_ACTIONS[action];

    let auth = null;
    try {
      await enforceRateLimit(db, `agent:ip:${ipKey}`, 10000, 60 * 60 * 1000); // 10000/hr per IP

      if (!handler) {
        const known = Object.keys(READ_ACTIONS).concat(Object.keys(WRITE_ACTIONS)).join(', ');
        res.status(404).json({ ok: false, error: `Unknown action '${action}'. Known actions: ${known}` });
        return;
      }

      auth = await authenticateKey(db, req);
      // Reads and writes have separate buckets: bulk read workloads (e.g. payment
      // reconciliation against GoCardless) shouldn't be throttled like writes.
      if (isWrite) {
        await enforceRateLimit(db, `agent:key:${auth.keyId}`, 600, 60 * 60 * 1000); // 600 writes/hr per key
      } else {
        await enforceRateLimit(db, `agent:key:read:${auth.keyId}`, 6000, 60 * 60 * 1000); // 6000 reads/hr per key
      }

      const body = req.body || {};
      const result = await handler(db, auth.accountId, body);

      if (isWrite) {
        await writeAudit(db, {
          accountId: auth.accountId,
          keyId: auth.keyId,
          action,
          params: auditParams(action, body),
          outcome: 'success',
          detail: auditDetail(action, result),
          ipHash: ipKey,
        });
      }

      res.status(200).json(result);
    } catch (err) {
      const status = httpStatusForError(err);
      const message = (err && err.message) || 'Internal error';
      if (status === 500) console.error(`agentApi ${action} error:`, err);

      if (isWrite && auth) {
        await writeAudit(db, {
          accountId: auth.accountId,
          keyId: auth.keyId,
          action,
          params: auditParams(action, req.body || {}),
          outcome: 'error',
          detail: { error: message },
          ipHash: ipKey,
        });
      }

      res.status(status).json({ ok: false, error: message });
    }
  });

  return { agentApi, createAgentApiKey, listAgentApiKeys, revokeAgentApiKey };
};
