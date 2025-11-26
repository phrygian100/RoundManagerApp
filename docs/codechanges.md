# Code Changes Log

## November 26, 2025

### Job Deferral/Move Tracking - Service Plan Anchor as Source of Truth

**Problem**: When a user moved/deferred a job, the system stored the wrong original date, causing:
1. Moved jobs to show "moved from 06-Dec to 06-Dec" (same date)
2. Service plan anchor dates to become corrupted
3. Future job recurrence to be calculated from the wrong base date

**Root Cause**: The move handler was storing `job.scheduledTime` as the `originalScheduledTime`, which was already the moved-to date if the job had been moved before.

**Solution**: Service plan `startDate` is now the single source of truth. When moving a job, the system:
1. Fetches the service plan to get the canonical anchor date
2. Stores THAT as `originalScheduledTime` (not the corrupted current date)
3. Marks the job with `isDeferred: true`
4. Displays use the service plan anchor for move detection

### Changes Made:

#### 1. Data Model (`types/models.ts`)
- Added `originalScheduledTime?: string` field to the `Job` type
- This field stores the original date before a job was moved/deferred

#### 2. Defer/Move Logic (`app/runsheet/[week].tsx`)
- **Fixed critical bug**: Now fetches the service plan to get the canonical `startDate` BEFORE storing `originalScheduledTime`
- Updated `handleDeferToNextWeek()` to calculate and store the correct original date from service plan
- Updated `handleDeferDateChange()` to calculate and store the correct original date from service plan
- **Key change**: `originalScheduledTime` is now calculated from service plan anchor, NOT from `job.scheduledTime` (which could be corrupted)

#### 3. Job Generation Dedup (`services/jobService.ts`)
- Updated dedup logic in `createJobsForClient()` (both service plan and legacy paths)
- Updated dedup logic in `createJobsForWeek()`
- Updated dedup logic in `createJobsForServicePlan()`
- Updated dedup logic in `createJobsForAdditionalServices()`
- Now checks BOTH `scheduledTime` AND `originalScheduledTime` to prevent duplicate job creation when a job has been moved
- **Important**: Moving a job does NOT change the service plan's anchor date - recurrence continues from the original schedule

#### 4. Client Detail Page (`app/(tabs)/clients/[id].tsx`)
- Added `originalScheduledVisit` state to track the original date
- Updated `fetchNextScheduledVisit()` to also fetch `originalScheduledTime` from the next pending job
- Updated "Next Service" / "Next Scheduled Visit" display (both desktop and mobile layouts) to show:
  - `"06 December 2025 (moved from 15 December 2025)"` if job was moved
  - Normal date display if job was not moved
- **Service Schedule list**: Added orange "(moved from [date])" indicator for moved jobs

#### 5. Clients List Page (`app/clients.tsx`)
- Added `originalVisits` state to track original dates per client
- Updated `fetchNextVisits()` to also capture `originalScheduledTime` for each client's next job
- Updated renderItem to display:
  - `"6 Dec 2025 (moved from 15 Dec)"` format if job was moved
  - Normal date display if job was not moved

### User-Facing Behavior:
- When viewing the clients list or client detail page, if a job has been moved/deferred, users will see:
  - The ACTUAL scheduled date (when the job will occur)
  - Plus "(moved from [original date])" to show where it was originally scheduled
  - OR just "(moved)" for jobs moved before this tracking was added
- The Service Schedule list now highlights moved jobs with an orange indicator
- Job generation will no longer create duplicate jobs for the original date when a job has been moved
- **Recurrence is NOT affected**: Moving a job is an exception - the service plan anchor date (editable only in Manage Services) controls future job generation

### Final Fix - Fetching Service Plan Anchor on Move (Same Day):
- **Critical bug fixed**: Move handlers now FETCH the service plan before storing `originalScheduledTime`
- **Week-based rollover detection**: `isDeferred` flag is now ONLY set when moving jobs to a **different week**, not just a different day
- **Within-week moves**: Moving a job from Monday to Tuesday in the same week does NOT set `isDeferred` - no "moved" indicator shown
- **Cross-week moves**: Moving a job from one week to another sets `isDeferred: true` and stores the service plan anchor as `originalScheduledTime`
- **Service Details display**: Uses service plan's `startDate` directly - if job has `isDeferred: true` and plan has `startDate`, shows `"8th December 2025 (moved to 6th December 2025)"`
- **Service Schedule display**: Shows `"(Moved from 8th Dec 2025)"` using service plan anchor as the "from" date
- **Display uses plan anchor**: Even if `originalScheduledTime` is corrupted in existing data, display logic now references service plan `startDate` directly

### Key Architectural Principle:
**Manage Services screen is the single source of truth** - the "Next Service" date there controls:
1. Future job generation (recurrence pattern)
2. Move detection (what date jobs SHOULD be on)
3. Display of "moved from" indicators

**Rollover/Moved Definition**: Jobs are only considered "rolled over" or "moved" when moved to a **different week**, not when redistributed within the same week.

**To fix corrupted existing data**:
1. Jobs with wrong `originalScheduledTime`: Will be fixed next time they're moved cross-week (or delete and regenerate)
2. Service plans with wrong `startDate`: Manually correct in Manage Services → Regenerate Schedule
3. Future: All new cross-week moves will calculate the correct original date from the service plan

---

## November 2, 2025

### Added Active Clients Count Display with Info Modal
- **Location**: `app/clients.tsx`
- **Features**: 
  - Added "Active: X clients" count below the total clients count
  - Added blue info icon (ⓘ) next to the Active count
  - Tapping the icon opens an informational modal
- **Logic**: Counts only clients with valid future service dates (nextVisit >= now)
- **Excludes**: Clients with null, "N/A", or past nextVisit dates
- **Modal Content**: Explains that this shows clients who have future services scheduled

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