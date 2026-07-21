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
- **Rate limits:** 600 requests/hour per key. If you receive HTTP 429, stop and wait.

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

1. **Never guess IDs.** Always resolve a client via `searchClients` or `getClient` before acting on it, and confirm the name/address matches what the user asked for.
2. **Read before write.** Before creating a payment, completing a job, or sending an email, fetch current state (`getClient`, `listJobs`) and sanity-check it.
3. **There are no delete or bulk endpoints.** This is deliberate. If something needs deleting or mass-editing, tell the user to do it in the app.
4. **Ask the human before comms.** `sendChaseEmail` sends a real email to a real customer. Confirm with your user (amount, recipient) before calling it.
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

### `searchClients` — body `{ "query": "text" }`

Case-insensitive substring match over name, address, town, postcode and account number. Returns up to 25 matches with core fields (`id`, `name`, `accountNumber`, `address1`, `town`, `postcode`, `email`, `mobileNumber`, `status`, `quote`).

### `getClient` — body `{ "clientId": "<id>" }`

Full client detail: core fields, `financials` (`balance`, `totalBilled`, `totalPaid`, `startingBalance`), `nextJob` (next upcoming visit or null), `recentCompletedJobs` (last 10), `recentPayments` (last 10).

### `listJobs` — body `{ "clientId"?, "startDate"?, "endDate"?, "status"? }`

You must provide **either** `clientId` **or** both `startDate` and `endDate` (`yyyy-MM-dd`). Optional `status` filter (`pending`, `completed`, etc.). Returns jobs sorted oldest-first, capped at 500 (`truncated: true` if capped).

### `listPayments` — body `{ "clientId"?, "startDate"?, "endDate"? }`

Same bounding rule as `listJobs`. Returns payments sorted newest-first, capped at 500.

### `getRunsheet` — body `{ "week": "yyyy-MM-dd" }`

Pass any date; you get that week's runsheet (Monday–Sunday): jobs grouped by day, each with `clientName`, `address`, and sorted by round order.

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

`status` may be `completed` (mark done) or `pending` (revert). Returns previous and new status.

### `rescheduleJob`

```json
{ "jobId": "<id>", "newDate": "2026-07-28" }
```

Moves a non-completed job to the new date (visits are at 09:00). Returns previous and new scheduled time.

### `createJob`

```json
{ "clientId": "<id>", "scheduledDate": "2026-08-01", "serviceId": "gutter-cleaning", "price": 40 }
```

`serviceId` defaults to `window-cleaning`; `price` defaults to the client's standard quote. Creates a one-off pending job. Returns `{ ok, jobId, scheduledTime, price }`.

---

## Comms action (audited)

### `sendChaseEmail`

```json
{ "clientId": "<id>", "message": "<optional extra paragraph>" }
```

Sends a payment-reminder email to the client's email address, stating their outstanding balance and (if configured) the business's bank details for payment. Fails with 400 if the client has no email or does not owe money. Returns `{ ok, sentTo, amountOwed, emailId }`.

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
