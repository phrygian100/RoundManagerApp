# Guvnor Agent Admin API — Integration Brief

This document is written for an AI agent (or any scripted client) that needs to administer a Guvnor window-cleaning business account. Paste it, in full, to the agent that will use the API.

---

## What this is

Guvnor is a round-management app (clients, scheduled cleaning jobs, payments, balances). This API gives you administrative access to **one account's** data, authenticated by an API key. You cannot see or touch any other account's data.

- **Base URL (primary):** `https://us-central1-roundmanagerapp.cloudfunctions.net/agentApi`
- **Base URL (alias, once hosting is redeployed):** `https://roundmanagerapp.web.app/api/agent`
- **Protocol:** every call is `POST <base-url>/<action>` with a JSON body (send `{}` if there are no parameters) and header `Content-Type: application/json`.
- **Auth:** header `Authorization: Bearer <key>` on every request. Keys start with `gvnr_`.
- **Responses:** always JSON. Success responses include `"ok": true`. Errors are `{ "ok": false, "error": "<message>" }` with an appropriate HTTP status (401 bad/revoked key, 404 unknown action or entity not found, 400 bad input, 429 rate limited, 500 server error).
- **Rate limits:** 6,000 read requests/hour and 600 write requests/hour per key (separate buckets). If you receive HTTP 429, stop and wait. **A batch write (`batchRescheduleJobs`, `batchCreateJobs`, `batchSetJobNotes`, `shiftSchedule`, `suspendClientServices`) counts as one write**, not one per job.
- **Timeout:** each call may run up to 5 minutes. Prefer one batch/enriched call over a loop of single-item calls.
- **Minimise calls on bulk work:** for day-of-week / SMS / reschedule tasks, one `listJobs` (or `getRunsheet`) already includes client name, address and mobile — do **not** follow it with `listClients` or per-client `getClient`. For many job moves, use `batchRescheduleJobs` instead of looping `rescheduleJob`.

PowerShell example:

```powershell
$headers = @{ Authorization = "Bearer $env:GUVNOR_AGENT_KEY"; "Content-Type" = "application/json" }
Invoke-RestMethod -Method Post -Uri "https://us-central1-roundmanagerapp.cloudfunctions.net/agentApi/searchClients" -Headers $headers -Body '{"query":"smith"}'
```

curl example:

