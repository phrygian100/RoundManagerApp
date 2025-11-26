# Code Changes Log

## November 26, 2025

### Job Deferral/Move Tracking - Service Plan Anchor Separation

**Problem**: When a user moved/deferred a job, the system didn't properly separate the concepts of:
1. **Service plan anchor date** (`startDate`) - the canonical date for generating future recurring jobs
2. **Actual job date** (`scheduledTime`) - where the job was moved to

This caused:
1. Confusion when viewing job schedules - no indication that jobs were moved from their expected dates
2. Potential recurrence issues if the plan anchor drifted from its intended value
3. No visibility into which jobs in the Service Schedule were moved

**Solution**: Implemented proper separation using service plan `startDate` as the source of truth for expected dates.

### Changes Made:

#### 1. Data Model (`types/models.ts`)
- Added `originalScheduledTime?: string` field to the `Job` type
- This field stores the original date before a job was moved/deferred

#### 2. Defer/Move Logic (`app/runsheet/[week].tsx`)
- Updated `handleDeferToNextWeek()` to store `originalScheduledTime` when deferring a job
- Updated `handleDeferDateChange()` to store `originalScheduledTime` when moving a job to a custom date
- Logic preserves the FIRST original date if a job is moved multiple times

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

### Follow-up Fix - Service Plan Anchor Separation (Same Day):
- **Service plan `startDate` as canonical anchor**: The service plan's `Next Service` date (visible in Manage Services) is now the single source of truth for what date jobs SHOULD be on
- **Move detection logic**: Jobs are considered "moved" when their actual `scheduledTime` differs from what's expected based on the service plan anchor + frequency calculation  
- **Display format**: Always shows "EXPECTED DATE (moved to ACTUAL DATE)" - the date from the recurrence pattern first, then where it was moved to
- **Service Schedule indicators**: Shows "(Moved from 8th Dec 2025)" when job differs from calculated expected date
- **Automatic fallback for legacy jobs**: Uses service plan anchor to determine the "should" date even for jobs moved before `originalScheduledTime` tracking existed

### Key Architectural Principle:
**The service plan's `startDate` is sacred** - it should NEVER be modified by job moves, only by manual edits in Manage Services. Job moves are exceptions to the pattern, not changes to the pattern itself.

**To fix existing issues**: If a service plan's "Next Service" date has drifted to the moved-to date (e.g., 06/12 instead of 08/12), manually correct it in Manage Services to restore proper recurrence and move indicators.

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