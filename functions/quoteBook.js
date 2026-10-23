// Quote book: one record per home with a random 8-digit reference.
// Imported in chunks from CSV, migrated from the legacy `quotes` collection,
// and accepted by the homeowner through the public portal (/[business]/q/[ref]).
module.exports = function buildQuoteBook({ admin, onCall, HttpsError, crypto }) {
  const MAX_ROWS_PER_CALL = 400;
  const OPEN = 'open';

  async function resolveOwnerId(auth) {
    if (!auth) throw new HttpsError('unauthenticated', 'You must be logged in.');
    const uid = auth.uid;
    const accountId = auth.token && auth.token.accountId;
    if (accountId && accountId !== uid) {
      const member = await admin.firestore().doc(`accounts/${accountId}/members/${uid}`).get();
      if (member.exists) return accountId;
    }
    return uid;
  }

  const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

  function toPrice(v) {
    const n = Number(String(v == null ? '' : v).replace(/[£,\s]/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }

  function normalizePostcode(pc) {
    const raw = String(pc || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (raw.length < 5) return { display: clean(pc, 12).toUpperCase(), key: raw, district: raw, sector: '' };
    const outward = raw.slice(0, -3);
    const inward = raw.slice(-3);
    return { display: `${outward} ${inward}`, key: raw, district: outward, sector: `${outward} ${inward[0]}` };
  }

  function normalizeAddress(a) {
    return String(a || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function buildSearchTokens(ref, address, town, pc) {
    const tokens = new Set([ref]);
    `${address} ${town}`.toLowerCase().replace(/['’]/g, '').split(/[^a-z0-9]+/).forEach((t) => {
      if (t.length >= 2) tokens.add(t);
    });
    if (pc.key) {
      tokens.add(pc.key.toLowerCase());
      tokens.add(pc.district.toLowerCase());
      if (pc.sector) tokens.add(pc.sector.replace(/\s+/g, '').toLowerCase());
    }
    return Array.from(tokens).slice(0, 40);
  }

  const BUILT_FORMS = {
    'detached': 'detached',
    'semi-detached': 'semi-detached',
    'mid-terrace': 'mid-terrace',
    'end-terrace': 'end-terrace',
    'enclosed mid-terrace': 'mid-terrace',
    'enclosed end-terrace': 'end-terrace',
  };

  function describeHome(home) {
    const type = String(home.propertyType || '').toLowerCase();
    if (!type) return '';
    const form = BUILT_FORMS[String(home.builtForm || '').toLowerCase()] || '';
    const area = Number(home.floorAreaM2);
    const rooms = Number(home.habitableRooms);
    const glazing = String(home.glazing || '').toLowerCase();

    const adjective = area > 0 && area < 60 ? 'cosy' : area >= 160 ? 'spacious' : '';
    const words = [adjective, form, type].filter(Boolean).join(' ');
    const article = /^[aeiou]/.test(words) ? 'An' : 'A';
    let sentence = `${article} ${words}`;
    if (area > 0) sentence += ` of about ${Math.round(area)} m²`;

    const extras = [];
    if (rooms > 0) extras.push(`${rooms} habitable ${rooms === 1 ? 'room' : 'rooms'}`);
    if (/100% multi-glazed/.test(glazing) || /fully (double|triple)/.test(glazing)) extras.push('double glazing throughout');
    else if (/triple/.test(glazing)) extras.push('triple glazing');
    else if (/double|multi/.test(glazing)) extras.push('double glazing');
    else if (/single/.test(glazing)) extras.push('single glazing');
    if (!form && !(area > 0) && !extras.length) return '';
    if (extras.length) sentence += ` with ${extras.join(' and ')}`;
    return `${sentence}.`;
  }

  function tidyCase(s) {
    if (!/[A-Z]/.test(s) || s !== s.toUpperCase()) return s;
    return s.toLowerCase().replace(/(^|[\s\-(/])([a-z])/g, (m, pre, ch) => pre + ch.toUpperCase());
  }

  function randomRef() {
    return String(crypto.randomInt(10000000, 100000000));
  }

  async function allocateRefs(db, count) {
    const out = [];
    const seen = new Set();
    let attempts = 0;
    while (out.length < count) {
      if (++attempts > 20) throw new HttpsError('internal', 'Could not allocate quote references.');
      const candidates = [];
      while (candidates.length < count - out.length) {
        const r = randomRef();
        if (!seen.has(r)) { seen.add(r); candidates.push(r); }
      }
      const snaps = await db.getAll(...candidates.map((r) => db.collection('quoteBook').doc(r)));
      snaps.forEach((s) => { if (!s.exists) out.push(s.id); });
    }
    return out;
  }

  function dedupeKeyFor(ownerId, address, postcodeKey) {
    return crypto.createHash('sha1').update(`${ownerId}|${normalizeAddress(address)}|${postcodeKey}`).digest('hex');
  }

  async function commitInBatches(db, ops) {
    for (let i = 0; i < ops.length; i += 450) {
      const batch = db.batch();
      ops.slice(i, i + 450).forEach((fn) => fn(batch));
      await batch.commit();
    }
  }

  // Rows arrive already mapped to this shape by the client:
  // { address, town, postcode, postcodeSector?, price4, price8, propertyType, builtForm,
  //   floorAreaM2, habitableRooms, glazing, existingCustomer, name, phone, email, notes }
  async function insertRows(db, ownerId, rows, source, extra) {
    const result = { created: 0, skippedExisting: 0, skippedNoPrice: 0, skippedDuplicate: 0, skippedInvalid: 0, refs: [], existingRefs: [] };
    const prepared = [];
    const keysInCall = new Set();

    for (const row of rows) {
      if (!row || typeof row !== 'object') { result.skippedInvalid++; continue; }
      if (row.existingCustomer === true) { result.skippedExisting++; continue; }
      const address = tidyCase(clean(row.address, 200));
      if (!address) { result.skippedInvalid++; continue; }
      const price4 = toPrice(row.price4);
      const price8 = toPrice(row.price8);
      if (!price4 && !price8) { result.skippedNoPrice++; continue; }
      const pc = normalizePostcode(row.postcode);
      const dedupeKey = dedupeKeyFor(ownerId, address, pc.key);
      if (keysInCall.has(dedupeKey)) { result.skippedDuplicate++; continue; }
      keysInCall.add(dedupeKey);
      prepared.push({ row, address, price4, price8, pc, dedupeKey });
    }

    if (!prepared.length) return result;

    const keySnaps = await db.getAll(...prepared.map((p) => db.collection('quoteBookKeys').doc(p.dedupeKey)));
    const fresh = [];
    keySnaps.forEach((snap, i) => {
      if (snap.exists) {
        result.skippedDuplicate++;
        result.existingRefs.push(String(snap.data().ref || ''));
      } else {
        fresh.push(prepared[i]);
      }
    });
    if (!fresh.length) return result;

    const refs = await allocateRefs(db, fresh.length);
    const now = new Date().toISOString();
    const ops = [];
    fresh.forEach((p, i) => {
      const ref = refs[i];
      const town = tidyCase(clean(p.row.town, 120));
      const home = {
        propertyType: clean(p.row.propertyType, 40) || null,
        builtForm: clean(p.row.builtForm, 40) || null,
        floorAreaM2: Number(p.row.floorAreaM2) > 0 ? Number(p.row.floorAreaM2) : null,
        habitableRooms: Number(p.row.habitableRooms) > 0 ? Number(p.row.habitableRooms) : null,
        glazing: clean(p.row.glazing, 160) || null,
      };
      const options = [];
      if (p.price4) options.push({ frequencyWeeks: 4, price: p.price4 });
      if (p.price8) options.push({ frequencyWeeks: 8, price: p.price8 });
      const sector = clean(p.row.postcodeSector, 10).toUpperCase() || p.pc.sector;
      const data = {
        ref,
        ownerId,
        accountId: ownerId,
        address: p.address,
        town,
        townKey: town.toLowerCase(),
        postcode: p.pc.display,
        postcodeKey: p.pc.key,
        postcodeDistrict: p.pc.district,
        postcodeSector: sector,
        sortKey: `${town.toLowerCase()}|${p.pc.key}|${normalizeAddress(p.address)}`,
        searchTokens: buildSearchTokens(ref, p.address, town, p.pc),
        options,
        home,
        homeSummary: clean(p.row.homeSummary, 300) || describeHome(home),
        name: clean(p.row.name, 140) || null,
        phone: clean(p.row.phone, 40) || null,
        email: clean(p.row.email, 160) || null,
        notes: clean(p.row.notes, 2000) || null,
        status: OPEN,
        source,
        dedupeKey: p.dedupeKey,
        sheetPrintedAt: null,
        createdAt: now,
        updatedAt: now,
        ...(extra ? extra(p.row) : {}),
      };
      ops.push((b) => b.set(db.collection('quoteBook').doc(ref), data));
      ops.push((b) => b.set(db.collection('quoteBookKeys').doc(p.dedupeKey), { ownerId, ref, createdAt: now }));
      result.refs.push(ref);
    });
    await commitInBatches(db, ops);
    result.created = fresh.length;
    return result;
  }

  const importQuoteBook = onCall({ timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
    const ownerId = await resolveOwnerId(request.auth);
    const body = request.data || {};
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) throw new HttpsError('invalid-argument', 'No rows supplied.');
    if (rows.length > MAX_ROWS_PER_CALL) throw new HttpsError('invalid-argument', `Send at most ${MAX_ROWS_PER_CALL} rows per call.`);
    const source = body.source === 'manual' ? 'manual' : 'import';
    const db = admin.firestore();
    return insertRows(db, ownerId, rows, source);
  });

  function legacyOptions(quote) {
    const lines = Array.isArray(quote.lines) && quote.lines.length
      ? quote.lines
      : [{ frequency: quote.frequency || '', value: quote.value || '' }];
    let price4 = null;
    let price8 = null;
    const other = [];
    lines.forEach((l) => {
      const freq = String(l.frequency || '').toLowerCase();
      const price = toPrice(l.value);
      if (!price) return;
      if (freq.startsWith('4') && !price4) price4 = price;
      else if (freq.startsWith('8') && !price8) price8 = price;
      else other.push(`${l.serviceType ? `${l.serviceType} ` : ''}${l.customFrequency || l.frequency || ''} £${price}`.trim());
    });
    return { price4, price8, other };
  }

  const LEGACY_STATUS = { pending: 'open', complete: 'converted', lost: 'declined' };

  // Copies legacy quotes (status pending/complete/lost) into the quote book.
  // Scheduled visits stay in `quotes` until they are progressed.
  const migrateLegacyQuotes = onCall({ timeoutSeconds: 300, memory: '512MiB' }, async (request) => {
    const ownerId = await resolveOwnerId(request.auth);
    const db = admin.firestore();
    const onlyId = request.data && typeof request.data.quoteId === 'string' ? request.data.quoteId : null;

    let docs;
    if (onlyId) {
      const snap = await db.collection('quotes').doc(onlyId).get();
      if (!snap.exists || (snap.data().ownerId !== ownerId && snap.data().accountId !== ownerId)) {
        throw new HttpsError('not-found', 'Quote not found.');
      }
      docs = [snap];
    } else {
      docs = (await db.collection('quotes').where('ownerId', '==', ownerId).get()).docs;
    }

    const summary = { migrated: 0, alreadyMigrated: 0, stillScheduled: 0, noPrice: 0, linkedExisting: 0 };
    for (const snap of docs) {
      const q = snap.data() || {};
      if (q.quoteBookRef) { summary.alreadyMigrated++; continue; }
      const status = LEGACY_STATUS[q.status];
      if (!status) { summary.stillScheduled++; continue; }
      const { price4, price8, other } = legacyOptions(q);
      const notes = [q.notes, other.length ? `Other quoted lines: ${other.join('; ')}` : '']
        .filter(Boolean).join('\n');
      const row = {
        address: q.address,
        town: q.town,
        postcode: q.postcode || '',
        price4,
        price8,
        name: q.name,
        phone: q.number,
        notes,
      };
      // One-off / custom-frequency quotes have no 4- or 8-weekly price; they stay in `quotes`.
      if (!price4 && !price8) {
        summary.noPrice++;
        continue;
      }
      const res = await insertRows(db, ownerId, [row], 'legacy', () => ({
        status,
        legacyQuoteId: snap.id,
        legacySource: q.source || null,
        quotedOn: q.date || null,
      }));
      const ref = res.refs[0] || res.existingRefs[0];
      if (!ref) continue;
      if (res.refs[0]) summary.migrated++; else summary.linkedExisting++;
      await snap.ref.update({ quoteBookRef: ref });
    }
    return summary;
  });

  const deleteQuoteBookEntries = onCall(async (request) => {
    const ownerId = await resolveOwnerId(request.auth);
    const refs = Array.isArray(request.data && request.data.refs) ? request.data.refs.map(String).slice(0, 400) : [];
    if (!refs.length) throw new HttpsError('invalid-argument', 'No references supplied.');
    const db = admin.firestore();
    const snaps = await db.getAll(...refs.map((r) => db.collection('quoteBook').doc(r)));
    const ops = [];
    let deleted = 0;
    snaps.forEach((s) => {
      if (!s.exists || s.data().ownerId !== ownerId) return;
      deleted++;
      ops.push((b) => b.delete(s.ref));
      if (s.data().dedupeKey) ops.push((b) => b.delete(db.collection('quoteBookKeys').doc(s.data().dedupeKey)));
    });
    await commitInBatches(db, ops);
    return { deleted };
  });

  function publicQuote(data) {
    const status = data.status === OPEN ? 'open' : data.status === 'accepted' ? 'accepted' : 'closed';
    return {
      ref: data.ref,
      address: data.address || '',
      town: data.town || '',
      postcode: data.postcode || '',
      options: Array.isArray(data.options) ? data.options : [],
      homeSummary: data.homeSummary || '',
      status,
      acceptedFrequencyWeeks: status === 'accepted' ? (data.acceptedOption && data.acceptedOption.frequencyWeeks) || null : null,
    };
  }

  // Returns true when the action was handled.
  async function handlePortalAction(action, { req, res, db, ipKey, enforceRateLimit }) {
    if (action === 'getQuoteByRef') {
      const { businessId, ref } = req.body || {};
      await enforceRateLimit(db, `portal:qref:${ipKey}`, 60, 60 * 60 * 1000);
      if (!businessId || typeof businessId !== 'string' || !/^\d{8}$/.test(String(ref || ''))) {
        res.status(400).json({ ok: false, error: 'Please check the quote reference.' });
        return true;
      }
      const snap = await db.collection('quoteBook').doc(String(ref)).get();
      if (!snap.exists || snap.data().ownerId !== businessId) {
        res.status(404).json({ ok: false, error: 'We could not find that quote. Please check the reference on your sheet.' });
        return true;
      }
      res.status(200).json({ ok: true, quote: publicQuote(snap.data()) });
      return true;
    }

    if (action === 'acceptQuote') {
      const { businessId, businessName, ref, frequencyWeeks, name, phone, email, notes } = req.body || {};
      await enforceRateLimit(db, `portal:qaccept:${ipKey}`, 20, 60 * 60 * 1000);
      const cleanName = clean(name, 140);
      const cleanPhone = clean(phone, 40);
      if (!businessId || typeof businessId !== 'string' || !/^\d{8}$/.test(String(ref || ''))) {
        res.status(400).json({ ok: false, error: 'Please check the quote reference.' });
        return true;
      }
      if (!cleanName || cleanPhone.replace(/\D/g, '').length < 10) {
        res.status(400).json({ ok: false, error: 'Please enter your name and a mobile number.' });
        return true;
      }

      const quoteDoc = db.collection('quoteBook').doc(String(ref));
      const requestDoc = db.collection('quoteRequests').doc();
      const now = new Date().toISOString();
      const outcome = await db.runTransaction(async (tx) => {
        const snap = await tx.get(quoteDoc);
        if (!snap.exists || snap.data().ownerId !== businessId) return { code: 404 };
        const data = snap.data();
        if (data.status !== OPEN) return { code: 409, status: data.status };
        const option = (data.options || []).find((o) => Number(o.frequencyWeeks) === Number(frequencyWeeks));
        if (!option) return { code: 400 };

        tx.set(requestDoc, {
          businessId,
          businessName: clean(businessName, 140) || null,
          name: cleanName,
          phone: cleanPhone,
          address: data.address || '',
          town: data.town || '',
          postcode: data.postcode || '',
          email: clean(email, 160) || null,
          notes: clean(notes, 2000) || null,
          propertyType: data.home && data.home.propertyType ? data.home.propertyType : null,
          hasConservatory: null,
          selectedImageUrl: null,
          selectedFrequency: String(option.frequencyWeeks),
          selectedCost: Number(option.price),
          additionalServices: null,
          utm: null,
          serviceCategory: null,
          status: 'pending',
          createdAt: now,
          source: 'quote_sheet',
          preApprovedQuote: true,
          quoteRef: data.ref,
        });
        tx.update(quoteDoc, {
          status: 'accepted',
          acceptedOption: { frequencyWeeks: Number(option.frequencyWeeks), price: Number(option.price) },
          acceptedAt: now,
          quoteRequestId: requestDoc.id,
          name: cleanName,
          phone: cleanPhone,
          email: clean(email, 160) || data.email || null,
          updatedAt: now,
        });
        return { code: 200 };
      });

      if (outcome.code === 404) {
        res.status(404).json({ ok: false, error: 'We could not find that quote.' });
      } else if (outcome.code === 409) {
        res.status(409).json({
          ok: false,
          error: outcome.status === 'accepted'
            ? 'This quote has already been accepted. We will be in touch.'
            : 'This quote is no longer open. Please get in touch and we will re-quote.',
        });
      } else if (outcome.code === 400) {
        res.status(400).json({ ok: false, error: 'Please choose one of the options shown.' });
      } else {
        res.status(200).json({ ok: true });
      }
      return true;
    }

    return false;
  }

  return { importQuoteBook, migrateLegacyQuotes, deleteQuoteBookEntries, handlePortalAction, describeHome };
};
