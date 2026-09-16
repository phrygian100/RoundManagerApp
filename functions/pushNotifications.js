/**
 * FCM helpers for owner-facing device notifications.
 *
 * Token list lives on users/{uid}.fcmTokens (string[]). The Cloud Functions in
 * ./pushNotifications.js send to those tokens. Invalid tokens are pruned there.
 */
const admin = require('firebase-admin');
const {
  onDocumentCreated,
  onDocumentUpdated,
} = require('firebase-functions/v2/firestore');

function isCountableJob(data) {
  if (!data) return false;
  const sid = data.serviceId;
  return sid !== 'note' && sid !== 'quote';
}

function mondayOf(ymd) {
  if (!ymd || ymd.length < 10) return '';
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

function weekdayName(ymd) {
  const [y, m, d] = (ymd || '').split('-').map(Number);
  if (!y || !m || !d) return 'the day';
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  ];
}

function stringifyData(data) {
  const out = {};
  Object.keys(data || {}).forEach((k) => {
    const v = data[k];
    if (v == null) return;
    out[k] = String(v);
  });
  return out;
}

async function pruneInvalidTokens(uid, tokens, responses) {
  const invalid = [];
  responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error && r.error.code;
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      invalid.push(tokens[i]);
    }
  });
  if (!invalid.length) return;
  try {
    await admin.firestore().collection('users').doc(uid).update({
      fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalid),
    });
  } catch (err) {
    console.warn('push: failed to prune tokens for', uid, err && err.message);
  }
}

async function sendToUser(uid, { title, body, data }) {
  if (!uid) return;
  const snap = await admin.firestore().collection('users').doc(uid).get();
  if (!snap.exists) return;
  const raw = snap.get('fcmTokens');
  const tokens = Array.isArray(raw)
    ? raw.filter((t) => typeof t === 'string' && t.length > 10)
    : [];
  if (!tokens.length) {
    console.log('push: no tokens for', uid);
    return;
  }

  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: stringifyData(data),
    android: { priority: 'high' },
  });
  await pruneInvalidTokens(uid, tokens, res.responses);
  console.log(`push: sent to ${uid} success=${res.successCount} fail=${res.failureCount}`);
}

async function clientLabel(clientId) {
  if (!clientId) return '';
  try {
    const snap = await admin.firestore().collection('clients').doc(clientId).get();
    if (!snap.exists) return '';
    const c = snap.data() || {};
    return [c.address1, c.town, c.postcode].filter(Boolean).join(', ') || c.name || '';
  } catch (_) {
    return '';
  }
}

async function isDayFullyComplete(ownerId, ymd) {
  if (!ownerId || !ymd) return false;
  const start = `${ymd}T00:00:00`;
  const [y, m, d] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const end = `${next.toISOString().slice(0, 10)}T00:00:00`;

  const snap = await admin
    .firestore()
    .collection('jobs')
    .where('ownerId', '==', ownerId)
    .where('scheduledTime', '>=', start)
    .where('scheduledTime', '<', end)
    .get();

  const jobs = snap.docs.map((d) => d.data()).filter(isCountableJob);
  if (!jobs.length) return false;
  return jobs.every((j) => j.status === 'completed');
}

async function dayAlreadyClosed(ownerId, ymd) {
  const weekStart = mondayOf(ymd);
  if (!weekStart) return false;
  const docId = `${ownerId}_${weekStart}`;
  try {
    const snap = await admin.firestore().collection('completedWeeks').doc(docId).get();
    if (!snap.exists) return false;
    const names = snap.get('completedDays') || [];
    return Array.isArray(names) && names.includes(weekdayName(ymd));
  } catch (_) {
    return false;
  }
}

exports.onQuoteRequestCreated = onDocumentCreated(
  'quoteRequests/{requestId}',
  async (event) => {
    const data = event.data && event.data.data();
    if (!data) return;
    const name = data.name || 'A customer';
    const where = [data.address, data.town, data.postcode].filter(Boolean).join(', ');
    await sendToUser(data.businessId, {
      title: 'New quote request',
      body: where ? `${name} — ${where}` : name,
      data: {
        type: 'quote_request',
        requestId: event.params.requestId,
      },
    });
  }
);

exports.onJobCompleted = onDocumentUpdated(
  'jobs/{jobId}',
  async (event) => {
    const before = (event.data && event.data.before && event.data.before.data()) || {};
    const after = (event.data && event.data.after && event.data.after.data()) || {};
    if (before.status === 'completed' || after.status !== 'completed') return;

    const ownerId = after.ownerId || after.accountId;
    const actor = after.completedBy || '';
    // Owner (or Day Complete batch, which does not set completedBy) already
    // knows they ticked the job — only notify when a member/agent did it.
    if (!ownerId || !actor || actor === ownerId) return;

    const ymd = (after.scheduledTime || '').slice(0, 10);
    const weekStart = mondayOf(ymd);
    const actorName = after.completedByName || 'A team member';
    const where = await clientLabel(after.clientId);
    const dayDone =
      ymd && !(await dayAlreadyClosed(ownerId, ymd)) && (await isDayFullyComplete(ownerId, ymd));

    if (dayDone) {
      await sendToUser(ownerId, {
        title: 'Day ready to review',
        body: `${weekdayName(ymd)} — all jobs are done${where ? ` (last: ${where})` : ''}`,
        data: {
          type: 'day_ready',
          jobId: event.params.jobId,
          day: ymd,
          week: weekStart,
        },
      });
      return;
    }

    await sendToUser(ownerId, {
      title: 'Job completed',
      body: where ? `${actorName} completed ${where}` : `${actorName} completed a job`,
      data: {
        type: 'job_completed',
        jobId: event.params.jobId,
        day: ymd,
        week: weekStart,
      },
    });
  }
);
