# Code Changes Log

## November 2, 2025

### Added Active Clients Count Display
- **Location**: `app/clients.tsx`
- **Feature**: Added "Active: X clients" count below the total clients count
- **Logic**: Counts only clients with valid future service dates (nextVisit >= now)
- **Excludes**: Clients with null, "N/A", or past nextVisit dates

## November 2, 2025 (Earlier)

### Client Status Issue Investigation
- **Issue**: User suspected ex-clients were being included in the total client count
- **Root Cause**: The client filter in `app/clients.tsx` uses `client.status !== 'ex-client'` which includes:
  - Clients with `status = 'active'` ✅
  - Clients with `status = undefined` or `null` (legacy data) ⚠️
  - Clients with any other unexpected status value ⚠️

- **Problem**: Some clients may not have a status field (legacy data from before the field was introduced), causing them to be counted as active even if they should be ex-clients.

- **Created Diagnostic Tools**:
  1. `scripts/check-client-status.js` - Analyzes all clients and categorizes them by status
  2. `scripts/fix-client-status.js` - Interactive tool to fix clients with missing/invalid status

### How to Run the Diagnostic Scripts

**Note**: The scripts now have the Firebase configuration hardcoded from app.config.ts so they can connect directly.

1. **Check for problematic clients**:
```powershell
node scripts/check-client-status.js <your-email> <your-password>
```

2. **Fix clients with missing status**:
```powershell
node scripts/fix-client-status.js <your-email> <your-password>
```

Replace `<your-email>` and `<your-password>` with your actual Firebase login credentials.

### Recommendation
If the diagnostic script finds clients without a status field:
1. These are being counted in the "Total: X Clients" number
2. Run the fix script to set them to either "active" or "ex-client" 
3. Clients with round order numbers are likely active
4. Clients without round order numbers might be ex-clients that were archived before proper status tracking

## Previous Changes
[Previous changes would be listed here]