```bash
curl -s -X POST "https://us-central1-roundmanagerapp.cloudfunctions.net/agentApi/getAccountSummary" \
  -H "Authorization: Bearer $GUVNOR_AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Domain concepts

- **Client**: a customer with a name, address, optional email/phone, an account number like `RWC123`, and a `roundOrderNumber` (position in the cleaning round). Archived clients have `status: "ex-client"`.
- **Job**: one visit to a client on a date (`scheduledTime`, ISO string like `2026-07-21T09:00:00`). `serviceId` is the service type (usually `window-cleaning`). Status is `pending` until done, then `completed`.
- **Payment**: money received from a client (`amount`, `date` as `yyyy-MM-dd`, `method`).
- **Balance**: `totalPaid − totalCompletedJobs + startingBalance`. **Negative balance means the client owes money.** All amounts are GBP.

## Behavioural rules (important)

1. **Never guess IDs.** Always resolve a client via `searchClients` or `getClient` before acting on it, and confirm the name/address matches what the user asked for. `searchClients` already returns each match's `nextJob`.
2. **Read before write.** Before creating a payment, completing a job, or sending an email, fetch current state (`getClient`, `listJobs`) and sanity-check it.
3. **Prefer batch writes.** Use `batchRescheduleJobs` / `batchCreateJobs` / `batchSetJobNotes` / `shiftSchedule` / `suspendClientServices` instead of looping the single-item equivalents. There is still no generic "delete anything" endpoint; completed jobs cannot be deleted (they are billing history).
4. **Ask the human before comms.** `sendChaseEmail` / `sendBroadcastSms` send real messages to real customers. Confirm with your user (wording, recipients) before calling them.
5. Completing a job here does **not** auto-generate future recurring jobs (the app does that when jobs are completed in-app). Occasional API completions are fine; mention this caveat if the user completes many jobs through you.
6. All write actions are recorded in an audit log with your key ID and parameters.

---

## Read actions

### `getAccountSummary` — body `{}`

Account-wide totals plus the list of clients who owe money (most owed first, capped at 100).

Response shape:

```json
{
  "ok": true,
  "summary": {
    "activeClients": 120, "archivedClients": 8,
    "completedJobsCount": 4300, "paymentsCount": 4100,
    "totalBilled": 61000.00, "totalPaid": 59000.00,
    "outstandingClientCount": 14
  },
  "outstandingClients": [ { "id": "...", "name": "...", "accountNumber": "RWC12", "balance": -114.00, "...": "..." } ]
}
```

### `listClients` — body `{ "includeArchived"?: true }`

Returns every client (active only by default) with core fields plus `gocardlessEnabled`, `gocardlessCustomerId`, `dateAdded`, and map-pin fields `latitude`, `longitude`, `geoSource` (`postcode` | `address` | `manual` | null) and `geoUpdatedAt`, sorted by name. Useful for bulk matching against external systems and for auditing client geolocation.

### `searchClients` — body `{ "query": "text" }`

Case-insensitive substring match over name, address, town, postcode and account number. Returns up to 25 matches with core fields (`id`, `name`, `accountNumber`, `address1`, `town`, `postcode`, `email`, `mobileNumber`, `status`, `quote`, `frequency`, `runsheetNotes`) **plus `nextJob`** (or `null`). `count` is the untruncated match total (`truncated: true` if more than 25). Prefer this over `searchClients` + N × `getClient` just to learn the next visit.

### `getClient` — body `{ "clientId": "<id>" }`

Full client detail: core fields, `financials` (`balance`, `totalBilled`, `totalPaid`, `startingBalance`), `nextJob` (next upcoming visit or null), `recentCompletedJobs` (last 10), `recentPayments` (last 10). Use this when you need balances or history; use `getClients` / `searchClients` when you only need identity + next visit.

### `getClients` — body `{ "clientIds": ["<id>", "..."] }`

Batch lookup, max 40 ids. Each result is `{ ok, clientId, client?, nextJob?, error? }` — core fields + runsheet notes + next upcoming job, **no** financials. Replaces a loop of `getClient` when you already have ids.

### `listJobs` — body `{ "clientId"?, "startDate"?, "endDate"?, "status"? }`

You must provide **either** `clientId` **or** both `startDate` and `endDate` (`yyyy-MM-dd`). Optional `status` filter (`pending`, `completed`, etc.). Returns jobs sorted oldest-first, capped at 500 (`truncated: true` if capped). Each job includes `jobNote`, `isDeferred`, `originalScheduledTime`, and joined client fields: `clientName`, `address`, `mobileNumber`, `email`, `frequency`, `runsheetNotes`. For "text everyone on this date" this is the only read you need.

### `listPayments` — body `{ "clientId"?, "startDate"?, "endDate"? }`

Same bounding rule as `listJobs`. Returns payments sorted newest-first, capped at 500.

### `getRunsheet` — body `{ "week": "yyyy-MM-dd" }`

Pass any date; you get that week's runsheet (Monday–Sunday): jobs grouped by day, sorted by round order. Each job has the same joined client fields as `listJobs` (including `mobileNumber`) plus `roundOrderNumber`.

---

## Write actions (all audited)

### `createPayment`

```json
{ "clientId": "<id>", "amount": 25.00, "date": "2026-07-21", "method": "bank_transfer", "jobId": "<optional>", "reference": "<optional>", "notes": "<optional>" }
```

`method` must be one of: `cash`, `card`, `bank_transfer`, `cheque`, `other`, `auto_balance`, `direct_debit`. Returns `{ ok, paymentId, clientName }`.

### `updateJobStatus`

```json
{ "jobId": "<id>", "status": "completed" }
```

`status` may be `completed` (mark done) or `pending` (revert). Returns previous and new status. Completing stamps `completedBy: "agent"` so the account owner can be notified via FCM.

### `rescheduleJob`

```json
{ "jobId": "<id>", "newDate": "2026-07-28" }
```

Moves a non-completed job to the new date (visits are at 09:00). Returns previous and new scheduled time. For more than a couple of jobs, use `batchRescheduleJobs`.

### `batchRescheduleJobs`

```json
{ "items": [ { "jobId": "<id>", "newDate": "2026-09-07" } ] }
```

Same rules as `rescheduleJob`, max 200 items, **one write token**. Per-item failures (`not found`, completed) do not abort the rest. Returns `{ ok, moved, failed, results }`.

### `createJob`

```json
{ "clientId": "<id>", "scheduledDate": "2026-08-01", "serviceId": "gutter-cleaning", "price": 40, "note": "<optional job note>" }
```

`serviceId` defaults to `window-cleaning`; `price` defaults to the client's standard quote. Custom `serviceId` strings display verbatim on the runsheet with one-off styling. Optional `note` becomes the job's inline runsheet note. Creates a one-off pending job. **Check `listJobs` for the same client/date/service first — do not create duplicates.** Returns `{ ok, jobId, scheduledTime, price }`. For several jobs, use `batchCreateJobs`.

### `batchCreateJobs`

```json
{ "jobs": [ { "clientId": "<id>", "scheduledDate": "2026-10-12", "serviceId": "Gutter clearance", "price": 60, "note": "<optional>" } ] }
```

Same fields as `createJob`, max 50, one write token. Unknown client ids are skipped and listed in `errors`. Returns `{ ok, created, failed, jobs, errors }`.

### `deleteJob`

```json
{ "jobId": "<id>" }
```

Deletes a single non-completed job (accidental duplicates etc.). Completed jobs are refused — they are part of billing history. Returns the deleted job's `clientId`, `serviceId`, `scheduledTime` and `price` for the audit trail.

### `setJobNote`

```json
{ "jobId": "<id>", "note": "text (empty string clears)" }
```

Sets or clears the one-off note shown inline on the runsheet for one job. Returns `previousNote` and `newNote`.

### `batchSetJobNotes`

```json
{ "items": [ { "jobId": "<id>", "note": "text (empty string clears)" } ] }
```

Same as `setJobNote`, max 100, one write token. Returns `{ ok, updated, failed, results }`.

### `updateClientNotes`

```json
{ "clientId": "<id>", "runsheetNote": "<optional>", "replaceRunsheetNote": false, "appendAccountNote": "<optional>" }
```

`runsheetNote` is the client-level note behind the "!" icon on every runsheet job for that client — appended to existing text on a new line unless `replaceRunsheetNote: true`. `appendAccountNote` prepends a timestamped entry (author "Agent API") to the account-notes list on the client page. At least one of the two is required.

### `updateClientLocation`

```json
{ "clientId": "<id>", "latitude": 52.99, "longitude": -0.41, "source": "manual", "postcode": "<optional correction>", "force": false }
```

Sets the client's map pin (used by the round order manager's map view). `latitude`/`longitude` must be within UK bounds. `source` is the pin provenance: `postcode` (postcode centroid), `address` (address-level geocode) or `manual` (human-verified precise location — treated as confirmed and never overwritten by the app's bulk geocoder); defaults to `address`. Optional `postcode` also corrects the client's stored postcode (validated + normalised, e.g. `NG34 7AB`). Pins whose current `geoSource` is `manual` are protected: overwriting them fails unless `force: true`. Returns `{ ok, clientId, clientName, latitude, longitude, geoSource, previousGeoSource, postcodeUpdated, newPostcode }`.

### `setRoundOrder`

```json
{ "order": ["<clientId>", "<clientId>", "..."] }
```

Replaces the round order for **all active clients** in one call. `order` must be the complete ordered list of active client ids — position in the array becomes `roundOrderNumber` (1-based), the same convention the app's round order manager uses when saving. The request is rejected (400) if any id is duplicated, unknown, or belongs to an ex-client, or if any active client is missing — the error lists the offending ids. Writes are applied in Firestore batches of 400. Ex-clients are left untouched (the app ignores their round order everywhere). Counts as a single write for rate limiting. The audit log stores `{ count, sha256 }` of the order rather than the raw id list; the same `orderSha256` is returned for correlation. Returns `{ ok, clientsOrdered, batches, orderSha256 }`.

### `shiftSchedule`

```json
{ "days": 7, "dryRun": true, "minDate": "2026-08-17", "restoreOriginalFrom": "2026-08-17" }
```

Bulk-moves every non-completed job (`pending` / `scheduled` / `in_progress`) by `days` (non-zero integer, -28..28), preserving each job's time-of-day. Optional `clientId` scopes the shift (jobs and plan anchors) to a single client — e.g. push one customer's next visit and everything after it by +28 days while keeping their usual interval. Because the app's recurring-job top-up anchors on the next already-scheduled job, a whole-schedule shift keeps every frequency cadence intact on the new dates. Future `servicePlans.startDate` anchors are shifted too. Optional `minDate` (yyyy-MM-dd) excludes older rows (e.g. stale past-dated jobs/notes). Optional `restoreOriginalFrom`: deferred jobs whose `originalScheduledTime` is on/after this date are shifted from their original slot instead of the deferred one (and their deferral flag is cleared). `dryRun: true` writes nothing and returns the full per-job from/to list — save it as your revert map. Counts as a single write for rate limiting. Returns `{ ok, dryRun, days, jobsShifted, plansShifted, earliestFrom, latestFrom, jobs: [...] }` (the `jobs` array is omitted from the audit log).

### `suspendClientServices`

```json
{ "clientId": "<id>", "note": "<optional account note>", "fromDate": "<optional yyyy-MM-dd, default today>" }
```

Temporarily suspends a client without archiving them: deletes their upcoming (non-completed) jobs from `fromDate` onwards, deactivates their active service plans so the schedule top-up raises nothing new, and (if `note` given) prepends a timestamped account note (author "Agent API"). The client stays `active`; reactivating the service plan in-app resumes job generation. Returns `{ ok, clientId, clientName, jobsDeleted, firstDeletedDate, lastDeletedDate, plansDeactivated, noteAdded, clientStatus }`.

### `updateClientService`

```json
{ "clientId": "<id>", "frequencyWeeks": 4, "quote": 20, "serviceType": "window-cleaning", "note": "<optional>" }
```

Updates the client's regular service (`serviceType` defaults to `window-cleaning`): writes `frequency` / `quote` on the client, updates (or creates) the matching service plan, deletes upcoming jobs for that service only, then generates ~24 months of pending jobs from the **next already-scheduled visit** at the new interval and price. Other services (gutters etc.) are left alone. Optional `startDate` overrides the anchor. Optional `note` is prepended to account notes.

### `archiveClient`

```json
{ "clientId": "<id>", "note": "<optional>", "force": false }
```

Cancels upcoming jobs and deactivates plans (same as suspend). Then, if the client does **not** owe money (`balance >= 0`), marks them `ex-client`, clears `roundOrderNumber`, and compact later round-order numbers. If they owe, the account stays `active` unless `force: true`. Returns `{ ok, archived, balance, jobsDeleted, plansDeactivated, clientStatus, reason? }`.

### `createQuote`

```json
{ "name": "Alan", "address": "1 Hawthorn Drive", "town": "Billinghay", "number": "07801674677", "scheduledDate": "2026-09-09", "source": "WhatsApp", "notes": "<optional>", "lines": [] }
```

Creates a quote document and a runsheet job (`serviceId: 'quote'`, `clientId: QUOTE_<quoteId>`) on `scheduledDate`, matching the Quotes / New Business screens. Returns `{ ok, quoteId, jobId, scheduledTime }`.

---

## Comms action (audited)

### `sendChaseEmail`

```json
{ "clientId": "<id>", "message": "<optional extra paragraph>" }
```

Sends a payment-reminder email to the client's email address, stating their outstanding balance and (if configured) the business's bank details for payment. Fails with 400 if the client has no email or does not owe money. Returns `{ ok, sentTo, amountOwed, emailId }`.

### `sendBroadcastSms`

```json
{ "messages": [ { "to": "+447700900123", "body": "pre-rendered text", "clientId": "<optional>" } ] }
```

Sends pre-rendered SMS messages through the account owner's Twilio credentials on the owner's user doc — the same credentials the in-app broadcast screen uses. Auth uses the API key pair (`twilioApiKeySid` + `twilioApiKeySecret`) when stored, otherwise `twilioAccountSid` + `twilioAuthToken`; the sender is `twilioFromNumber`. Max 100 messages per call; send larger campaigns in chunks. Each `to` must be E.164 (`+…`), each `body` 1–1600 chars. Fails with 400 (failed-precondition) if Twilio is not configured. Per-message failures don't abort the batch. **Confirm with your user before sending** — real texts to real customers. Returns `{ ok, sent, failed, results: [{ to, clientId, ok, sid | error }] }`. The audit log stores a count + hash of the messages, not the bodies.

### `updateTwilioSettings`

```json
{ "accountSid": "AC...", "authToken": "<or>", "apiKeySid": "SK...", "apiKeySecret": "...", "fromNumber": "<optional>" }
```

Updates the owner's Twilio broadcast credentials. Provide `accountSid` plus **either** `authToken` **or** an `apiKeySid` + `apiKeySecret` pair (API key wins on send; saving an auth token clears any stored API key). Credentials are verified against Twilio with a read-only account fetch before saving — invalid ones are rejected and nothing is stored. Optional `fromNumber` (E.164 or alphanumeric ≤11 chars) updates the sender. Secrets are redacted in the audit log. Returns `{ ok, authMethod, accountStatus, accountName, fromNumberUpdated }`.

---

## Errors you may see

| HTTP | Meaning | What to do |
|------|---------|------------|
| 401 | Missing/invalid/revoked key | Check the `Authorization: Bearer` header; ask the user for a new key |
| 400 | Bad parameters, or precondition failed (e.g. chasing a client who owes nothing) | Read the `error` message; fix the request |
| 404 | Unknown action, or client/job not found in this account | Re-resolve the ID via `searchClients`/`listJobs` |
| 429 | Rate limited | Back off; do not retry in a loop |
| 500 | Server error | Report it to the user; do not retry more than once |

## Key management (for the account owner, not the agent)

Keys are minted/revoked in the app: **Settings → AI Assistant → Manage API Keys** (account owners only). The key is displayed exactly once at creation. The same screen lists active keys (with last-used dates) and revokes them.

Alternatively, from the repo:

```powershell
node scripts/create-agent-key.cjs <email> <password> "my agent"     # mint (printed once)
node scripts/create-agent-key.cjs <email> <password> --revoke-all   # revoke everything
```

Max 5 active keys per account. Hashes only are stored (collection `agentApiKeys`); the audit trail is in `agentAuditLog`.
