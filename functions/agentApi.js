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

const VALID_PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'cheque', 'other', 'auto_balance', 'direct_debit'];
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
    };
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

    return {
      ok: true,
      count: matches.length,
      clients: matches.slice(0, 25).map(clientSummary),
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
    const upcomingJobs = jobs
      .filter((j) => j.status === 'pending' || j.status === 'scheduled' || j.status === 'in_progress')
      .sort((a, b) => new Date(a.scheduledTime || 0).getTime() - new Date(b.scheduledTime || 0).getTime());
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
      nextJob: upcomingJobs.length > 0 ? jobSummary(upcomingJobs[0]) : null,
      recentCompletedJobs: completedJobs.slice(0, 10).map(jobSummary),
      recentPayments: recentPayments.slice(0, 10).map(paymentSummary),
    };
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

    return {
      ok: true,
      count: jobs.length,
      truncated: jobs.length > MAX_LIST_RESULTS,
      jobs: jobs.slice(0, MAX_LIST_RESULTS).map(jobSummary),
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

    // Join client details for display and round ordering.
    const clientIds = Array.from(new Set(jobs.map((j) => j.clientId).filter(Boolean)));
    const clientMap = new Map();
    await Promise.all(clientIds.map(async (cid) => {
      const cSnap = await db.collection('clients').doc(cid).get();
      if (cSnap.exists) clientMap.set(cid, Object.assign({ id: cSnap.id }, cSnap.data()));
    }));

    const days = {};
    for (let i = 0; i < 7; i++) {
      days[ymd(addDaysUtc(weekStart, i))] = [];
    }
    jobs.forEach((j) => {
      const day = typeof j.scheduledTime === 'string' ? j.scheduledTime.slice(0, 10) : '';
      if (!days[day]) return;
      const client = clientMap.get(j.clientId);
      days[day].push(Object.assign(jobSummary(j), {
        clientName: client ? client.name || '' : '',
        address: client ? [client.address1 || client.address, client.town, client.postcode].filter(Boolean).join(', ') : '',
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
    } else {
      updateData.completionSequence = null;
      updateData.completedAt = null;
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

  async function actionCreateJob(db, accountId, body) {
    const client = await getOwnedClient(db, accountId, body && body.clientId);
    const scheduledDate = body && body.scheduledDate;
    if (!isYmd(scheduledDate)) throw badRequest('scheduledDate must be yyyy-MM-dd.');

    const serviceId = (body.serviceId && typeof body.serviceId === 'string') ? body.serviceId : 'window-cleaning';
    let price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) {
      price = typeof client.quote === 'number' ? client.quote : 25;
    }

    // Doc shape mirrors services/jobService.ts createJob().
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

    const ref = await db.collection('jobs').add(jobData);
    return { ok: true, jobId: ref.id, clientName: client.name || '', scheduledTime: jobData.scheduledTime, price };
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

  // ---------------------------------------------------------------------------
  // HTTP entry point
  // ---------------------------------------------------------------------------

  const READ_ACTIONS = {
    getAccountSummary: actionGetAccountSummary,
    searchClients: actionSearchClients,
    getClient: actionGetClient,
    listJobs: actionListJobs,
    listPayments: actionListPayments,
    getRunsheet: actionGetRunsheet,
  };

  const WRITE_ACTIONS = {
    createPayment: actionCreatePayment,
    updateJobStatus: actionUpdateJobStatus,
    rescheduleJob: actionRescheduleJob,
    createJob: actionCreateJob,
    sendChaseEmail: actionSendChaseEmail,
  };

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

  const agentApi = onRequest({ secrets: [RESEND_KEY] }, async (req, res) => {
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
      await enforceRateLimit(db, `agent:ip:${ipKey}`, 1000, 60 * 60 * 1000); // 1000/hr per IP

      if (!handler) {
        const known = Object.keys(READ_ACTIONS).concat(Object.keys(WRITE_ACTIONS)).join(', ');
        res.status(404).json({ ok: false, error: `Unknown action '${action}'. Known actions: ${known}` });
        return;
      }

      auth = await authenticateKey(db, req);
      await enforceRateLimit(db, `agent:key:${auth.keyId}`, 600, 60 * 60 * 1000); // 600/hr per key

      const body = req.body || {};
      const result = await handler(db, auth.accountId, body);

      if (isWrite) {
        await writeAudit(db, {
          accountId: auth.accountId,
          keyId: auth.keyId,
          action,
          params: body,
          outcome: 'success',
          detail: result,
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
          params: req.body || {},
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
