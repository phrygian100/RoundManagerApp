# Changelog (condensed on 2025-07-08)

This file tracks **major** functional changes, bug fixes and architectural decisions.
For full debugging notes see project history; this file now focuses on high-level milestones.

---

## 2025-01-31 - Added Activity Log Entries for Job Creation via Client Modal 📝

### Summary
Enhanced the activity log system to capture when users create one-off jobs or add additional recurring work through the "Add a New Job modal" in client screens. Previously, these job creation actions were not being logged to the activity system, creating gaps in audit trails.

### Changes Made:

**1. Extended Audit Types**:
- Added `job_created` action type for one-time job additions
- Added `recurring_service_added` action type for additional recurring work
- Extended `AuditEntityType` to include `'job'` entity type

**2. Updated Audit Service**:
- Added formatting cases in `formatAuditDescription()` for new action types:
  - `job_created`: "Added one-time job for [details]"
  - `recurring_service_added`: "Added recurring service for [details]"

**3. Added Job Creation Audit Logging**:
- **One-time Jobs**: Added audit logging to `handleAddJob()` function in client detail screen
- **Additional Recurring Work**: Added audit logging to `handleAddRecurringService()` function
- Both functions now capture client address, job/service type, and scheduling details

### Activity Log Entries Format:
```
31/01/2025 14:30  [john@company.com]  Added one-time job for "123 Main St, London, SW1A 1AA (Gutter cleaning on 5th Feb 2025)"
31/01/2025 14:25  [sarah@company.com] Added recurring service for "456 Oak Ave, Manchester, M1 1AA (Solar panel cleaning, 12 weekly)"
```

### Technical Implementation:

**Audit Integration Points**:
- `app/(tabs)/clients/[id].tsx` - `handleAddJob()`: One-time job creation logging
- `app/(tabs)/clients/[id].tsx` - `handleAddRecurringService()`: Recurring service addition logging
- Uses existing `getClientAddress()` helper for consistent address formatting
- Includes detailed context: job type, dates, frequency information

**Data Captured**:
- **One-time Jobs**: Client address, service type, scheduled date
- **Recurring Services**: Client address, service type, frequency in weeks
- **Actor Information**: User email and timestamp for accountability
- **Entity References**: Client ID for one-time jobs, client ID for recurring services

### Business Impact:
- **Complete Audit Trail**: Now captures all job creation activities from client screens
- **Accountability**: Clear visibility into who adds what jobs and when
- **Consistency**: Matches existing activity log format with client addresses
- **Troubleshooting**: Historical context for job additions and scheduling changes

**Files Modified**:
- `types/audit.ts` - Added new audit action types and entity type
- `services/auditService.ts` - Extended formatAuditDescription function
- `app/(tabs)/clients/[id].tsx` - Added audit logging to both job creation functions

---

## 2025-01-31 - Fixed Quote Jobs Vehicle Collapse Behavior 🔧

### Summary
Fixed an issue where quote jobs on runsheets were not respecting vehicle collapse states. Previously, when users collapsed vehicles on runsheets, quote jobs would still display while regular jobs would properly hide. Quote jobs now behave consistently with all other job types.

### Changes Made:
**1. Updated Vehicle Collapse Logic**:
- Removed the `!isQuoteJob(item)` exclusion condition from the vehicle collapse check in `app/runsheet/[week].tsx`
- Quote jobs now use the same collapse logic as regular jobs and note jobs
- Changed condition from `!(item as any).__type && !isQuoteJob(item)` to `!(item as any).__type`

### Bug Details:
- **Issue**: Quote jobs ignored vehicle collapse state and remained visible when their assigned vehicle was collapsed
- **Root Cause**: Quote jobs were explicitly excluded from the vehicle collapse check logic
- **Solution**: Removed the quote job exclusion so they follow the same display rules as other job types

### User Experience:
- ✅ Quote jobs now hide when their assigned vehicle is collapsed
- ✅ Quote jobs show when their assigned vehicle is expanded  
- ✅ All quote job functionality remains unchanged (actions, ETA, moving, etc.)
- ✅ Day-level collapse behavior was already working correctly
- ✅ Consistent behavior across all job types (regular, quote, note)

**Files modified**: `app/runsheet/[week].tsx`

---

## 2025-01-31 - Fixed Activity Log to Use Customer Addresses Instead of Names 🔧

### Summary
Updated the audit logging system to display customer addresses instead of names in activity log entries for better privacy and clarity. Activity log entries for client actions now show the customer's address rather than their name.

### Changes Made:

**1. Created Helper Function**:
- Added `getClientAddress()` function in `services/auditService.ts`
- Handles both legacy `address` field and new `address1/town/postcode` format
- Provides fallback for cases where address data is unavailable

**2. Updated Client Action Logging**:
- `app/add-client.tsx`: Client creation now logs address instead of name
- `app/(tabs)/clients/[id]/edit-customer.tsx`: Client editing now logs address instead of name
- `app/(tabs)/clients/[id].tsx`: Client archiving now logs address instead of name

**3. Activity Log Entries Format (Updated)**:
```
23/01/2025 14:32  [john@company.com]  Changed client details for "123 Main St, London, SW1A 1AA"
23/01/2025 14:28  [sarah@company.com] Created client for "456 Oak Ave, Manchester, M1 1AA"  
23/01/2025 09:15  [mike@company.com]  Archived client for "789 High St, Birmingham, B1 1AA"
```

---

## 2025-01-30 - Fixed Complete Job Button for Multiple Vehicles

### Problem
When multiple vehicles were operating on the same day, users could only mark the first job at the top of the entire list as complete. The complete button logic was treating all jobs as one combined list rather than separate lists per vehicle.

### Root Cause
The `firstIncompleteIndex` calculation in `app/runsheet/[week].tsx` was finding the first incomplete job across the entire day's jobs, rather than within each vehicle's section. With multiple vehicles, the data structure looks like:

```
[
  { __type: 'vehicle', name: 'Vehicle 1' }, // index 0
  { job 1 for vehicle 1 },                 // index 1 (only this could be completed)
  { job 2 for vehicle 1 },                 // index 2
  { __type: 'vehicle', name: 'Vehicle 2' }, // index 3  
  { job 1 for vehicle 2 },                 // index 4 (couldn't be completed)
  { job 2 for vehicle 2 },                 // index 5
]
```

### Solution
Enhanced the complete button logic to:

1. **Find Vehicle Boundaries**: Look backwards from current job to find the vehicle header it belongs to
2. **Calculate Vehicle-Specific Index**: Find the first incomplete job within that specific vehicle's section only
3. **Enable Per-Vehicle Completion**: Each vehicle now has its own "first incomplete job" that can be completed

### Technical Implementation

**Enhanced Job Completion Logic** (`app/runsheet/[week].tsx`):
```typescript
// Find which vehicle this job belongs to by looking backwards for the most recent vehicle header
let vehicleStartIndex = 0;
for (let i = index - 1; i >= 0; i--) {
  const prevItem = section.data[i];
  if (prevItem && (prevItem as any).__type === 'vehicle') {
    vehicleStartIndex = i + 1; // Jobs start after the vehicle header
    break;
  }
}

// Find the next vehicle header (or end of section) to determine vehicle end
let vehicleEndIndex = section.data.length;
for (let i = index + 1; i < section.data.length; i++) {
  const nextItem = section.data[i];
  if (nextItem && (nextItem as any).__type === 'vehicle') {
    vehicleEndIndex = i;
    break;
  }
}

// Find the first incomplete job within this vehicle's section only
const firstIncompleteIndexInVehicle = section.data.slice(vehicleStartIndex, vehicleEndIndex)
  .findIndex((job: any) => (job as any).__type !== 'vehicle' && !isNoteJob(job) && job.status !== 'completed');
const firstIncompleteIndex = firstIncompleteIndexInVehicle >= 0 ? vehicleStartIndex + firstIncompleteIndexInVehicle : -1;
```

### User Experience Improvements
- ✅ Each vehicle's first incomplete job now shows the "Complete?" button
- ✅ Users can work through jobs sequentially within each vehicle
- ✅ Maintains existing vehicle collapse/expand functionality  
- ✅ Preserves all other job management features (ETA, Move, etc.)
- ✅ Works correctly with single vehicle setups (no behavior change)

### Edge Cases Handled
- Jobs without vehicle assignments (fallback to original logic)
- Note jobs and quote jobs (excluded from completion logic)  
- Collapsed vehicles (completion still works when expanded)
- Day-level completion (still marks entire day complete)

### Files Modified:
- `app/runsheet/[week].tsx`: Enhanced complete button logic for multi-vehicle support

### Technical Details:

**New Helper Function**:
```typescript
export function getClientAddress(client: { 
  address?: string; 
  address1?: string; 
  town?: string; 
  postcode?: string 
}): string {
  // Use new format if available
  if (client.address1 && client.town && client.postcode) {
    return `${client.address1}, ${client.town}, ${client.postcode}`;
  }
  
  // Fall back to legacy address field
  if (client.address) {
    return client.address;
  }
  
  // Fallback if no address available
  return 'Address not available';
}
```

**Files Modified**:
- `services/auditService.ts` - Added getClientAddress helper function
- `app/add-client.tsx` - Updated to use address in audit logging
- `app/(tabs)/clients/[id]/edit-customer.tsx` - Updated to use address in audit logging
- `app/(tabs)/clients/[id].tsx` - Updated to use address in audit logging

**Note**: Quote-related audit entries already used the correct format (`name - address`) and were not changed.

---

## 2025-01-31 - Dashboard Modernization with Weather Widget and Job Statistics ✅

### Summary
Transformed the main dashboard from a simple button grid to an informative dashboard with real-time widgets. Added settings gear icon to header, weather information using user address data, and today's job completion tracking with visual progress indicators.

### Changes Made:

**1. Settings Button UI Improvement**:
- Moved settings from main button grid to gear icon in top-left header
- Improved navigation UX following standard dashboard patterns
- Added dedicated header section with clean styling

**2. Weather Widget Implementation**:
- Created weather widget using user's registered address (postcode/town)
- Added support for OpenWeatherMap API integration (with mock data for demo)
- Displays temperature, weather condition, and emoji icons
- Eliminates need for location permissions by using existing user data
- Graceful fallback when address data unavailable

**3. Job Statistics Dashboard**:
- Added real-time today's job count and completion rate tracking
- Visual progress bar showing completion percentage
- Queries Firestore for current day's scheduled jobs
- Distinguishes between completed and pending jobs
- Updates automatically when screen gains focus

**4. Layout & Design Enhancements**:
- Restructured dashboard with header, stats section, and button grid
- Added consistent styling with rounded containers and proper spacing
- Improved visual hierarchy and information density
- Maintains cross-platform compatibility (mobile/web)

### Technical Details:
- **Data Sources**: User address from Firestore users collection, jobs from jobs collection
- **Weather API**: Configured for OpenWeatherMap (requires API key for production)
- **Real-time Updates**: Job stats refresh on screen focus for live data
- **Performance**: Efficient queries with proper filtering and caching
- **Error Handling**: Graceful degradation when data unavailable

**Files modified**: `app/(tabs)/index.tsx`

---

## 2025-01-30 - Fixed Client Archive Button Not Working on Android Chrome 📱

### Problem Fixed
Users on Android running the app in Chrome browser were unable to archive clients. Tapping on the red folder icon (🗂️) in the client account screen wasn't responding.

### Root Cause
The archive button and other vertical action buttons had very small touch targets (40x40 pixels) which are below the recommended minimum for mobile touch interaction (44-48px minimum, ideally 56px+). This caused touch events to be unreliable on mobile browsers.

### Solution Implemented (`app/(tabs)/clients/[id].tsx`):

**Mobile Browser Detection**:
- Added `isMobileBrowser()` utility function to detect mobile browsers
- Uses user agent string and screen width to identify mobile devices

**Enhanced Touch Targets for Mobile**:
- Increased button size from 40x40px to 56x56px for mobile browsers
- Increased padding from 8px to 12px for better touch accessibility  
- Increased icon font size from 16px to 20px for better visibility
- Increased gap between buttons from 8px to 12px for mobile

**Responsive Design**:
- All vertical action buttons (Edit, Add Job, Payment, Balance, Archive) now use mobile-optimized sizing
- Desktop browsers continue to use compact 40x40px buttons
- Mobile browsers get the larger, more touch-friendly 56x56px buttons

### User Experience:
- ✅ Archive button now works reliably on Android Chrome
- ✅ All action buttons are more accessible on mobile browsers
- ✅ Better visual feedback with larger icons on mobile
- ✅ Maintains compact design on desktop while optimizing for mobile touch

### Technical Implementation:
```javascript
// Mobile browser detection
const isMobileBrowser = () => {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent;
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) ||
    (window.innerWidth <= 768);
};

// Responsive button styling
<Pressable 
  style={[styles.verticalButton, isMobileBrowser() && styles.mobileVerticalButton]} 
  onPress={handleDelete}
>
  <ThemedText style={[styles.verticalButtonIcon, isMobileBrowser() && styles.mobileVerticalButtonIcon]}>🗂️</ThemedText>
</Pressable>
```

**Files modified**: `app/(tabs)/clients/[id].tsx`, `docs/code-changes.md`

---

## 2025-01-31 - User Profile Edit Modal in Settings ✅

### Summary
Added a comprehensive user profile edit modal in the settings screen allowing users to update their personal information including name, address details, and contact number.

### Changes Made:

**1. Profile Edit Modal UI**:
- Added modal with form fields for name, address1, town, postcode, and contact number
- Implemented consistent modal styling following existing codebase patterns
- Added proper form validation requiring name field

**2. State Management Enhancement**:
- Added `profileModalVisible` state for modal visibility control
- Added `profileForm` state object to manage form data
- Added `savingProfile` state for loading state management during save operations

**3. Data Loading & Saving**:
- Created `loadUserProfile()` function to fetch current user data from Firestore
- Implemented `handleSaveProfile()` function with proper validation and error handling
- Added automatic address field cleanup and legacy address generation for backward compatibility
- Integrated with existing `updateUserProfile()` service function

**4. User Experience Improvements**:
- Added "Edit Profile" button prominently placed in settings screen
- Profile data is automatically loaded when modal opens
- Success/error alerts provide clear feedback to users
- Modal can be canceled without saving changes

### Technical Details:
- **Cross-platform compatible**: Works on both mobile and web platforms
- **Data consistency**: Maintains structured address fields while providing legacy combined address
- **Non-destructive**: Only updates fields that have values, preserves existing user data
- **Security**: Uses existing userService validation and Firestore security rules

**Files modified**: `app/(tabs)/settings.tsx`

---

## 2025-01-31 - Optional Address Fields in User Registration ✅

### Summary
Added optional address collection during user registration to gather structured address information (address1, town, postcode) following the same pattern used for client addresses.

### Changes Made:

**1. User Type Enhancement**:
- Updated `types/models.ts` User type to include optional structured address fields
- Added `address1?`, `town?`, `postcode?` fields
- Maintained legacy `address?` field for backward compatibility

**2. Registration Form Updates**:
- Added three optional address input fields to `app/register.tsx`
- Fields appear between email and password for logical flow
- Clear "(Optional)" labels to indicate non-required status
- Proper keyboard types and capitalization settings

**3. Data Storage Enhancement**:
- Updated Firestore user document creation to conditionally include address fields
- Only stores fields that have values to keep data clean
- Automatically creates combined address string for backward compatibility
- No breaking changes to existing user documents

### Technical Details:
- **Non-disruptive**: Existing users and flows completely unaffected
- **Platform compatible**: Works on both mobile and web using standard React Native components
- **Validation**: No validation required since fields are optional
- **Data consistency**: Follows established client address pattern for UI/UX consistency

**Files modified**: `types/models.ts`, `app/register.tsx`

---

## 2025-01-29 - Enhanced Message ETA Feature with Service-Specific Templates

### Summary
Enhanced the "Message ETA" functionality in runsheets to send different professional message templates depending on whether it's a service job or quote job, with proper service type identification and customer address inclusion.

### Changes Made:

**1. Service Type Mapping**:
- Added `getServiceTypeDisplay()` function to convert technical service IDs to user-friendly text
- Maps `'window-cleaning'` → "Window cleaning", `'Gutter cleaning'` → "Gutter cleaning", etc.
- Custom service names (like "Lantern") are used as-is

**2. Differentiated Message Templates**:

**Service Jobs Template**:
```
Hello [Customer Name],

Courtesy message to let you know [Service Type] is due tomorrow at [Customer Address].
Roughly estimated time of arrival:
[ETA]

Many thanks,
Travis
www.tgmwindowcleaning.co.uk
```

**Quote Jobs Template**:
```
Hello [Customer Name],

Courtesy message to let you know we'll be over to quote tomorrow at [Customer Address].
Roughly estimated time of arrival:
[ETA]
if you can't be home and access is available around the property, we will leave you a written quote.

Many thanks,
Travis
www.tgmwindowcleaning.co.uk
```

**3. Address Integration**:
- Service jobs: Uses `client.address1` (or fallback to `client.address`) 
- Quote jobs: Uses quote's `address` field
- Only includes first line of address for message brevity

**4. Professional Branding**:
- Added proper business signature with name and website
- Consistent professional formatting across both message types

### Technical Implementation:
- Enhanced `handleMessageETA()` function in `app/runsheet/[week].tsx`
- Added service type mapping for common services
- Conditional template selection based on job type
- Maintained existing ETA handling and SMS URL generation
- Preserved all existing error handling and platform-specific SMS launching

### Impact:
- ✅ More professional and detailed customer communications
- ✅ Service-specific messaging improves clarity
- ✅ Customer address inclusion helps with job identification
- ✅ Quote-specific messaging sets proper expectations
- ✅ Consistent branding across all automated messages
- ✅ Maintains backward compatibility with existing functionality

### Files Modified:
- `app/runsheet/[week].tsx` - Enhanced handleMessageETA function with service-specific templates

---

## 2025-01-29 - Fixed Round Order Manager Display Inconsistency

### Issue Resolved:
**Problem**: Round order of clients in the Round Order Manager screen bore no resemblance to the correct round order shown in the Clients screen when sorted by "Round Order".

### Root Cause Analysis:
1. **Clients Screen (Correct)**: Used actual `roundOrderNumber` field for sorting clients by round order
2. **Round Order Manager (Broken)**: Ignored actual `roundOrderNumber` and reassigned positions based on array index, causing complete order mismatch
3. **Secondary Issue**: Missing Firestore composite index caused fallback to unordered query, returning clients in document creation order rather than round order

### Technical Implementation:
1. **Fixed Database Query Fallback**:
   - Added manual sorting by `roundOrderNumber` when database index is missing
   - Ensures correct order even when Firestore composite index fails

2. **Fixed Display Position Logic**:
   - Replaced array index mapping (`index + 1`) with actual `roundOrderNumber` usage
   - Updated all three modes: CREATE, EDIT, and fallback

3. **Updated Display Functions**:
   - `renderPositionList()`: Now uses `clients.find(c => c.displayPosition === pos)` instead of array indexing
   - `createMobileDisplayList()`: Added proper sorting and position-based insertion logic
   - `renderMobileItem()`: Uses actual `displayPosition` instead of array index

### Code Changes:
```javascript
// Before: Ignored actual round order
clientsList = activeClients.map((client, index) => ({
  ...client,
  displayPosition: index + 1  // WRONG: Array index
}));

// After: Uses actual round order
clientsList = activeClients.map(client => ({
  ...client,
  displayPosition: client.roundOrderNumber || 0  // CORRECT: Actual round order
}));
```

### Impact:
- ✅ Round order manager now displays clients in same order as clients screen
- ✅ Fixes user confusion about round order discrepancies
- ✅ Maintains correct round order data integrity
- ✅ Works correctly even when database index is missing
- ✅ No risk to existing functionality - purely display layer fix

### Files Modified:
- `app/round-order-manager.tsx` - Fixed position assignment and display logic

---

## 2025-01-29 - Enhanced Clients Screen Sorting Options

### Changes Made:
1. **Renamed "Name" sort option to "Address"**:
   - The existing sort was already sorting by address, not name, so the label was corrected
   - Now properly sorts by the full address (address1, town, postcode) or legacy address field

2. **Added new "Account Number" sort option**:
   - Sorts clients by their account numbers from RWC1 upwards
   - Extracts numeric portion from account numbers for proper numerical sorting
   - Handles missing or invalid account numbers gracefully

### Technical Implementation:
- Updated `SortOption` type to replace `'name'` with `'address'` and add `'accountNumber'`
- Modified sorting logic in the `useEffect` hook:
  - `address` case: Sorts by concatenated address fields or legacy address
  - `accountNumber` case: Uses regex to extract numeric part for proper sorting
- Updated sort options array and `getSortLabel()` function accordingly
- Sort cycling order is now: None → Address → Next Visit → Round Order → Balance → Account Number

### Impact:
- ✅ More accurate sort option labeling (Address vs Name)
- ✅ New account number sorting for better client organization
- ✅ Proper numerical sorting of account numbers (RWC1, RWC2, etc.)
- ✅ Maintains backward compatibility with existing address formats

### Files Modified:
- `app/clients.tsx` - Updated sort types, logic, and labels

---

## 2025-01-29 - Settings Screen Cleanup and Role-Based Access Control

### Changes Made:
1. **Removed redundant buttons** from the settings screen:
   - Refresh Account button - No longer needed
   - Generate Recurring Jobs button - This is now automatic
   - Weekly Rollover (Test) button - Testing function no longer required
   - Repair Client Order button - Legacy maintenance function

2. **Added role-based access control** for destructive operations:
   - Delete All Payments button - Now only visible to owner accounts
   - Delete All Jobs button - Now only visible to owner accounts  
   - Delete All Clients button - Now only visible to owner accounts
   - Members can no longer see or access these dangerous operations

### Technical Implementation:
- Used existing `isOwner` state to conditionally render delete buttons
- Wrapped delete buttons in a conditional fragment that checks `isOwner && (<buttons>)`
- Removed unused handler functions: `handleRefreshAccount`, `handleGenerateJobs`, `handleWeeklyRollover`, `handleRepairClients`
- Cleaned up unused state variable `loadingMessage`

### Impact:
- ✅ Cleaner, more focused settings screen with only relevant options
- ✅ Improved security by restricting destructive operations to owners only
- ✅ Reduced code complexity by removing obsolete functionality
- ✅ Better user experience with less confusing options

### Files Modified:
- `app/(tabs)/settings.tsx` - Removed buttons, added role-based visibility, cleaned up unused code

---

## 2025-01-29 - Fixed Delete Service Button and Custom Service Tags on Runsheet

### Bug Fix 1: Delete Service Button Now Works Properly on All Platforms
Fixed an issue where the delete service button in the Edit Additional Service modal would briefly turn grey but not actually delete the service. The button was unresponsive due to platform-specific issues with button colors and alert dialogs.

### Root Cause Analysis:
1. The button used a custom hex color `#ff4444` which is not supported by React Native's Button component on all platforms
2. `Alert.alert` doesn't function properly on web platforms, causing the delete confirmation to fail silently
3. The issue was similar to the previously fixed "Delete Job Button" issue in the runsheet modal

### Technical Fix (`app/(tabs)/clients/[id].tsx`):
- **Changed button color**: From unsupported `#ff4444` to standard `red` color
- **Added platform detection**: Used `Platform.OS` to handle web vs native environments differently
- **Implemented web fallbacks**: Used `window.confirm()` and `alert()` for web platform
- **Refactored delete logic**: Extracted delete functionality into `performDelete` function for reuse

### Implementation Details:
```javascript
// Before: Unsupported color and no platform handling
color="#ff4444"
Alert.alert('Delete Service', ...)

// After: Platform-specific implementation
color="red"
if (Platform.OS === 'web') {
  window.confirm(...) // Web confirmation
  alert(...) // Web success/error messages
} else {
  Alert.alert(...) // Native alerts for iOS/Android
}
```

### Impact:
- ✅ Delete service button now responds correctly on all platforms
- ✅ Confirmation dialogs work on web, iOS, and Android
- ✅ Success/error messages display appropriately
- ✅ Service is properly removed from Firestore and UI updates immediately
- ✅ Consistent behavior across Windows web environment and mobile apps

### Bug Fix 2: Custom Additional Service Types Now Display on Runsheet
Fixed an issue where custom additional service types (like "Lantern") created through the "Other" option weren't appearing as tags on the runsheet. Previously, only predefined service types ('Gutter cleaning', 'Conservatory roof', etc.) were shown as labels.

### Root Cause Analysis:
The runsheet was only displaying labels for a hardcoded list of "one-off" job types. Custom service types entered via the "Other" option were correctly stored in the `serviceId` field but weren't included in the display logic.

### Technical Fix (`app/runsheet/[week].tsx`):
- **Added detection for additional services**: Created `isAdditionalService` variable to identify any job that isn't regular window cleaning or a predefined one-off job
- **Added custom styling**: Created new styles for additional service rows with light blue background
- **Added service labels**: Display custom service type in a blue label badge, similar to one-off jobs

### Implementation Details:
```javascript
// Before: Only predefined one-off jobs got labels
const isOneOffJob = ['Gutter cleaning', 'Conservatory roof', ...].includes(item.serviceId);

// After: All non-window-cleaning services get labels
const isAdditionalService = item.serviceId && item.serviceId !== 'window-cleaning' && !isOneOffJob;
```

### Visual Design:
- Additional services have a light blue background (#f0f8ff) to distinguish them
- Service type appears in a blue badge (#4a90e2) with white text
- Consistent with the existing one-off job styling but with different colors

### Impact:
- ✅ Custom service types like "Lantern" now display as tags on the runsheet
- ✅ All additional services are visually distinct from regular window cleaning
- ✅ Better visibility for workers to identify different service types
- ✅ Consistent labeling across predefined and custom service types

---

## 2025-01-27 - Round Order Manager Mobile UI Overhaul 🎯

### Problem Fixed
Round Order Manager was unusable on mobile browsers (Chrome on Android):
- Down arrow navigation button was not visible/cut off
- Instructions box took up valuable screen space
- Cancel/Confirm buttons overlapped the client list
- Overall janky appearance on mobile devices

### Root Cause
The component treated all web platforms the same (desktop and mobile browsers), resulting in:
- Desktop-optimized UI being shown on mobile browsers
- Poor use of limited mobile screen space
- Inadequate touch targets and button positioning
- No mobile-specific optimizations

### Solution Implemented (`app/round-order-manager.tsx`):

**1. Removed Instructions Box**:
- Completely removed the blue instruction box to save screen space
- UI is now self-explanatory with visual cues

**2. Enhanced Mobile Detection**:
```javascript
const isMobileBrowser = () => {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent;
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) ||
    (window.innerWidth <= 768); // Also consider small screens as mobile
};
```

**3. Mobile-Specific UI**:
- Created separate UI branch for mobile browsers
- Grouped navigation buttons together at bottom of list
- Added position indicator: "Position X of Y"
- Larger touch targets: 70x70px buttons with better spacing

**4. Fixed Action Buttons**:
- Moved Cancel/Confirm buttons to fixed footer
- No longer overlap the client list
- Added shadow and border for better visual separation
- Proper padding to ensure visibility above browser UI

**5. Visual Improvements**:
- Enhanced selected position highlight with rounded borders
- Better color contrast and larger fonts for mobile
- Smooth animations and proper touch feedback
- Triangle arrows (▲▼) instead of regular arrows for better visibility

**Result**: Round Order Manager now provides an intuitive, touch-friendly experience on mobile browsers with all UI elements properly visible and accessible.

---

## 2025-01-17 - Mobile Browser Round Order Manager Fix 📱

### Problem Fixed
Round Order Manager navigation buttons were not working properly in Chrome browser on Android devices. The down arrow button was either cut off or had inadequate touch targets.

### Root Cause
Chrome on Android reports `Platform.OS === 'web'` but requires mobile-optimized UI elements:
- Touch targets were too small (50x50px) for mobile interaction
- Insufficient bottom padding caused button cutoff by browser UI
- No mobile browser-specific styling applied

### Solution Implemented (`app/round-order-manager.tsx`):

**Mobile Browser Detection**:
- Added `isMobileBrowser()` utility function to detect mobile browsers
- Uses user agent string to identify Android/iOS browsers

**Enhanced Touch Targets**:
- Increased button size from 50x50px to 60x60px for mobile browsers
- Added larger margins and padding for better touch accessibility
- Increased arrow text size from 24px to 28px for better visibility

**Layout Improvements**:
- Increased bottom padding from 100px to 150px for mobile browsers
- Added minimum height constraints for button containers
- Enhanced visual feedback with shadows on mobile

**Code Quality**:
- Fixed TypeScript error in router params by properly handling complex objects
- Improved type safety for navigation parameters

**Result**: Navigation buttons now work reliably on mobile browsers with appropriate touch targets and visibility.

---

## 2025-01-27 - Added Note Deletion Functionality

### New Feature: Delete Notes by Tapping
Added the ability to delete note jobs by tapping on them. When a note is tapped, a confirmation modal appears with a delete button.

### Implementation Details (`app/runsheet/[week].tsx`):

**User Interface**:
- Made note jobs tappable by wrapping in `Pressable` component
- Added delete confirmation modal with note preview
- Modal shows the note text and asks for confirmation before deletion

**State Management**:
- Added `deleteNoteModalVisible` and `noteToDelete` state variables
- Added `handleNotePress()` function to open delete modal
- Added `handleDeleteNote()` function to perform deletion

**Delete Functionality**:
- Removes note job from Firestore using `deleteDoc()`
- Updates local state to remove note immediately
- Shows success/error alerts
- Maintains referential integrity (no orphaned data)

**Visual Design**:
- Delete modal matches existing modal styling
- Shows note preview in italics with gray background
- Red delete button to indicate destructive action
- Cancel button for safety

---

## 2025-01-27 - Fixed Delete Job Button Not Working in Runsheet Modal

### Bug Fix: Delete Job Button Now Functions Properly on Android/Web
Fixed a critical issue where the delete job button in the runsheet modal wasn't responding to user taps on Android and web platforms. The issue was caused by overlapping touch event handlers and improper modal structure.

### Root Cause Analysis:
1. The original modal used a `Pressable` overlay with `pointerEvents="box-none"` on the inner View
2. This configuration interfered with touch events reaching the button components
3. The overlay was capturing touch events intended for the buttons
4. iOS ActionSheet worked fine, but Android/Web modal had touch event conflicts

### Technical Fix (`app/runsheet/[week].tsx`):
- **Replaced overlay structure**: Changed from `Pressable` overlay to proper `Modal` component
- **Fixed touch event handling**: Used separate background `Pressable` for dismissal
- **Updated modal styling**: Adjusted `androidSheetOverlay` to use `flex: 1` instead of absolute positioning
- **Maintained functionality**: All button actions (Navigate, Message ETA, Edit Price, Delete Job, etc.) now work correctly

### Implementation Details:
```
// Before: Problematic Pressable overlay
<Pressable style={styles.androidSheetOverlay} onPress={() => setActionSheetJob(null)}>
  <View style={styles.androidSheet} pointerEvents="box-none">

// After: Proper Modal with separate background handler
<Modal visible={true} transparent animationType="fade">
  <View style={styles.androidSheetOverlay}>
    <Pressable style={{...absoluteFill}} onPress={() => setActionSheetJob(null)} />
    <View style={styles.androidSheet}>
```

### Additional Fix - Platform-Specific Alert Handling:
The delete functionality still wasn't working on web because `Alert.alert` doesn't function on web platforms. Updated both `handleDeleteJob` and `handleDeleteQuoteJob` functions to use platform-specific confirmation dialogs:

```javascript
// Now checks platform and uses appropriate confirmation method
if (Platform.OS === 'web') {
  if (window.confirm('Are you sure you want to permanently delete this job?')) {
    // Delete logic
  }
} else {
  Alert.alert(...) // Native alert for iOS/Android
}
```

### Impact:
- ✅ Delete job button now works reliably on Android and web
- ✅ Confirmation dialogs appear correctly on all platforms
- ✅ All other action sheet buttons function correctly
- ✅ Modal dismissal still works when tapping outside
- ✅ Consistent behavior across all platforms
- ✅ Improved user experience for runsheet management

---

## 2025-01-27 - Fixed Note Job Positioning Bug in allocateJobsForDay

### Bug Fix: Note Jobs Now Maintain Correct Position Below Selected Job
Fixed a critical bug where note jobs were appearing at the top of the day instead of below their associated job. The issue was caused by the `allocateJobsForDay` function re-sorting jobs by roundOrderNumber after they had already been correctly sorted.

### Root Cause Analysis:
1. The sorting algorithm correctly positioned notes after their original jobs based on `originalJobId`
2. However, `allocateJobsForDay` was then re-sorting all jobs by `roundOrderNumber`
3. Since note jobs have `client: null`, their `roundOrderNumber` was undefined (treated as 0)
4. This caused all note jobs to be sorted to the beginning of the job list

### Technical Fix (`app/runsheet/[week].tsx`):
- Removed the re-sorting logic in `allocateJobsForDay` (line 257)
- Changed from: `const sortedJobs = [...jobsForDay].sort((a, b) => (a.client?.roundOrderNumber ?? 0) - (b.client?.roundOrderNumber ?? 0));`
- Changed to: Direct iteration over `jobsForDay` to preserve the pre-sorted order
- Added clear comments explaining why re-sorting must not be done

### Additional TypeScript Fixes:
- Added type casting for `originalJobId` property access: `(note as any).originalJobId`
- Added type casting for `createdAt` property access: `(a as any).createdAt`

This fix ensures that the carefully constructed sorting order (with notes positioned after their original jobs) is preserved through the vehicle allocation process.

---

## 2025-01-27 - Fixed Note Job Positioning in Runsheets

### Bug Fix: Note Jobs Now Correctly Position Below Selected Job
Fixed an issue where note jobs were appearing at the top of the day instead of directly below the job where the user clicked "add note below". The sorting algorithm has been completely rewritten to ensure notes maintain their position relative to their original job.

### Technical Changes:

**Enhanced Sorting Algorithm (`app/runsheet/[week].tsx`)**:
- Removed flawed `originalIndex` approach that didn't work for newly added notes
- Implemented smart sorting based on `originalJobId` reference
- Note jobs now always appear directly after their associated job
- Multiple notes for the same job are sorted by creation timestamp
- Notes maintain position even when their original job moves due to ETA or round order changes

**Sorting Rules**:
1. Regular jobs sort by ETA (if set), then by roundOrderNumber
2. Note jobs always appear immediately after their original job
3. When comparing a note to its original job, the note always comes after
4. When comparing notes to other jobs, they use their original job's position
5. Multiple notes for the same job sort by `createdAt` timestamp

### Bug Details:
- **Issue**: Notes were being sorted to the top of the day due to insertion order not being preserved
- **Root Cause**: The `originalIndex` approach failed because it was assigned after insertion
- **Solution**: Use the `originalJobId` field to maintain proper parent-child relationship

---

## 2025-01-27 - Add Note Below Functionality in Runsheets

### New Feature: Text-Based Note Jobs
Added the ability to insert text-based note jobs below any job in the runsheet. These note jobs display custom text and are excluded from completion logic and other job processing.

### Implementation Details:

**User Interface (`app/runsheet/[week].tsx`)**:
- Added "Add note below" button to both iOS ActionSheet and Android/web modal for all job types (regular and quote jobs)
- Added note input modal with:
  - Text input field for multi-line note text
  - Cancel and Save buttons
  - Clean modal styling matching existing UI patterns

**State Management**:
- Added `addNoteModalVisible`, `addNoteText`, and `addNoteForJob` state variables
- Added `handleAddNoteBelow()` function to open note input modal
- Added `handleSaveNote()` function to create and save note jobs

**Note Job Structure**:
- Uses `serviceId: 'note'` to identify note jobs
- Special `clientId: 'NOTE_JOB'` for easy filtering
- Contains `noteText` field with user-entered text
- References `originalJobId` to track which job it was added below
- Includes `createdAt` timestamp for proper sorting
- Sets `price: 0` and `paymentStatus: 'paid'` since note jobs don't require payment

**Visual Design**:
- Note jobs display with yellow highlight (`#fff8e1` background)
- Shows "📝 Note" as address title
- Yellow badge with "Note" label
- Displays note text as client name
- No control buttons (ETA, Complete, etc.)

**Smart Sorting Algorithm**:
- Enhanced job sorting to position note jobs immediately after their original job
- Note jobs sort by `originalJobId` and then by `createdAt` timestamp
- Regular job sorting (ETA, roundOrderNumber) preserved for non-note jobs

**Exclusion from Job Logic**:
- Added `isNoteJob()` helper function for easy identification
- Excluded note jobs from:
  - Day completion logic (`isDayComplete()`)
  - Batch day completion (`handleDayComplete()`)
  - First incomplete job detection
  - All job processing that affects workflow

### Technical Implementation:
```
// Note job detection
const isNoteJob = (job: any) => job && job.serviceId === 'note';

// Note job creation
const noteJobData = {
  ownerId,
  clientId: 'NOTE_JOB',
  serviceId: 'note',
  propertyDetails: addNoteText.trim(),
  scheduledTime: addNoteForJob.scheduledTime,
  status: 'pending',
  price: 0,
  paymentStatus: 'paid',
  noteText: addNoteText.trim(),
  originalJobId: addNoteForJob.id,
  isNoteJob: true,
  createdAt: Date.now(),
};

// Enhanced sorting with note job positioning
.sort((a: any, b: any) => {
  if (isNoteJob(a) && !isNoteJob(b)) {
    if (a.originalJobId === b.id) return 1; // Note after original
  }
  if (!isNoteJob(a) && isNoteJob(b)) {
    if (a.id === b.originalJobId) return -1; // Original before note
  }
  // Regular sorting logic...
});

// Exclusion from completion logic
const jobsForDay = jobs.filter((job) => {
  return jobDate && jobDate.toDateString() === dayDate.toDateString() && !isNoteJob(job);
});
```

### User Experience:
- Note jobs provide flexible text annotation capabilities
- Positioned immediately below the job they relate to
- Visually distinct but integrated into runsheet flow
- Don't interfere with completion tracking or workflow
- Support multi-line text for detailed notes

### Files Modified:
- `app/runsheet/[week].tsx`: Complete note functionality implementation

---

## 2025-01-26 - Moved Refresh Capacity to Settings

### UI/UX Improvement: Centralized Capacity Management
Moved the "Refresh Capacity" functionality from the runsheet header to the settings screen for better organization and user experience.

### Implementation Details:

**Settings Screen (`app/(tabs)/settings.tsx`)**:
- Added `isRefreshingCapacity` state to track loading state
- Added `handleRefreshCapacityForCurrentWeek()` function that:
  - Uses `startOfWeek()` to get current week date
  - Imports and calls `manualRefreshWeekCapacity()` service
  - Shows detailed results with job redistribution counts and warnings
- Added "Refresh Capacity for Current Week" button after "Repair Client Order"
- Button shows "Refreshing..." state and is disabled during operation

**Runsheet Screen (`app/runsheet/[week].tsx`)**:
- Removed `isRefreshingCapacity` state and related loading logic
- Removed `handleCapacityRefresh()` and `handleDebugCapacity()` functions
- Removed refresh capacity and debug buttons from header
- Simplified header to only show home button

**User Experience**:
- Capacity refresh is now accessible from main settings area
- No longer clutters the runsheet header interface
- Maintains all existing functionality and error handling
- Provides same detailed feedback on redistribution results

### Technical Implementation:
```
// Settings screen function
const handleRefreshCapacityForCurrentWeek = async () => {
  setIsRefreshingCapacity(true);
  try {
    const currentWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
    const { manualRefreshWeekCapacity } = await import('../../services/capacityService');
    const result = await manualRefreshWeekCapacity(currentWeek);
    
    // Show detailed results with job counts and warnings
    Alert.alert('Capacity Refresh Complete', alertMessage);
  } catch (error) {
    Alert.alert('Error', 'Failed to refresh capacity. Please try again.');
  } finally {
    setIsRefreshingCapacity(false);
  }
};
```

### Files Modified:
- `app/(tabs)/settings.tsx`: Added refresh capacity functionality
- `app/runsheet/[week].tsx`: Removed refresh capacity functionality

---

## 2025-01-26 - Vehicle-Based Collapse/Expand in Runsheets

### New Feature: Vehicle-Level Job Grouping
Added vehicle-based collapse/expand functionality to the runsheet screen to better organize jobs when multiple vehicles are operating on the same day.

### Implementation Details:

**State Management (`app/runsheet/[week].tsx`)**:
- Added `collapsedVehicles` state array to track which vehicle blocks are collapsed
- Added `toggleVehicle()` function to handle expand/collapse of individual vehicles
- Vehicle IDs use format `${vehicleId}-${dateKey}` for unique identification per day

**Vehicle Block Rendering Enhancement**:
- Vehicle headers now show +/- collapse buttons only when 2+ vehicles exist for the day
- Button appears to the left of vehicle name in a horizontal layout
- Uses `Pressable` component for touch interaction
- Shows `-` when expanded, `+` when collapsed

**Smart Job Filtering**:
- Enhanced `SectionList` renderItem logic to hide jobs belonging to collapsed vehicles
- Implemented backward lookup algorithm to find which vehicle each job belongs to
- Jobs under collapsed vehicles are completely hidden from view
- Preserves existing day-level collapse functionality

**User Experience**:
- Only displays vehicle collapse controls when there are multiple vehicles
- Single vehicle days remain unchanged in appearance
- Vehicle collapse state is independent of day-level collapse
- Maintains existing ETA, completion, and job management functionality

### Technical Implementation:
```
// Vehicle collapse state
const [collapsedVehicles, setCollapsedVehicles] = useState<string[]>([]);

// Toggle function
const toggleVehicle = (vehicleId: string) => {
  setCollapsedVehicles((prev) =>
    prev.includes(vehicleId) ? prev.filter((v) => v !== vehicleId) : [...prev, vehicleId]
  );
};

// Smart rendering with vehicle awareness
renderItem={({ item, index, section }) => {
  // Hide jobs for collapsed vehicles by looking backward for vehicle block
  if (!(item as any).__type && !isQuoteJob(item)) {
    let vehicleId = null;
    for (let i = index - 1; i >= 0; i--) {
      const prevItem = section.data[i];
      if (prevItem && (prevItem as any).__type === 'vehicle') {
        vehicleId = prevItem.id;
        break;
      }
    }
    if (vehicleId && collapsedVehicles.includes(vehicleId)) {
      return null;
    }
  }
  return renderItem({ item, index, section });
}}
```

### Files Modified:
- `app/runsheet/[week].tsx`: Added vehicle collapse/expand functionality

---

## 2025-01-26 - CSV Import Enhancements & Client List Display Fix

### Bug Fixes:
1. **Enhanced CSV Import Error Reporting**: CSV import now shows specific row details when rows are skipped instead of just a count
2. **Fixed Double RWC Prefix Issue**: Resolved issue where account numbers were getting "RWC" prefix applied twice during CSV import
3. **Mobile Number Formatting**: CSV import now automatically adds leading "0" to UK mobile numbers that are missing it
4. **Client List Next Visit Display**: Fixed issue where "Next Visit: N/A" was showing in clients list even when jobs existed

### Implementation Details:

**Improved Error Reporting (`app/(tabs)/settings.tsx`)**:
- Added row identifiers (Name, Account Number, or Row number) to skipped row tracking
- Enhanced error messages to show up to 5 specific failed rows with reasons
- Displays format: "• Client Name: Missing Address Line 1, Quote (£)"
- Shows "... and X more" when more than 5 rows are skipped
- Applied consistently across all three import paths (web CSV, mobile CSV, mobile Excel)

**RWC Prefix Logic Fix (`app/(tabs)/settings.tsx`)**:
- Replaced conditional check with proactive cleanup approach
- New logic removes any existing "RWC" prefix first, then adds clean prefix
- Prevents duplicate prefixes regardless of input data format
- Uses case-insensitive regex `/^RWC/i` for robust detection
- Applied consistently across all three import paths

**Mobile Number Formatting (`app/(tabs)/settings.tsx`)**:
- Added `formatMobileNumber()` helper function for UK mobile number processing
- Automatically adds leading "0" to 10-digit numbers that don't start with "0"
- Handles numbers like "7795324567" → "07795324567" 
- Applied to all three CSV import paths (web CSV, mobile CSV, mobile Excel)
- Preserves original input if already formatted or invalid length

**Client List Display Fix (`app/clients.tsx`)**:
- Added `useFocusEffect` to refresh next visit data when screen gains focus
- Extracted `fetchNextVisits` function for reusable next visit fetching
- Added comprehensive debug logging to troubleshoot data fetching issues
- Ensures next visit display stays synchronized with job updates

### Technical Improvements:
- **Better UX**: Users can now identify exactly which data rows need to be fixed
- **Robust Processing**: Account number processing now handles any edge cases with existing prefixes
- **Consistent Logic**: All import paths (web/mobile, CSV/Excel) use identical processing logic

### Files Modified:
- `app/(tabs)/settings.tsx` - Enhanced error reporting, RWC prefix logic, and mobile number formatting
- `app/clients.tsx` - Fixed next visit display synchronization with focus refresh
- `utils/account.ts` - Fixed double RWC prefix display issue 
- `docs/code-changes.md` - Documentation update

**Impact**: Significantly improves CSV import debugging experience, eliminates account number formatting issues, ensures proper UK mobile number formatting, and keeps client list display synchronized with job updates.

---

## 2025-01-24 - Comprehensive CSV Import Enhancement & Flexible Visit Frequency System

### Major Features Added:
1. **Enhanced CSV Import Fields**: Added support for "Runsheet Note" and "Account notes" columns in CSV imports
2. **Automatic RWC Prefix**: Account numbers from CSV automatically get "RWC" prefix if not already present
3. **Flexible Visit Frequency**: Complete overhaul of visit frequency system to support any number of weeks (not just 4, 8, one-off)
4. **Updated Client Forms**: Add-client form now uses text input + checkbox for flexible frequency input
5. **Enhanced Quote System**: Quote forms support expanded frequency options (4, 8, 12, 16, 24, 52 weekly, one-off, Other)

### Implementation Details:

**CSV Import Enhancements (`app/(tabs)/settings.tsx`)**:
- Added "Runsheet Note" field mapping for direct import to client.runsheetNotes
- Added "Account notes" field with automatic attribution ("CSV Import", system authorId)
- Implemented automatic RWC prefix addition for account numbers
- Enhanced visit frequency processing to accept any positive number or "one-off"
- Updated all three import paths (web CSV, mobile CSV, mobile Excel) with consistent logic
- Made Email and Mobile Number optional fields for CSV import

**Flexible Visit Frequency System**:
- **Client Forms**: Replaced hardcoded dropdowns with text input + one-off checkbox
- **Quote System**: Extended frequency options and added "Other" with custom text input
- **Type System**: Updated QuoteLine types to support customFrequency field
- **Job Generation**: Verified existing logic already handles any numeric frequency correctly

**Updated Example Data (`scripts/generate-clients.js`)**:
- Generated new example CSV with 200 clients showing varied frequencies (4, 6, 8, 12, 16, 24, one-off)
- Included sample runsheet notes (every 5th client) and account notes (every 7th client)
- Demonstrates the full flexibility of the new import system

### Technical Improvements:
- **Backward Compatibility**: All changes maintain compatibility with existing client data
- **Data Validation**: Enhanced validation for flexible frequency input across all forms
- **User Experience**: Improved form UI with clear frequency input and one-off toggle
- **Import Robustness**: Better error handling and data sanitization in CSV processing

### Files Modified:
- `app/(tabs)/settings.tsx` - Core CSV import enhancements
- `app/add-client.tsx` - Flexible frequency form with text input + checkbox
- `app/quotes.tsx` - Extended frequency options with custom input
- `app/runsheet/[week].tsx` - Enhanced quote progression modal frequencies
- `contexts/QuoteToClientContext.tsx` - Updated QuoteLine type
- `scripts/generate-clients.js` - New example CSV with enhanced fields
- `docs/example-clients.csv` - Generated with new format

**Breaking Changes**: None - all changes are backward compatible

**Impact**: This enhancement significantly improves CSV import capabilities and visit frequency flexibility, supporting any business model (weekly, bi-weekly, monthly, quarterly, etc.) while maintaining full compatibility with existing data.

---

## 2025-01-21 - Critical Team Member System Fixes

- **Issues Fixed**: Multiple critical issues with team member system after Firestore migration:
  - Removed members were reappearing when navigating away/back
  - Owner had a remove button (which shouldn't exist)
  - Members couldn't see owner's data (permissions broken)
  - Members could access restricted screens (team management)
  - Member UI buttons not updating correctly
  - First navigation from home screen redirected back
  
- **Root Causes**:
  1. **Member removal**: Only deleted member record, didn't reset user's accountId
  2. **UI logic**: Remove button shown for all members including owner
  3. **Permissions**: Member's accountId not properly set or user doc missing
  4. **State management**: Settings screen not refreshing on focus
  5. **Navigation**: Race condition with async permission checks
  
- **Fixes Implemented**:
  1. **Created removeMember cloud function**: Properly handles member removal, resets their accountId and claims
  2. **Updated UI logic**: Hide remove button for owners
  3. **Enhanced listMembers**: Ensures owner record always exists
  4. **Added useFocusEffect**: Settings screen reloads member status on focus
  5. **Navigation debounce**: Prevents immediate redirects from home screen
  6. **Improved error handling**: Better user document creation/update logic

- **Result**: Team member system now works correctly:
  - Members properly see owner's data based on permissions
  - UI correctly reflects member vs owner status
  - No more reappearing removed members
  - Smooth navigation without redirects

**Files modified**:
- functions/index.js (added removeMember, updated listMembers)
- services/accountService.ts (updated removeMember to use cloud function)
- app/(tabs)/team.tsx (hide remove button for owners)
- app/(tabs)/settings.tsx (added useFocusEffect to reload member status)
- app/(tabs)/index.tsx (added navigation debounce)
- core/session.ts (removed debug logs)

---

## 2025-01-21 - Critical Bug Fixes for Navigation, Permissions, and Payments

### Issues Fixed:
1. **Navigation Bug**: Users were being redirected back to home screen after logging in and navigating to another page
2. **Archive Client Permissions**: Members with viewClients permission couldn't archive clients
3. **Payment Permissions Error**: "Missing or insufficient permissions" error when adding payments

### Root Causes:
1. **Navigation**: `onAuthStateChanged` was re-triggering on every pathname change, causing unwanted redirects
2. **Archive**: No permission checks in place for archive functionality 
3. **Payments**: `add-payment.tsx` wasn't filtering clients by ownerId

### Solutions Implemented:
1. **Navigation Fix**: Separated auth listener from pathname-based redirect logic in `app/_layout.tsx`
   - Auth listener runs only once on mount
   - Redirect logic checks both auth state and pathname in separate effect
   - Prevents race conditions and unwanted redirects

2. **Archive Permissions**: Added comprehensive permission checking in `app/(tabs)/clients/[id].tsx`
   - Verifies user session before archiving
   - Checks if member has viewClients permission
   - Added detailed error messages for permission issues
   - Better logging for debugging

3. **Payment Permissions**: Updated `app/add-payment.tsx` to properly filter clients
   - Added `getDataOwnerId()` call to get correct account owner
   - Filter clients query by ownerId
   - Proper error handling if ownerId cannot be determined

**Files modified**:
- app/_layout.tsx
- app/(tabs)/clients/[id].tsx  
- app/add-payment.tsx

---

## 2025-01-21 - Fixed Vehicle Modal, DatePicker Web Support, and Quote Permissions

### Issues Fixed:
1. **Vehicle Modal Missing Close Button**: Added a close button (×) to the vehicle management modal header
2. **DateTimePicker Not Supported on Web**: Implemented platform-specific date picker for job moving in runsheet
3. **Quote Creation Permission Error**: Fixed missing ownerId field causing Firestore permission errors

### Solutions:
1. **Vehicle Modal**: 
   - Added modal header with close button
   - Improved modal structure and styling
   - Files: `app/(tabs)/team.tsx`

2. **Web DatePicker**:
   - Created web-specific modal with HTML date input
   - Kept native DateTimePicker for mobile platforms
   - Fixed vh units that aren't supported in React Native
   - Files: `app/runsheet/[week].tsx`

3. **Quote Permissions**:
   - Added ownerId field to quote documents on creation
   - Updated all quote fetching to filter by ownerId
   - Ensures proper Firestore rule compliance
   - Files: `app/quotes.tsx`

**Files modified**:
- app/(tabs)/team.tsx
- app/runsheet/[week].tsx
- app/quotes.tsx

---

## 2025-01-21 - Comprehensive Notes System Overhaul

### Features Added:
1. **Quote Notes Field**: Added a notes field to the new quote form that persists through the quote lifecycle
2. **Separated Note Types**: Distinguished between "runsheet notes" (appear on job ! icon) and "account notes" (timestamped history)
3. **Account Notes System**: Implemented running notes list with author tracking and timestamps
4. **Quote-to-Client Notes Transfer**: Quote notes automatically become first account note when creating client

### Implementation Details:

1. **Quote Notes**:
   - Added notes field to quote form and data model
   - Notes display in quote cards throughout lifecycle (scheduled → pending → complete)
   - Files: `app/quotes.tsx`

2. **Note Type Separation**:
   - Renamed client.notes to client.runsheetNotes for clarity
   - Added migration logic for existing notes
   - Updated runsheet to use both legacy and new field names
   - Files: `types/client.ts`, `app/runsheet/[week].tsx`, `app/(tabs)/clients/[id].tsx`

3. **Account Notes**:
   - New AccountNote type with id, date, author, authorId, and text
   - Account notes display chronologically with author and timestamp
   - Modal for adding new notes with automatic user attribution
   - Files: `types/client.ts`, `app/(tabs)/clients/[id].tsx`

4. **Quote Transfer**:
   - When creating client from quote, notes become first account note
   - Author shown as "Imported from Quote" with system authorId
   - Files: `app/add-client.tsx`

**Files modified**:
- types/client.ts
- app/quotes.tsx
- app/(tabs)/clients/[id].tsx
- app/runsheet/[week].tsx
- app/add-client.tsx

---

## 2025-01-21 - Fixed Team Member UI and Permission Issues After Invite Acceptance

- **Issue**: After accepting team invites, the UI was not updating correctly:
  - "Join owner account" button remained visible for members
  - Members could see "Team Members" button (owner-only feature)
  - "Leave Team" button wasn't showing for members
  - UI didn't immediately reflect member status after accepting invite
- **Root Cause**: 
  - Settings screen wasn't properly checking if user was a member of another account
  - Firebase auth token wasn't being refreshed after accepting invites
  - Leave team function wasn't properly resetting user's accountId
- **Fix**:
  1. Updated Settings screen to track `isMemberOfAnotherAccount` state
  2. Fixed button visibility logic to show/hide based on member status:
     - Hide "Join owner account" for members of other accounts
     - Hide "Team Members" for non-owners
     - Show "Leave Team" only for members of other accounts
  3. Added token refresh after accepting invites to immediately update UI
  4. Enhanced `leaveTeamSelf` to reset accountId and refresh claims
- **Result**: 
  - UI now correctly reflects member status immediately after accepting invite
  - Members only see appropriate buttons and screens
  - Leave team properly resets user to their own account

**Files modified**:
- app/(tabs)/settings.tsx
- app/enter-invite-code.tsx
- app/set-password.tsx
- services/accountService.ts

---

## 2025-07-15 - Hotfix: Team Management Regression

- **Issue**: Team members page was failing to load due to a regression from the Firebase migration. `refreshClaims` function was failing, preventing auth claims from being set.
- **Root Cause**: A Firestore index was missing for the `members` collection group query within the `refreshClaims` function.
- **Fix**: Added the required `COLLECTION_GROUP` index to `firestore.indexes.json` and deployed it. This resolves the 500 error on `refreshClaims` and subsequent 401 errors on `listMembers` and `listVehicles`.

**Files modified**: `firestore.indexes.json`

---

## 2025-07-15 – Invite Member Email Cloud Function Fix 📧🔧
• **Problem**: The `sendTeamInviteEmail` Firebase Cloud Function had a hardcoded URL for the invitation link, and was missing a clear way to handle different deployment environments (local, production).
• **Fix**: Modified the Cloud Function in `functions/index.js` to use a new `APP_URL` environment variable to construct the invite link. This makes the function portable across environments. A default of `http://localhost:8081` is used if the variable is not set.
• **Action Required**: To make the invite email system fully functional, two environment variables **must be set** for the `sendTeamInviteEmail` Cloud Function in your Google Cloud project:
    - `RESEND_KEY`: Your API key for the Resend email service.
    - `APP_URL`: The public base URL of your deployed application (e.g., `https://your-app.vercel.app`).
• **Result**: The function is no longer dependent on hardcoded values and can be configured for any environment.

**Files modified**: `functions/index.js`.

---

## 2025-01-21 – Invite Member Email Configuration FIXED ✅
• **RESOLVED**: Fixed invite member emails failing due to unverified domain configuration.  
• **Root Cause**: Edge function was falling back to hardcoded `tgmwindowcleaning.co.uk` domain when `EMAIL_FROM` environment variable was missing, causing Resend API to reject emails with "domain not verified" error.  
• **Configuration Fix**: Updated `EMAIL_FROM` secret in Supabase to use verified `guvnor.app` domain (`no-reply@guvnor.app`).  
• **Code Enhancement**: Replaced silent fallback behavior with explicit validation - function now throws clear errors when required environment variables (`EMAIL_FROM`, `RESEND_API_KEY`) are missing.  
• **Fail-Fast Implementation**: Added startup validation to prevent configuration regressions and ensure proper error reporting.  
• **Result**: Team member invitations now send emails successfully and provide clear error messages when misconfigured.  

**Files modified**: `supabase/functions/invite-member/index.ts`.

---

## 2025-01-21 – Team Invitation Duplicates FIXED ✅
• **RESOLVED**: Fixed duplicate team member invitations appearing in UI without email being sent.  
• **Root Cause**: Race condition between Supabase edge function and Firestore fallback, plus missing duplicate prevention.  
• **UI Fix**: Added double-tap prevention and improved error handling with proper loading states.  
• **Edge Function Fix**: Changed from `upsert` to `insert` with explicit duplicate checking in Supabase members table.  
• **Client Logic Fix**: Added pre-invitation duplicate checking and smarter fallback that detects partial edge function success.  
• **Result**: Team invitations now work reliably - no more duplicates, proper error messages, and email delivery confirmation.  
• **Enhanced Logging**: Added comprehensive console logging to debug invitation flow issues.  

**Files modified**: `app/(tabs)/team.tsx`, `services/accountService.ts`, `supabase/functions/invite-member/index.ts`.

---

## 2025-01-21 – Password Reset Flow FINALLY RESOLVED ✅🥕  
• **FINAL FIX**: Eliminated race condition between password reset flow detection and signup flow fallback.  
• **Root Cause**: Even with correct routing and token handling, signup verification fallback was still overriding password reset detection.  
• **Solution**: Completely removed problematic signup flow fallback logic when on `/set-password` route.  
• **Key Change**: Now defaults to password reset form when user has session on `/set-password` route, eliminating the "Thank you! Your account has been verified" false positive.  
• **Enhanced Error Handling**: Added proper Supabase error parsing for expired tokens with user-friendly messages.  
• **Result**: Password reset flow now works 100% reliably - users see the actual password reset form, not signup verification messages.  
• **Testing**: Confirmed with fresh tokens (<1 minute old) that flow detection works correctly every time.

**Files modified**: `app/set-password.tsx` - removed signup fallback detection, improved error handling.

---

## 2025-01-17 – Password Reset 404 RESOLVED ✅
• **RESOLVED**: Fixed password reset 404 errors by implementing proper static routing configuration for Expo web builds.  
• **Root Cause**: Expo static builds don't handle client-side routing properly - routes like `/set-password` returned 404.  
• **Solution**: Added `vercel.json` with SPA routing redirects and `public/_redirects` fallback configuration.  
• **Key Fix**: All routes now properly serve `index.html` allowing client-side routing to handle the actual navigation.  
• **Updated Configuration**: Enhanced `app.json` with `publicPath` and `assetBundlePatterns` for better static build handling.  
• **Result**: Password reset flow now works end-to-end - users can click email links and successfully reset passwords.  
• **Testing**: Verify by requesting password reset and clicking email link - should now load set-password page instead of 404.

**Files modified**: `vercel.json` (new), `public/_redirects` (new), `app.json`, routing configuration.

---

## 2025-01-17 – Password Reset Troubleshooting 🔧❌
• **EXTENSIVE** password reset debugging and enhancement work performed.  
• **Enhanced token handling**: Updated both React Native and Next.js apps to properly handle hash-based password reset tokens (`#access_token=...&type=recovery`).  
• **Session conflict resolution**: Added logic to clear existing sessions when processing password reset flows.  
• **URL configuration fixes**: Corrected Supabase redirect URLs from `www.guvnor.app` to `guvnor.app` in dashboard settings.  
• **Auth guard improvements**: Enhanced `_layout.tsx` to prevent interference with password reset flows.  
• **Dual-format support**: Made `/set-password` handle both query parameters and hash-based tokens.  
• **Cross-platform compatibility**: Fixed both mobile and web password reset implementations.  
• **RESOLVED ABOVE**: 404 errors fixed with proper routing configuration.  

**Files modified**: `app/set-password.tsx`, `web/src/app/set-password/page.tsx`, `app/forgot-password.tsx`, `web/src/app/forgot-password/page.tsx`, `app/_layout.tsx`, Supabase dashboard configuration.

---

## 2025-07-08 – Round Order Manager 🔄
• Replaced custom FlatList with **@quidone/react-native-wheel-picker** on mobile; arrow-key navigation on web.  
• Complete logic rewrite: INSERT / MOVE / ARCHIVE maintain a continuous, gap-free sequence.  
• Added batch updates to guarantee no duplicate `roundOrderNumber`.

File: `app/round-order-manager.tsx`.

---

## 2025-07-04 – CSV Import (Web) 📑
• Rewritten file-picker flow for web; replaced `Alert.alert` prompts with standard `window.alert/confirm`.  
• Example CSV regenerated (200 rows, dd/mm/yyyy).  
• Import succeeds and creates clients; TODO: auto-generate jobs after import.

Files: `app/(tabs)/settings.tsx`, `scripts/generate-clients.js`, `docs/example-clients.csv`.

---

## 2025-07-03 – Vehicles, Rota & Capacity-Aware Runsheets 🚐🗓️
Phase 1 – Vehicle CRUD + member assignment.  
Phase 2 – **Rota** availability screen (7-day grid, on/off/n/a).  
Phase 3 – Runsheet groups jobs by **vehicle capacity**: effective cap = `dailyRate × (availableCrew / totalCrew)`.

Fallback: if no vehicles/rota configured the runsheet reverts to legacy list view.

Key files: `services/vehicleService.ts`, `services/rotaService.ts`, `app/rota.tsx`, `app/runsheet/[week].tsx`.

---

## 2025-07-01/02 – Runsheet Access & Member Removal
• Fixed incorrect `router.replace` path and removed redundant PermissionGate – runsheet now always loads for owners.  
• Home buttons render dynamically from **session perms**; members see only pages they can access.  
• Removing a member fully cleans up Firestore + Supabase rows and resets their JWT claims; *Leave Team* self-service button added (pending further backend edge-function work).

Files: `app/runsheet.tsx`, `app/(tabs)/index.tsx`, `services/accountService.ts`, `supabase/functions/set-claims/index.ts`.

---

## 2025-01-30 – Invitation & Data Ownership System ✅
• Standardised env vars (`SUPABASE_SERVICE_ROLE_KEY`), added `members` table migration.  
• Invitation flow (edge functions + Resend) now operates end-to-end.  
• Introduced `getDataOwnerId()` – members now query owner's data across services/pages.  
• Added Supabase→Firestore sync for team list.

Main files: `supabase/functions/*`, `services/accountService.ts`, `core/supabase.ts`.

---

## 2025-01-15 – Build Tracking & Password Reset Fix 🔧
• **Build indicator finally working** – implemented automated git commit hash injection via `prebuild` script.  
• Fixed password reset flow redirect URL – was pointing to homepage instead of `/set-password`.  
• Added debug console logging to auth state changes for troubleshooting.  
• Build ID now updates automatically on every deployment, showing current commit hash.

Files: `app/login.tsx`, `app/forgot-password.tsx`, `app/_layout.tsx`, `scripts/update-build-id.js`, `package.json`.

---

## 2025-07-10 – UX & Auth Polishing ✨
• Added build indicator on Login screen (`Build: <commit>` – uses NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA).  
• Home screen now shows logged-in user email.  
• Auth guard updated so `/set-password` & `/forgot-password` stay accessible after session creates – fixes reset-password redirect loop.  
• Duplicate team-member/rota rows fixed: placeholder Firestore doc deleted once invite accepted.  
• Registration form gains confirm-password field with paste blocked, validation added.  
• Forgot-password flow implemented (`/forgot-password` screen + Supabase resetPasswordForEmail).  
Files: `app/_layout.tsx`, `app/login.tsx`, `app/(tabs)/index.tsx`, `app/register.tsx`, `app/forgot-password.tsx`, `services/accountService.ts`.

---

## 2025-01-16 – Build Tracking & Password Reset Fix 🔧
• **Build indicator finally working** – implemented automated git commit hash injection via `prebuild` script.  
• Fixed password reset flow redirect URL – was pointing to homepage instead of `/set-password`.  
• Added debug console logging to auth state changes for troubleshooting.  
• Build ID now updates automatically on every deployment, showing current commit hash.

Files: `app/login.tsx`, `app/forgot-password.tsx`, `app/_layout.tsx`, `scripts/update-build-id.js`, `package.json`.

---

## 2025-07-10 – Redirect After Payment Save

## Summary
Implemented logic so that after saving a payment from the 'Create Payment from Job' window, the user is redirected to the screen they were on before this one. This is achieved by passing a 'from' parameter when navigating to the add-payment screen and using it for redirection after saving. Fallback to previous logic if 'from' is not provided.

## Files Changed
- app/add-payment.tsx
- app/payments-list.tsx
- app/(tabs)/clients/[id].tsx
- app/completed-jobs.tsx
- app/client-balance.tsx

## Details
- Updated all navigation to `/add-payment` to include a `from` parameter representing the current route.
- Modified the save payment logic in `add-payment.tsx` to check for the `from` parameter and redirect the user back to that route after saving, otherwise fallback to the previous logic.
- Ensured compatibility for both web and native platforms.

---

## 2025-07-14  
- Documented Firebase configuration now supplied via Vercel environment variables  
  (`EXPO_PUBLIC_FIREBASE_*`).  No runtime code was changed; this commit is only to
  force a new deployment and confirm the build succeeds after the env-vars update.

### 🔧 Hotfix (same day)
- Added `FIREBASE_CONFIG` constant in `config.ts` (and example file) so web builds
  receive the injected env-vars and Firebase initialises correctly. Fixes Vercel
  build error: `Firebase: Need to provide options (app/no-options)`.

### 🔧 Follow-up validation
- Updated both `core/firebase.ts` and `core/firebase.web.ts` to validate **all** six
  Firebase config fields at startup and throw a descriptive error listing any
  missing keys. This provides faster, clearer feedback during CI builds.

### 🐛 Build debug
- Augmented `scripts/update-build-id.js` to log presence (not values) of the six
  `EXPO_PUBLIC_FIREBASE_*` variables during the **prebuild** step. This will help
  verify whether Vercel is actually injecting them.

### 🔧 Env-var linkage note  
Linked the six `EXPO_PUBLIC_FIREBASE_*` variables to the **RoundManagerApp** project in Vercel so they propagate to build-time processes.

---

## 2025-07-14 – Initial Firestore Security Rules 🔒
• Added `firestore.rules` with per-user access control for the `users/{uid}` document.
• Provides minimal permissions required for registration write to succeed after Firebase auth.

Files: `firestore.rules`.

---

## [DATE] Multi-line Quote Support
- Refactored quote creation modal and data model (`app/quotes.tsx`) to support multiple quote lines per client.
- Each quote can now have multiple lines, each with service type, frequency, value, and notes.
- Updated Quote type and UI to allow adding/removing lines.
- Updated context (`contexts/QuoteToClientContext.tsx`) to support passing an array of quote lines.
- Preserved backward compatibility for existing single-line quotes.
- Updated all relevant UI to display all quote lines.

---

(Last condensed: 2025-07-08)

- Updated `app/quotes.tsx`:
  - Implemented a two-column layout for the Quotes screen on web (Scheduled/Pending left, Complete right).
  - Added a search input to the Complete section, filtering by name and address.
  - On mobile, retained the original stacked layout with the new search for Complete.
  - The UI is now responsive and adapts based on platform.

## 2025-07-14 – Build retry
Triggered a rebuild to verify Vercel now receives the `EXPO_PUBLIC_FIREBASE_*` variables after updating them to "All Environments" in the dashboard. No functional code changes.

- Added verification email sending in `app/register.tsx` (Firebase `sendEmailVerification`).

- Added `/users/{uid}` rule to Firestore security rules so registration can write user doc.

- Switched `app/login.tsx` from Supabase to Firebase `signInWithEmailAndPassword` with email-verification check and detailed error handling.

- Migrated HomeScreen `(tabs)/index.tsx` to Firebase auth & Firestore; shows full menu again.

- HomeScreen now waits for Firebase auth state before building buttons to avoid blank screen on fast page load.

- Settings logout now signs out via Firebase `signOut` (plus Supabase fallback) so user can log out on new auth system.

---
## 2025-07-14 – Logout Redirect Fix 🔓
• **Problem**: Clicking "Log Out" on Settings redirected to `/login` before Firebase finished clearing the session. Root auth guard saw an active session and bounced back to `/`, leaving the user stuck logged in.
• **Fix**: Removed manual `router.replace('/login')` call. We now rely on `onAuthStateChanged` in `app/_layout.tsx` to detect sign-out and route unauthenticated users to `/login`, eliminating the race condition.
• **Files modified**: `app/(tabs)/settings.tsx`.

---
## 2025-07-14 – Registration Requires Email Verification 📧
• **Problem**: Newly registered users were signed in immediately and routed to the home page, skipping email verification.
• **Fix**: After sending the verification email and creating the Firestore user doc, the app now signs the user out and redirects them to `/login` with instructions to verify their email.
• **Files modified**: `app/register.tsx`.

---
## 2025-07-14 – Confirm Password + Firebase Reset Email
• **Registration UX**: Added *Full Name* and *Contact Number* fields, plus Confirm Password (paste blocked on web) with validation to ensure all fields are completed and passwords match.
• **Forgot Password**: Switched to Firebase `

---
## 2025-07-14 – Email Sending Flow Consolidated ✉️
• **Auth-Related Mail** (verification & password reset) now uses Firebase's built-in templates. Sender address updated in Firebase console to `noreply@guvnor.app` – allow 24-48 h for DNS propagation.
• **Team Invitations** continue to be sent via Resend from the Supabase edge function `invite-member`. Environment variables `EMAIL_FROM` & `RESEND_API_KEY` must be configured in Supabase.
• No other parts of the codebase reference Resend.

---

## 2025-01-17 – Quote Modal Consistency & Notes Display 📋
• **Unified quote modals**: Made the "Progress to Pending" modal in quotes screen match the nicer runsheet version
• **Added quote notes display**: Top-level quote notes are now shown in the progress modal
• **Improved UI consistency**: Both modals now have:
  - Transparent background overlay
  - Rounded white content box
  - Scrollable content area
  - Better styled input fields with labels
  - "Add Another Line" button functionality
  - Consistent button text ("Save & Progress" instead of just "Save")

**Issue**: 
- Modal for progressing quotes was different between runsheet and quotes screens
- Quote notes weren't visible when progressing to pending status

**Resolution**: 
- Replaced the simple modal in quotes.tsx with the enhanced version from runsheet
- Added a dedicated section to display quote notes at the top of the modal
- Removed unused `detailsForm` state

Files: `app/quotes.tsx`

---

## 2025-01-17 – Firebase Permission Errors Fix 🔒
• Updated Firestore security rules to handle edge cases where documents might be missing `ownerId` field
• Fixed `hasResourceAccess` and `hasCreateAccess` functions to include fallback checks
• Enhanced `completedWeeks` collection rules to handle multiple document ID formats and field structures
• Added backward compatibility for documents created with different structures
• Fixed inconsistent `completedWeeks` document ID format in client details view
• Ensured new `completedWeeks` documents include both `accountId` and `ownerId` fields

**Round 2 fixes**:
• Simplified Firestore rules to use `allow read` which covers both get and list operations
• Added proper member deletion permissions for leave team functionality
• Fixed member write permissions to allow members to delete their own record
• Removed incorrect `canQueryByOwnerId` function that was causing rule compilation issues
• Added composite Firestore indexes for common queries (jobs by ownerId+scheduledTime, jobs by ownerId+status)

**Round 3 fixes**:
• Separated `list` and `get` operations in Firestore rules
• For collection queries (list), only check if user is signed in - the query filters will handle access control
• For document reads (get), check proper resource access permissions
• This fixes the "Missing or insufficient permissions" error when querying collections with filters

**Issue**: Users were getting "Missing or insufficient permissions" errors when:
- Viewing client accounts (fetching service history)
- Loading runsheet
- Deleting scheduled quotes
- Members trying to leave team
- Archiving clients

**Resolution**: 
- Made Firestore rules more robust by checking for field existence before accessing them
- Fixed document ID inconsistency: `completedWeeks` documents now consistently use `${ownerId}_${date}` format
- Added proper `accountId` and `ownerId` fields to new documents for rule validation
- Allowed members to delete their own member records when leaving a team
- Simplified read permissions to properly handle collection queries

Files: `firestore.rules`, `firestore.indexes.json`, `app/(tabs)/clients/[id].tsx`, `app/runsheet/[week].tsx`

---

## 2025-01-21 – Quote Notes Editing Enhancement 📝
• **Issue**: Quote notes were not visible or editable in the runsheet modal when progressing quotes to pending
• **Issue**: Line-level notes were emphasized over overall quote notes

**Changes made**:
• **Runsheet Modal**: Added editable quote notes field at the top of the "Progress Quote to Pending" modal
• **Quotes Screen Modal**: Updated to make quote notes editable (previously read-only)
• **Consistent Experience**: Both modals now allow users to view and edit the overall quote notes
• **Data Persistence**: Quote notes are now properly saved when progressing to pending status from either location

**Implementation details**:
• Added `quoteData` state to store full quote information in runsheet
• Updated `handleProgressToPending` to fetch and store quote notes
• Added editable TextInput for quote notes in both modals
• Updated save handlers to persist edited quote notes to Firestore

Files: `app/runsheet/[week].tsx`, `app/quotes.tsx`

---

## 2025-01-21 – Collapsible Completed Quotes 🎯
• **Issue**: Completed quotes were showing all details, making the list lengthy and hard to scan
• **Request**: Collapse completed quotes to show only the address, expandable to show full details

**Changes made**:
• **Collapsible State**: Added `collapsedQuotes` state to track which completed quotes are collapsed
• **Address-Only View**: When collapsed, completed quotes show only the address in a larger font
• **Click to Toggle**: Clicking on a completed quote toggles between collapsed/expanded views
• **Visual Indicators**: Added arrow indicators (▶/▼) to show collapsed/expanded state
• **Smart Layout**: Action buttons (delete) only show when expanded to keep the interface clean
• **Auto-Collapse**: Completed quotes are automatically collapsed when first loaded for a cleaner initial view
• **Visual Distinction**: Completed quotes have a subtle green background to distinguish them

**Implementation details**:
• Added `collapsedQuotes` Set state to track collapsed quote IDs
• Modified `QuoteCard` component to check if quote is completed and in collapsed set
• Added `toggleCollapse` function to add/remove quote IDs from collapsed set
• Wrapped quote content in Pressable for click handling on completed quotes
• Conditional rendering based on `isCollapsed` state
• Updated `useEffect` to auto-collapse completed quotes on initial load
• Added green-tinted background color for completed quote cards

Files: `app/quotes.tsx`

---

## 2025-01-21 – First-Time Setup Modal 🚀
• **Issue**: New users had no guidance on initial setup and configuration
• **Request**: Add a first-time setup modal that asks about invite codes, working days, vehicle info, and daily limits

**Changes made**:
• **Setup Modal**: Created a new modal that appears when users log in for the first time
• **Three-Step Process**: 
  - Step 1: Ask if they have an invite code to join an organization
  - Step 2: Select default working days (if creating own organization)
  - Step 3: Enter vehicle details and daily turnover limit
• **Default Rota**: Automatically creates 52 weeks of rota entries based on selected working days
• **Vehicle Creation**: Creates a vehicle record with registration and daily limit
• **Navigation**: Routes users to invite code screen if they have one, or completes setup

**Updates based on feedback**:
• Changed title to "Welcome to Guvnor!"
• Changed button text to "No, continue without"
• Combined vehicle name and registration into single field
• Fixed navigation delay after setup completion
• Creates member record with vehicle assignment and daily rate
• Automatically assigns the created vehicle to the user

**Implementation details**:
• Created `FirstTimeSetupModal` component with multi-step wizard interface
• Added `firstTimeSetupCompleted` flag to user documents
• Added fields: `defaultWorkingDays`, `vehicleName`, `dailyTurnoverLimit`
• Modified home screen to check for first-time users and show modal
• Updated invite code flow to mark setup as complete when joining a team
• Automatically populates rota for the next 52 weeks based on working day preferences
• Creates member record with vehicle assignment and daily rate for proper team screen integration

Files: `components/FirstTimeSetupModal.tsx`, `app/(tabs)/index.tsx`, `app/enter-invite-code.tsx`

---

## 2025-01-23 – First-Time Setup UX Improvements 🎨
• **Issue**: Vehicle field placeholder text was confusing and setup completion had poor UX
• **Request**: Update placeholder text and fix navigation after setup completion

**Changes made**:
• **Vehicle Placeholder**: Changed from "e.g., White Transit Van or AB21 CDE" to "eg. registration, white transit, bicycle"
• **Setup Completion**: Fixed the issue where button stayed grey for 30 seconds after completion
  - Changed from alert with OK button to auto-dismissing success message
  - Modal now automatically closes and navigates after 1.5 seconds
  - Prevents confusion where button returns to blue while waiting for user action

**User Experience**:
• Clearer placeholder text showing more diverse vehicle examples
• Smooth transition after setup - success message appears briefly then auto-navigates
• No more waiting for user to click OK - automatic progression to home screen

Files: `components/FirstTimeSetupModal.tsx`

---

## 2025-01-23 – Quotes Screen Mobile Layout Fix 📱
• **Issue**: On mobile web browsers, the "Completed" quotes section wasn't visible as it was displayed in a side column
• **Request**: Stack the sections vertically on mobile instead of side-by-side columns

**Changes made**:
• **Added responsive layout**: Imported `useWindowDimensions` hook to detect screen width
• **Breakpoint logic**: Two-column layout only shows on web when screen width > 768px
• **Mobile experience**: All sections (Scheduled, Pending, Complete) now stack vertically on mobile browsers
• **Centered content**: Added `marginHorizontal: 'auto'` to center containers on larger screens

**Result**: Mobile web users can now see all quote sections by scrolling vertically

**Files modified**: `app/quotes.tsx`

---

## 2025-01-23 – Team Invitation Flow Fix 🔧
• **Issue**: "Domain not allowlisted by project" error when inviting team members who haven't registered yet
• **Root cause**: Firebase function was trying to create user accounts immediately, which failed for non-allowlisted domains

**Changes made**:
• **Firebase function update**: Modified `inviteMember` to:
  - No longer creates Firebase user accounts upfront
  - Stores invitation in Firestore with `uid: null` and `status: 'invited'`
  - Sends email with invite code and registration instructions
• **Email template**: Clear instructions for new users to register first, then enter code
• **Team screen UI**: 
  - Shows "Pending Invitation" badge for invited members
  - Hides vehicle/permissions controls until invitation accepted
  - Shows "Cancel Invitation" instead of "Remove" for pending invites

**New flow**:
1. Owner invites any email address
2. Recipient gets email with 6-digit code
3. Recipient registers account (if needed)
4. Recipient enters code to join team
5. Team screen updates to show active member

**Result**: Team invitations now work for any email address, regardless of registration status

**Files modified**: `functions/index.js`, `app/(tabs)/team.tsx`

---

## 2025-01-23 – Cancel Invitation Fix 🔧
• **Issue**: "Cancel Invitation" button would remove pending invitations from the UI temporarily, but they would reappear after refresh/navigation
• **Root cause**: `removeMember` function was designed for active members (using UID as document ID) but pending invitations use invite codes as document IDs

**Changes made**:
• **Firebase function fixes**:
  - Updated `listMembers` to return both `docId` (document ID) and `uid` fields
  - Modified `removeMember` to handle both active members and pending invitations
  - For pending invitations: deletes by invite code, no user document updates
  - For active members: deletes by UID, resets user document and clears claims
• **Frontend updates**:
  - Updated `MemberRecord` type to include `docId` field
  - Modified team screen to use correct identifier when removing members
  - Improved confirmation messages ("cancel this invitation" vs "remove this member")

**Technical details**:
- Pending invitations: `docId` = invite code, `uid` = null
- Active members: `docId` = user UID, `uid` = user UID
- `removeMember` now properly handles both cases

**Result**: Cancel invitation now permanently removes pending invitations from Firestore

**Files modified**: `functions/index.js`, `app/(tabs)/team.tsx`, `services/accountService.ts`

---

## 2025-01-27 - Performance Optimization: Client List Next Visit Loading

### Bug Fix:
**Fixed Performance Issue with Next Visit Display**: Resolved major performance bottleneck in clients list where "Next Visit: N/A" was showing despite jobs existing.

### Root Cause:
The `fetchNextVisits` function was making individual Firebase queries for each client in a sequential loop. With 529 clients, this meant 529 separate database queries, causing:
- Extremely slow loading times
- Component rendering before all queries completed
- "N/A" displaying while queries were still running

### Solution:
**Optimized Query Strategy (`app/clients.tsx`)**:
- Replaced individual client queries with single bulk query
- Fetches ALL pending/scheduled/in_progress jobs for the data owner at once
- Groups results by clientId in memory to find next visit dates
- Reduces 529 database queries to just 1 query

### Performance Impact:
- **Before**: 529 sequential Firebase queries (very slow)
- **After**: 1 Firebase query + in-memory processing (fast)
- **Result**: Next Visit data now loads immediately and displays correctly

### Technical Implementation:
- Single query: `where('ownerId', '==', ownerId)` + `where('status', 'in', ['pending', 'scheduled', 'in_progress'])`
- In-memory grouping by clientId to find earliest future job date
- Maintains same logic for date calculation and formatting
- Improved error handling with fallback to empty state

**Files modified**: `app/clients.tsx`

---

## 2025-01-27 - Comprehensive Job Capacity Management System

### Major Feature: Automatic Job Redistribution Based on Team Capacity

**Problem Solved**: Runsheets were displaying jobs that exceeded the daily capacity limits of available team members, causing operational inefficiencies and overloading.

### Core Functionality:

**1. Capacity Calculation System**:
- Calculates daily capacity = sum of (available team members' daily turnover limits)
- Factors in team member availability from rota (on/off/n/a status)
- Real-time capacity monitoring per day within each week

**2. Intelligent Job Redistribution**:
- **Overflow Detection**: Identifies when jobs exceed daily capacity limits
- **Round Order Preservation**: Maintains routing efficiency by moving job blocks, not individual jobs
- **Sequential Spillover**: Excess jobs roll to next day, then next, until capacity allows
- **Week Boundary Respect**: Jobs never move to following weeks - stay within current week
- **Final Day Exception**: If all future days lack capacity, keeps overflow on final viable day

**3. Automated Triggers**:
- **Job Addition**: Triggers redistribution when new jobs are created (future weeks only)
- **Team Changes**: Triggers when daily turnover limits change
- **Availability Changes**: Triggers when rota availability is modified
- **Current Week Protection**: Auto-triggers skip current week to avoid disrupting active operations

**4. Manual Override**:
- **Current Week Refresh**: Manual button on runsheet for current week capacity redistribution
- **Visual Feedback**: Shows redistribution results, warnings, and job counts moved
- **Real-time Updates**: Automatically refreshes screen after redistribution

### Algorithm Logic:

```
For each day Monday-Sunday:
  If (current jobs value > daily capacity):
    Calculate overflow jobs (maintaining round order)
    For each subsequent day in week:
      If (target day has available capacity):
        Move jobs that fit into available capacity
        Update capacity calculations
      Else:
        Continue to next day
    If (last day OR no remaining capacity):
      Keep remaining jobs on current day (accept overflow)
```

### Key Constraints:

- **Round Order Maintenance**: Jobs move as coherent blocks to preserve routing efficiency
- **Week Boundaries**: No cross-week job movement - contains work within current week
- **Capacity Respect**: Only moves jobs when target days have sufficient capacity
- **Team Availability**: Only counts team members marked as 'on' in rota for capacity calculations

### Technical Implementation:

**New Service**: `services/capacityService.ts`
- `calculateDayCapacity()`: Daily capacity computation with team availability
- `redistributeJobsForWeek()`: Core redistribution algorithm with round order preservation
- `manualRefreshWeekCapacity()`: Current week manual refresh functionality
- `triggerCapacityRedistribution()`: Automated trigger system for future weeks

**Integration Points**:
- `services/jobService.ts`: Auto-trigger on job creation
- `services/accountService.ts`: Auto-trigger on daily rate changes
- `services/rotaService.ts`: Auto-trigger on availability changes
- `app/runsheet/[week].tsx`: Manual refresh UI and capacity management integration

**Performance Optimizations**:
- Batched Firebase updates for job redistributions
- Dynamic imports to avoid circular dependencies
- Error isolation - capacity failures don't break core operations
- Efficient capacity calculations with in-memory processing

### User Experience:

**Automated Operation**: System automatically redistributes jobs for future weeks without user intervention when:
- New jobs are added to the system
- Team member daily limits are modified
- Team availability changes in the rota

**Manual Control**: Users can manually apply redistribution to current week using the "Refresh Capacity" button, which provides:
- Detailed feedback on jobs moved
- Warning messages for overflow situations
- Immediate visual updates to runsheet layout

**Exception Handling**: System gracefully handles edge cases:
- Days with no available team members
- Weeks with insufficient total capacity
- Final day overflow situations

### Business Impact:

- **Operational Efficiency**: Prevents team overloading and ensures realistic daily schedules
- **Route Optimization**: Maintains round order for efficient job sequencing
- **Workload Balance**: Distributes work evenly across available team capacity
- **Proactive Management**: Automatic redistribution prevents capacity issues before they occur

**Files created**: `services/capacityService.ts`

**Files modified**: `app/runsheet/[week].tsx`, `services/jobService.ts`, `services/accountService.ts`, `services/rotaService.ts`

---

## Capacity Management Bug Fixes (2025-01-21)

### Issues Fixed:

**1. Job Distribution Logic Correction**:
- **Problem**: Excess jobs were being distributed to the first available day with capacity
- **Fix**: Changed algorithm to distribute excess jobs to the LAST available day with capacity
- **Impact**: Jobs now correctly overflow to Saturday (last available day) instead of Monday

**2. Current Week Auto-Application Prevention**:
- **Problem**: Rota availability changes were automatically triggering redistribution on current week
- **Fix**: Modified `rotaService.ts` to only trigger redistribution for future weeks
- **Impact**: Current week redistribution now only happens via manual "Refresh Capacity" button

### Technical Changes:

**`services/capacityService.ts`**:
- Modified `redistributeJobsForWeek()`

---

## 2025-01-28 - Historical Data CSV Import Functions

### New Features:
1. **Import Payments from CSV**: Added ability to import historical payment records
2. **Import Completed Jobs from CSV**: Added ability to import historical completed job records

### Implementation Details:

**Payment Import (`app/(tabs)/settings.tsx`)**:
- CSV Format: `Account Number, Date, Amount (£), Type, Notes`
- Validates RWC account numbers and maps to client IDs
- Supports payment types: cash, card, BACS/bank transfer, cheque (defaults to 'other' for unrecognized)
- Date parsing supports DD/MM/YYYY and YYYY-MM-DD formats
- Creates payment records with all existing payment functionality (notes, balance calculations, etc.)

**Completed Jobs Import (`app/(tabs)/settings.tsx`)**:
- CSV Format: `Account Number, Date, Amount (£)`
- Creates jobs with serviceId: "Historic Completed Service" for easy identification
- Jobs are created with status: 'completed' to immediately appear in completed jobs lists
- Uses client's address for propertyDetails field
- Integrates seamlessly with existing balance calculations

**Technical Improvements**:
- Reuses existing CSV import infrastructure (file pickers, validation, error reporting)
- Both functions support CSV and Excel files (.csv, .xlsx, .xls)
- Comprehensive error reporting showing specific rows that failed with reasons
- Account number validation with automatic RWC prefix addition if missing
- No duplicate checking per user requirements - allows multiple payments/jobs on same date
- Cross-platform support (web and mobile implementations)

### Files Modified:
- `app/(tabs)/settings.tsx` - Added handleImportPayments and handleImportCompletedJobs functions
- `services/paymentService.ts` - Imported createPayment function
- `docs/code-changes.md` - Documentation update

**Impact**: Enables bulk import of historical financial data, allowing users to quickly populate their system with past payments and completed jobs while maintaining full integration with existing features like balance calculations, client history, and reporting.

---

## 2025-01-18 - Unknown Payments Feature

### Summary
Added a new feature to handle payments with unmatched account numbers during CSV import. Instead of skipping these payments, they are now saved to a separate "unknownPayments" collection with import metadata for future reconciliation.

### Implementation Details:

**Unknown Payments Storage**:
- New Firestore collection: `unknownPayments`
- Stores all payment data plus import metadata (import date, filename, CSV row number, original account identifier)
- Payments with invalid account numbers (RWC numbers not in system, "unknwn", "x", etc.) are saved here

**Unknown Payments Screen (`app/unknown-payments.tsx`)**:
- New screen to view all unknown payments
- Search/filter by account identifier, amount, date, or notes
- Displays payment details and import metadata
- Accessible from accounts screen via new button

**Import Process Updates (`app/(tabs)/settings.tsx`)**:
- Modified `handleImportPayments` to separate unknown account payments from skipped ones
- Unknown payments are saved to `unknownPayments` collection instead of being skipped
- Import confirmation shows counts for regular payments, unknown payments, and skipped rows
- Import result message includes unknown payment count

**Navigation Updates (`app/accounts.tsx`)**:
- Added "Unknown Payments" button in accounts dashboard
- Button positioned under "All Payments" button
- Updated dashboard button width to accommodate 3 buttons on web (31% width)

### Files Modified:
- `app/unknown-payments.tsx` - New file for unknown payments screen
- `app/accounts.tsx` - Added unknown payments button and adjusted styles
- `app/(tabs)/settings.tsx` - Modified payment import logic to handle unknown payments
- `firestore.rules` - Added security rules for unknownPayments collection
- `docs/code-changes.md` - Documentation update

## 2025-01-17: Edit Job Price Feature

Added functionality to edit individual job prices directly from the runsheet modal without affecting the client's quote value.

### Implementation Details:

**State Management (`app/runsheet/[week].tsx`)**:
- Added `priceEditModalVisible`, `priceEditJob`, and `priceEditValue` state variables
- Added `handleEditPrice()` function to open the edit modal with current job price
- Added `handleSavePriceEdit()` function to validate and save the new price

**UI Components**:
- Added "Edit Price" button to both iOS ActionSheet and Android/Web modal
- Created price edit modal with:
  - Display of client name and original quote price
  - Numeric input field with £ symbol
  - Save/Cancel buttons
  - Input validation for positive numbers

**Display Changes**:
- Changed job display from `client.quote` to `job.price`
- Added visual indicator (✏️) for jobs with custom prices
- Custom prices persist through job movements and capacity redistribution

**Data Model Updates (`types/models.ts`)**:
- Added `hasCustomPrice?: boolean` field to Job type
- Field is set to `true` when price is manually edited

**Technical Considerations**:
- Prices are stored on individual job documents
- Custom prices persist when jobs are moved between days
- Capacity distribution algorithm only updates `scheduledTime`, not prices
- Job regeneration (when editing client frequency) resets prices to client quote

### User Experience:
- All users with runsheet access can edit prices
- Works for both pending and completed jobs
- Quote jobs are excluded from price editing
- Success confirmation shown after price update

### Files Modified:
- `app/runsheet/[week].tsx` - Added price edit functionality and UI
- `types/models.ts` - Added hasCustomPrice field to Job type
- `docs/code-changes.md` - Documentation update

---

## 2025-01-17 - Additional Services Edit/Delete Functionality

### Added clickable additional services with edit/delete modal

**Files Modified:**
- `app/(tabs)/clients/[id].tsx`

**Changes Made:**
1. **Made Additional Services Area Clickable**: 
   - Wrapped each `additionalServiceCard` with a `Pressable` component
   - Users can now click on any additional service (like "Lantern" in the screenshot) to edit it

2. **Added Edit Service Modal State Management**:
   - Added new state variables for edit modal functionality:
     - `editServiceModalVisible` - Controls modal visibility
     - `selectedService` - Stores the service being edited
     - `editServiceType`, `editCustomServiceType` - Service type selection
     - `editServiceFrequency` - Frequency picker state
     - `editServicePrice` - Price input state
     - `editServiceNextVisit` - Next visit date picker state
     - `showEditServiceDatePicker` - Date picker visibility

3. **Created Edit Additional Service Modal**:
   - Full modal with service type picker (including custom "Other" option)
   - Frequency picker (4-52 weeks)
   - Price input field
   - Next visit date picker (web and mobile compatible)
   - Save changes button
   - Delete service button with confirmation dialog
   - Cancel button

4. **Added Handler Functions**:
   - `onEditServiceDateChange()` - Handles date picker changes for edit modal
   - Pressable onPress handler - Initializes edit modal with selected service data
   - Edit modal save handler - Updates service in Firestore and local state
   - Delete handler - Removes service with confirmation dialog

5. **Smart Service Type Detection**:
   - Automatically detects if a service is predefined or custom
   - If custom, sets picker to "Other" and populates custom text field
   - If predefined, selects correct picker option

**User Experience:**
- Users can click anywhere in the additional service box to edit
- No visual changes to the UI - maintains clean appearance
- Edit modal preserves all existing service data
- Delete functionality with safety confirmation
- Form validation ensures data integrity

**Technical Notes:**
- Updated service type picker options to match those in add modal
- Proper state cleanup on modal close
- Firestore document updates with error handling
- Local state synchronization for immediate UI updates
- Refreshes client data after changes to update service history

---

## 2025-01-28 - Enhanced ETA Time Picker with Single Dropdown and Context-Aware Defaults

### Summary
Improved the ETA time selection interface in runsheets by replacing the dual hour/minute dropdowns with a single time selection dropdown, and added context-aware default selection based on the previous job's ETA.

### Changes Made:

1. **TimePickerModal Component** - Complete redesign:
   - Replaced two separate hour/minute dropdowns with a single time slot dropdown
   - Time slots range from 08:00 to 18:00 in 5-minute increments (e.g., 08:00, 08:05, 08:10... 18:00)
   - Added support for `previousJobEta` prop to show context
   - Shows "Previous job: HH:MM" text when using context from previous job
   - Improved UI with single scrollable list on mobile and dropdown on web

2. **Runsheet Week Screen** - Enhanced context awareness:
   - Modified `showPickerForJob` to accept section data and job index
   - Added logic to find previous job's ETA by looking backwards through the section data
   - Skips over vehicle headers and note jobs when finding previous job
   - Passes previous job's ETA to TimePickerModal for smart default selection

### Implementation Details:
```
// Time slot generation (08:00 to 18:00 in 5-min increments)
const generateTimeSlots = () => {
  const times = [];
  for (let hour = 8; hour <= 18; hour++) {
    for (let minute = 0; minute < 60; minute += 5) {
      const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      times.push(timeString);
    }
  }
  return times;
};

// Context-aware default selection
const defaultTime = initialTime || previousJobEta || '09:00';
```

### Benefits:
- ✅ Faster time selection with single interaction instead of two
- ✅ Better mobile/touch experience with single scrollable list
- ✅ Smart defaults save time by using previous job's ETA as starting point
- ✅ Clear visual feedback showing context when using previous job's time
- ✅ Consistent 5-minute increments match real-world scheduling patterns
- ✅ No regression risk - isolated changes to time picker only

---

## 2025-01-28 - Fixed ETA Sorting to Respect Vehicle Boundaries

### Summary
Fixed a bug where setting ETAs would cause jobs to jump between vehicles. Now ETA-based reordering only happens within the same vehicle assignment.

### The Problem:
- When setting an ETA on a job that was earlier than jobs in another vehicle, the job would move to that other vehicle
- Example: Setting 09:00 ETA on a Vehicle 2 job would move it to Vehicle 1 if Vehicle 1 had later jobs
- This broke the intended vehicle assignments and work distribution

### Technical Fix:

1. **Removed Global ETA Sorting** (`app/runsheet/[week].tsx` - sections mapping):
   - Previously: Jobs were sorted by ETA globally across all vehicles before allocation
   - Now: Jobs are only sorted by roundOrderNumber initially

2. **Added Vehicle-Scoped ETA Sorting** (`allocateJobsForDay` function):
   - After jobs are allocated to vehicles based on capacity
   - Each vehicle's jobs are sorted by ETA independently
   - Note jobs remain attached to their original jobs

### Implementation Details:
```
// Old approach - global ETA sorting before vehicle allocation:
const nonNoteJobs = jobsForDay
  .filter(job => !isNoteJob(job))
  .sort((a, b) => {
    // ETA sorting happened here globally
    if (a.eta && b.eta) { /* compare ETAs */ }
    return (a.client?.roundOrderNumber ?? 999999) - (b.client?.roundOrderNumber ?? 999999);
  });

// New approach - ETA sorting within each vehicle:
activeBlocks.forEach(block => {
  // Sort this vehicle's jobs by ETA
  nonNoteJobs.sort((a, b) => {
    if (a.eta && b.eta) {
      // Compare ETAs only within this vehicle
    }
  });
});
```

### Benefits:
- ✅ Jobs stay within their assigned vehicles regardless of ETA
- ✅ Vehicle capacity planning remains intact
- ✅ Workers stay with their assigned vehicle routes
- ✅ ETA optimization still works within each vehicle
- ✅ Note jobs continue to follow their parent jobs

---

## 2025-01-30 - Added Van Selection to Move Job Modal

### Summary
Enhanced the "Move Job" functionality in runsheets to allow users to manually assign jobs to specific vans/vehicles in addition to selecting a date. This provides more control over job allocation while maintaining the automatic capacity-based distribution as a default option.

### Key Changes:

1. **Data Model Update** (`types/models.ts`):
   - Added optional `vehicleId` field to the Job type
   - Jobs without vehicleId use automatic allocation based on capacity

2. **UI Enhancements** (`app/runsheet/[week].tsx`):
   - Added vehicle dropdown below date picker in move job modal
   - "Automatic (Based on capacity)" as default option
   - Lists all available vehicles for manual selection
   - Works on both web and mobile platforms

3. **Allocation Algorithm Updates**:
   - Modified `allocateJobsForDay` to respect manual vehicle assignments
   - Manually assigned jobs are placed first into their designated vehicles
   - Remaining jobs continue to use automatic capacity-based allocation
   - Handles edge cases where assigned vehicle is unavailable

### Technical Implementation:

```
// Job type enhancement
export type Job = {
  // ... existing fields ...
  vehicleId?: string; // Manual vehicle assignment (optional)
};

// Allocation logic respects manual assignments
const manuallyAssignedJobs = jobsForDay.filter(job => job.vehicleId);
const autoAllocateJobs = jobsForDay.filter(job => !job.vehicleId);

// Place manual jobs first, then auto-allocate the rest
```

### User Experience:
- ✅ Move job modal now shows both date and vehicle selection
- ✅ Users can choose "Automatic" or a specific vehicle
- ✅ Maintains backward compatibility - existing jobs work as before
- ✅ Warnings logged if assigned vehicle is unavailable
- ✅ Success message confirms both date and vehicle changes

### Considerations:
- Manual assignments override capacity limits
- If assigned vehicle has no crew on target date, job falls back to auto-allocation
- Future capacity redistribution respects manual assignments
- Manual assignments can be cleared by selecting "Automatic"

---

## 2025-01-30 - Added Move Button to Quote Jobs

### Summary
Fixed an inconsistency where quote jobs on the runsheet were missing the "Move" button that regular jobs have. Quote jobs can now be moved to different dates and vehicles just like regular jobs.

### Changes:
- Added Move button to quote job rendering in `app/runsheet/[week].tsx`
- Used the same conditional logic as regular jobs: shows when job is today or in the future and the day isn't completed
- No additional functionality needed - existing handleDeferJob function works perfectly with quote jobs

### User Experience:
- ✅ Quote jobs now have consistent controls with regular jobs
- ✅ Users can reschedule quotes to different dates/vehicles
- ✅ All existing move functionality (date selection, vehicle assignment) works for quotes

---

## 2025-01-28 - Fixed Round Order Manager Confirm Button Issue on Android Chrome 📱

### Problem Fixed
The "Confirm Position" button in the Round Order Manager was not working properly on Android Chrome browser. Users experienced a "blink" but no selection was made, and when pressing the browser back button, no selection appeared on the Add New Client screen.

Additionally, two related issues were discovered:
1. Account numbers were showing as "1" instead of "RWC530" for new clients
2. The round order manager was performing unnecessary database operations for new clients

### Root Cause
**Primary Issue**: The `handleConfirm` function in `app/round-order-manager.tsx` was using `Alert.alert()` calls for error handling, but `Alert.alert()` doesn't work properly on web browsers, especially mobile Chrome.

**Account Number Issue**: The account number generation logic assumed all account numbers were stored as numbers, but CSV-imported clients have account numbers as strings like "RWC529". This caused the generation logic to fail.

**Round Order Logic Issue**: The round order manager was performing database batch operations to update existing client round orders even for new clients that hadn't been saved yet, which was unnecessary and could cause errors.

### Solution Implemented (`app/round-order-manager.tsx` & `app/add-client.tsx`):

**1. Platform-Specific Error Handling**:
- Replaced `Alert.alert()` calls with platform-specific error dialogs
- Used `window.alert()` for web platforms and `Alert.alert()` for native platforms

**2. Fixed Account Number Generation**:
- Updated logic to handle both numeric and RWC-prefixed string account numbers
- Extract numeric part from "RWC529" format and increment properly
- New clients now display and save as "RWC530" format for consistency

**3. Optimized Round Order Manager Logic**:
- For new clients, skip database operations entirely
- Only perform batch updates when editing existing clients or restoring ex-clients
- Early return for new clients with just navigation back to add-client screen

**Code Changes**:
```
// Fixed account number generation to handle both formats
if (typeof currentAccountNumber === 'string' && currentAccountNumber.toUpperCase().startsWith('RWC')) {
  const numericPart = currentAccountNumber.replace(/^RWC/i, '');
  const parsedNumber = parseInt(numericPart, 10);
  nextAccountNumber = isNaN(parsedNumber) ? 1 : parsedNumber + 1;
}

// Skip database operations for new clients
if (newClientData && !activeClient.id) {
  console.log('New client - skipping database operations, just returning position');
  // Navigate back with position only
  return;
}
```

### Impact:
- ✅ Confirm Position button works reliably on Android Chrome
- ✅ Account numbers now display correctly as "RWC530" instead of "1"
- ✅ Round order selection properly returns to Add New Client screen
- ✅ Faster performance for new client round order selection (no database operations)
- ✅ Maintains backward compatibility with both numeric and string account number formats
- ✅ Consistent behavior across web and native platforms

**Files Modified**:
- `app/round-order-manager.tsx`: Fixed Alert.alert calls + optimized logic for new clients
- `app/add-client.tsx`: Fixed account number generation + consistent RWC formatting

## 2025-01-30 - Added Reset to Round Order Functionality 🔄

### New Feature: Reset ETAs and Vehicle Assignments
Added refresh/reset buttons to allow users to quickly revert jobs back to their original round order by removing manual scheduling changes.

### Implementation Details:

**1. Day-Level Reset Buttons (Runsheet)**:
- Small refresh icon (↻) button next to each day header on runsheet
- Only visible for future days and non-completed days
- Resets all jobs for that specific day back to round order
- Removes all manual ETAs and vehicle assignments
- Jobs automatically reorganize by round order using existing allocation system

**2. Week-Level Reset Buttons (Workload Forecast)**:
- Refresh icon (↻) button next to each week in workload forecast
- Only visible for future weeks (not current week)
- Resets all jobs for the entire week back to round order
- Only affects future days within the week (protects current operations)
- Provides detailed feedback on number of jobs and days reset

**3. Reset Service (`services/resetService.ts`)**:
- `resetDayToRoundOrder()`: Resets specific day with batch Firestore updates
- `resetWeekToRoundOrder()`: Resets entire week with smart date filtering
- Only affects jobs with status 'pending' or 'scheduled'
- Sets `eta: null` and `vehicleId: null` to clear manual overrides
- Comprehensive error handling and result reporting

**4. User Experience**:
- **Confirmation dialogs**: All reset operations require confirmation
- **Loading states**: Visual feedback during reset operations (↻...)
- **Platform-specific UI**: Uses web buttons on web, Pressable on mobile
- **Smart restrictions**: Cannot reset past days, completed days, or current week from forecast
- **Immediate feedback**: Success/error messages with job counts

**5. Data Safety**:
- Only removes manual overrides, doesn't delete job data
- Existing allocation system handles reorganization automatically
- Batch updates ensure data consistency
- No risk to completed or historical data

### Technical Implementation:
```
// Day reset: removes ETAs and vehicle assignments for single day
await resetDayToRoundOrder(dayDate);

// Week reset: removes ETAs and vehicle assignments for future days in week
await resetWeekToRoundOrder(weekStartDate);

// Jobs automatically reorganize by round order via existing systems
```

### User Interface:
- **Orange refresh icons** (↻) for easy identification
- **Disabled state** during operations to prevent double-clicks
- **Platform-optimized** styling (web buttons vs React Native components)
- **Non-intrusive** design that doesn't clutter existing UI

### Business Impact:
- **Quick recovery** from scheduling mistakes or changes
- **Maintains data integrity** while providing flexibility
- **Preserves round order** logic for efficient route planning
- **Reduces manual work** when reorganizing schedules

**Files Created**: `services/resetService.ts`

**Files Modified**: 
- `app/runsheet/[week].tsx` - Added day reset buttons and functionality
- `app/workload-forecast.tsx` - Added week reset buttons and functionality

---

## 2025-07-14  

---

## 2025-01-23 - Member Activity Audit Logging System 📋

### Features Added:
1. **Audit Data Model**: Created comprehensive audit logging types and service
2. **Owner-Only Activity Screen**: New screen accessible from home page showing timestamped member actions
3. **Automatic Activity Logging**: Tracks key member actions across the platform
4. **Search & Filter Interface**: Searchable activity log with filtering by action type

### Implementation Details:

**1. Audit Service (`services/auditService.ts`)**:
- `logAction()`: Records member actions with timestamp, actor, entity details
- `getAuditLogs()`: Retrieves activity history (owner-only access)
- `formatAuditDescription()`: Standardizes activity descriptions
- Fail-safe design: Audit failures don't break main operations

**2. Activity Screen (`app/audit-log.tsx`)**:
- Owner-only access with PermissionGate protection
- Real-time search across activities, members, entities
- Filter by action type (Client Actions, Quote Actions, etc.)
- Color-coded action icons for visual categorization
- Pull-to-refresh functionality

**3. Home Screen Integration**:
- "Activity Log" button visible only to account owners
- Added owner-specific permission filtering logic
- Positioned between Accounts and Settings for easy access

**4. Tracked Actions**:
- **Client Operations**: Create, edit, archive, round order changes
- **Quote Operations**: Create, edit, progress to pending, delete
- **Payment Actions**: Create, edit, delete (ready for implementation)
- **Team Management**: Permission changes, daily rate updates (ready for implementation)

### Activity Log Entries Format:
```
23/01/2025 14:32  [john@company.com]  Changed client details for "123 Main St, London, SW1A 1AA"
23/01/2025 14:28  [sarah@company.com] Created client for "456 Oak Ave, Manchester, M1 1AA"  
23/01/2025 09:15  [mike@company.com]  Archived client for "789 High St, Birmingham, B1 1AA"
```

### Technical Implementation:

**Audit Data Structure**:
```
type AuditLog = {
  id: string;
  timestamp: string;
  actorId: string;        // uid of person who performed action
  actorEmail: string;     // email for display
  actionType: string;     // 'client_edited', 'quote_created', etc.
  entityType: string;     // 'client', 'quote', 'rota', 'payment'
  entityId: string;       // ID of affected record
  entityName?: string;    // Display name for context
  description: string;    // Formatted description
  ownerId: string;        // Account scoping
}
```

**Integration Points**:
- `app/(tabs)/clients/[id]/edit-customer.tsx`: Client editing actions
- `app/add-client.tsx`: Client creation actions
- `app/(tabs)/clients/[id].tsx`: Client archiving actions
- `app/quotes.tsx`: Quote create, edit, delete, progress actions

**Security Features**:
- Owner-only access enforced at service and UI levels
- Account-scoped data queries prevent cross-account access
- Non-blocking audit logging prevents operational disruption

### Pending Items:
- **Rota Change Logging**: Deferred due to circular dependency issues
- **Payment Activity Logging**: Service hooks ready, awaiting implementation
- **Member Permission Logging**: Service hooks ready, awaiting implementation

### Business Impact:
- **Accountability**: Complete visibility into team member actions
- **Compliance**: Audit trail for business operations and client changes
- **Team Management**: Oversight of member activity patterns
- **Troubleshooting**: Historical context for data changes and issues

**Files created**:
- `types/audit.ts` - Audit data types and action definitions
- `services/auditService.ts` - Core audit logging functionality
- `app/audit-log.tsx` - Owner-only activity viewing screen

**Files modified**:
- `app/(tabs)/index.tsx` - Added Activity Log button for owners
- `app/(tabs)/clients/[id]/edit-customer.tsx` - Client edit logging
- `app/add-client.tsx` - Client creation logging
- `app/(tabs)/clients/[id].tsx` - Client archiving logging
- `app/quotes.tsx` - Quote operation logging

---

## 2025-01-21 - Comprehensive Notes System Overhaul

### Features Added:
1. **Quote Notes Field**: Added a notes field to the new quote form that persists through the quote lifecycle
2. **Separated Note Types**: Distinguished between "runsheet notes" (appear on job ! icon) and "account notes" (timestamped history)
3. **Account Notes System**: Implemented running notes list with author tracking and timestamps
4. **Quote-to-Client Notes Transfer**: Quote notes automatically become first account note when creating client

### Implementation Details:

1. **Quote Notes**:
   - Added notes field to quote form and data model
   - Notes display in quote cards throughout lifecycle (scheduled → pending → complete)
   - Files: `app/quotes.tsx`

2. **Note Type Separation**:
   - Renamed client.notes to client.runsheetNotes for clarity
   - Added migration logic for existing notes
   - Updated runsheet to use both legacy and new field names
   - Files: `types/client.ts`, `app/runsheet/[week].tsx`, `app/(tabs)/clients/[id].tsx`

3. **Account Notes**:
   - New AccountNote type with id, date, author, authorId, and text
   - Account notes display chronologically with author and timestamp
   - Modal for adding new notes with automatic user attribution
   - Files: `types/client.ts`, `app/(tabs)/clients/[id].tsx`

4. **Quote Transfer**:
   - When creating client from quote, notes become first account note
   - Author shown as "Imported from Quote" with system authorId
   - Files: `app/add-client.tsx`

**Files modified**:
- types/client.ts
- app/quotes.tsx
- app/(tabs)/clients/[id].tsx
- app/runsheet/[week].tsx
- app/add-client.tsx

---

## 2025-01-21 - Fixed Team Member UI and Permission Issues After Invite Acceptance

- **Issue**: After accepting team invites, the UI was not updating correctly:
  - "Join owner account" button remained visible for members
  - Members could see "Team Members" button (owner-only feature)
  - "Leave Team" button wasn't showing for members
  - UI didn't immediately reflect member status after accepting invite
- **Root Cause**: 
  - Settings screen wasn't properly checking if user was a member of another account
  - Firebase auth token wasn't being refreshed after accepting invites
  - Leave team function wasn't properly resetting user's accountId
- **Fix**:
  1. Updated Settings screen to track `isMemberOfAnotherAccount` state
  2. Fixed button visibility logic to show/hide based on member status:
     - Hide "Join owner account" for members of other accounts
     - Hide "Team Members" for non-owners
     - Show "Leave Team" only for members of other accounts
  3. Added token refresh after accepting invites to immediately update UI
  4. Enhanced `leaveTeamSelf` to reset accountId and refresh claims
- **Result**: 
  - UI now correctly reflects member status immediately after accepting invite
  - Members only see appropriate buttons and screens
  - Leave team properly resets user to their own account

**Files modified**: 
- app/(tabs)/settings.tsx
- app/enter-invite-code.tsx
- app/set-password.tsx
- services/accountService.ts

---

## 2025-07-15 - Hotfix: Team Management Regression

- **Issue**: Team members page was failing to load due to a regression from the Firebase migration. `refreshClaims` function was failing, preventing auth claims from being set.
- **Root Cause**: A Firestore index was missing for the `members` collection group query within the `refreshClaims` function.
- **Fix**: Added the required `COLLECTION_GROUP` index to `firestore.indexes.json` and deployed it. This resolves the 500 error on `refreshClaims` and subsequent 401 errors on `listMembers` and `listVehicles`.

**Files modified**: `firestore.indexes.json`

---

## 2025-07-15 – Invite Member Email Cloud Function Fix 📧🔧
• **Problem**: The `sendTeamInviteEmail` Firebase Cloud Function had a hardcoded URL for the invitation link, and was missing a clear way to handle different deployment environments (local, production).
• **Fix**: Modified the Cloud Function in `functions/index.js` to use a new `APP_URL` environment variable to construct the invite link. This makes the function portable across environments. A default of `http://localhost:8081` is used if the variable is not set.
• **Action Required**: To make the invite email system fully functional, two environment variables **must be set** for the `sendTeamInviteEmail` Cloud Function in your Google Cloud project:
    - `RESEND_KEY`: Your API key for the Resend email service.
    - `APP_URL`: The public base URL of your deployed application (e.g., `https://your-app.vercel.app`).
• **Result**: The function is no longer dependent on hardcoded values and can be configured for any environment.

**Files modified**: `functions/index.js`.

---

## 2025-01-21 – Invite Member Email Configuration FIXED ✅
• **RESOLVED**: Fixed invite member emails failing due to unverified domain configuration.  
• **Root Cause**: Edge function was falling back to hardcoded `tgmwindowcleaning.co.uk` domain when `EMAIL_FROM` environment variable was missing, causing Resend API to reject emails with "domain not verified" error.  
• **Configuration Fix**: Updated `EMAIL_FROM` secret in Supabase to use verified `guvnor.app` domain (`no-reply@guvnor.app`).  
• **Code Enhancement**: Replaced silent fallback behavior with explicit validation - function now throws clear errors when required environment variables (`EMAIL_FROM`, `RESEND_API_KEY`) are missing.  
• **Fail-Fast Implementation**: Added startup validation to prevent configuration regressions and ensure proper error reporting.  
• **Result**: Team member invitations now send emails successfully and provide clear error messages when misconfigured.  

**Files modified**: `supabase/functions/invite-member/index.ts`.

---

## 2025-01-21 – Team Invitation Duplicates FIXED ✅
• **RESOLVED**: Fixed duplicate team member invitations appearing in UI without email being sent.  
• **Root Cause**: Race condition between Supabase edge function and Firestore fallback, plus missing duplicate prevention.  
• **UI Fix**: Added double-tap prevention and improved error handling with proper loading states.  
• **Edge Function Fix**: Changed from `upsert` to `insert` with explicit duplicate checking in Supabase members table.  
• **Client Logic Fix**: Added pre-invitation duplicate checking and smarter fallback that detects partial edge function success.  
• **Result**: Team invitations now work reliably - no more duplicates, proper error messages, and email delivery confirmation.  
• **Enhanced Logging**: Added comprehensive console logging to debug invitation flow issues.  

**Files modified**: `app/(tabs)/team.tsx`, `services/accountService.ts`, `supabase/functions/invite-member/index.ts`.

---

## 2025-01-21 – Password Reset Flow FINALLY RESOLVED ✅🥕  
• **FINAL FIX**: Eliminated race condition between password reset flow detection and signup flow fallback.  
• **Root Cause**: Even with correct routing and token handling, signup verification fallback was still overriding password reset detection.  
• **Solution**: Completely removed problematic signup flow fallback logic when on `/set-password` route.  
• **Key Change**: Now defaults to password reset form when user has session on `/set-password` route, eliminating the "Thank you! Your account has been verified" false positive.  
• **Enhanced Error Handling**: Added proper Supabase error parsing for expired tokens with user-friendly messages.  
• **Result**: Password reset flow now works 100% reliably - users see the actual password reset form, not signup verification messages.  
• **Testing**: Confirmed with fresh tokens (<1 minute old) that flow detection works correctly every time.

**Files modified**: `app/set-password.tsx` - removed signup fallback detection, improved error handling.

---

## 2025-01-17 – Password Reset 404 RESOLVED ✅
• **RESOLVED**: Fixed password reset 404 errors by implementing proper static routing configuration for Expo web builds.  
• **Root Cause**: Expo static builds don't handle client-side routing properly - routes like `/set-password` returned 404.  
• **Solution**: Added `vercel.json` with SPA routing redirects and `public/_redirects` fallback configuration.  
• **Key Fix**: All routes now properly serve `index.html` allowing client-side routing to handle the actual navigation.  
• **Updated Configuration**: Enhanced `app.json` with `publicPath` and `assetBundlePatterns` for better static build handling.  
• **Result**: Password reset flow now works end-to-end - users can click email links and successfully reset passwords.  
• **Testing**: Verify by requesting password reset and clicking email link - should now load set-password page instead of 404.

**Files modified**: `vercel.json` (new), `public/_redirects` (new), `app.json`, routing configuration.

---

## 2025-01-17 – Password Reset Troubleshooting 🔧❌
• **EXTENSIVE** password reset debugging and enhancement work performed.  
• **Enhanced token handling**: Updated both React Native and Next.js apps to properly handle hash-based password reset tokens (`#access_token=...&type=recovery`).  
• **Session conflict resolution**: Added logic to clear existing sessions when processing password reset flows.  
• **URL configuration fixes**: Corrected Supabase redirect URLs from `www.guvnor.app` to `guvnor.app` in dashboard settings.  
• **Auth guard improvements**: Enhanced `_layout.tsx` to prevent interference with password reset flows.  
• **Dual-format support**: Made `/set-password` handle both query parameters and hash-based tokens.  
• **Cross-platform compatibility**: Fixed both mobile and web password reset implementations.  
• **RESOLVED ABOVE**: 404 errors fixed with proper routing configuration.  

**Files modified**: `app/set-password.tsx`, `web/src/app/set-password/page.tsx`, `app/forgot-password.tsx`, `web/src/app/forgot-password/page.tsx`, `app/_layout.tsx`, Supabase dashboard configuration.

---

## 2025-07-08 – Registration & Login Flow (Web) ✅
• `set-claims` edge function now auto-creates an **owner member record** after `USER_CREATED`, fixing "client list not loading" for new users.  
• Supabase **Site URL/Redirects** corrected, email verification link now lands on `guvnor.app` without SSL/404 errors.  
• Added web-friendly `window.alert` feedback on login for unverified accounts.  
• Registration defaults to **Provider** role.

Files: `supabase/functions/set-claims/index.ts`, `app/register.tsx`, `app/login.tsx`, Supabase project settings.

---

## 2025-07-04 – CSV Import (Web) 📑
• Rewritten file-picker flow for web; replaced `Alert.alert` prompts with standard `window.alert/confirm`.  
• Example CSV regenerated (200 rows, dd/mm/yyyy).  
• Import succeeds and creates clients; TODO: auto-generate jobs after import.

Files: `app/(tabs)/settings.tsx`, `scripts/generate-clients.js`, `docs/example-clients.csv`.

---

## 2025-07-03 – Vehicles, Rota & Capacity-Aware Runsheets 🚐🗓️
Phase 1 – Vehicle CRUD + member assignment.  
Phase 2 – **Rota** availability screen (7-day grid, on/off/n/a).  
Phase 3 – Runsheet groups jobs by **vehicle capacity**: effective cap = `dailyRate × (availableCrew / totalCrew)`.

Fallback: if no vehicles/rota configured the runsheet reverts to legacy list view.

Key files: `services/vehicleService.ts`, `services/rotaService.ts`, `app/rota.tsx`, `app/runsheet/[week].tsx`.

---

## 2025-07-01/02 – Runsheet Access & Member Removal
• Fixed incorrect `router.replace` path and removed redundant PermissionGate – runsheet now always loads for owners.  
• Home buttons render dynamically from **session perms**; members see only pages they can access.  
• Removing a member fully cleans up Firestore + Supabase rows and resets their JWT claims; *Leave Team* self-service button added (pending further backend edge-function work).

Files: `app/runsheet.tsx`, `app/(tabs)/index.tsx`, `services/accountService.ts`, `supabase/functions/set-claims/index.ts`.

---

## 2025-01-30 – Invitation & Data Ownership System ✅
• Standardised env vars (`SUPABASE_SERVICE_ROLE_KEY`), added `members` table migration.  
• Invitation flow (edge functions + Resend) now operates end-to-end.  
• Introduced `getDataOwnerId()` – members now query owner's data across services/pages.  
• Added Supabase→Firestore sync for team list.

Main files: `supabase/functions/*`, `services/accountService.ts`, `core/supabase.ts`.

---

## 2025-01-15 – Round Order Manager 🔄
• Replaced custom FlatList with **@quidone/react-native-wheel-picker** on mobile; arrow-key navigation on web.  
• Complete logic rewrite: INSERT / MOVE / ARCHIVE maintain a continuous, gap-free sequence.  
• Added batch updates to guarantee no duplicate `roundOrderNumber`.

File: `app/round-order-manager.tsx`.

---

## 2025-01-07 – Owner Access & Deployment Issues 🔧
• Resolved white-screen bug blocking owners – simplified imports, owner-first logic (`isOwner || viewRunsheet`).  
• Fixed Vercel deployment (duplicate projects, output dir, build rules).  
• Permission system unified into 3 keys (`viewClients`, `viewRunsheet`, `viewPayments`) and applied via common `PermissionGate`.

Files: `app/runsheet.tsx`, Vercel config.

---

## 2025-01-02 – Permission Notifications & CORS
• Edge function `set-claims` given CORS headers; real-time permission change notifications now delivered & session refreshed.  
• Refactored runsheet/workload-forecast pages to a single PermissionGate pattern; removed legacy redirects.

---

Historic entries prior to 2025-01-02 have been archived in the repo history.

---

## 2025-07-10 – UX & Auth Polishing ✨
• Added build indicator on Login screen (`Build: <commit>` – uses NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA).  
• Home screen now shows logged-in user email.  
• Auth guard updated so `/set-password` & `/forgot-password` stay accessible after session creates – fixes reset-password redirect loop.  
• Duplicate team-member/rota rows fixed: placeholder Firestore doc deleted once invite accepted.  
• Registration form gains confirm-password field with paste blocked, validation added.  
• Forgot-password flow implemented (`/forgot-password` screen + Supabase resetPasswordForEmail).  
Files: `app/_layout.tsx`, `app/login.tsx`, `app/(tabs)/index.tsx`, `app/register.tsx`, `app/forgot-password.tsx`, `services/accountService.ts`.

---

## 2025-01-16 – Build Tracking & Password Reset Fix 🔧
• **Build indicator finally working** – implemented automated git commit hash injection via `prebuild` script.  
• Fixed password reset flow redirect URL – was pointing to homepage instead of `/set-password`.  
• Added debug console logging to auth state changes for troubleshooting.  
• Build ID now updates automatically on every deployment, showing current commit hash.

Files: `app/login.tsx`, `app/forgot-password.tsx`, `app/_layout.tsx`, `scripts/update-build-id.js`, `package.json`.

---

## 2025-07-10 – Redirect After Payment Save

## Summary
Implemented logic so that after saving a payment from the 'Create Payment from Job' window, the user is redirected to the screen they were on before this one. This is achieved by passing a 'from' parameter when navigating to the add-payment screen and using it for redirection after saving. Fallback to previous logic if 'from' is not provided.

## Files Changed
- app/add-payment.tsx
- app/payments-list.tsx
- app/(tabs)/clients/[id].tsx
- app/completed-jobs.tsx
- app/client-balance.tsx

## Details
- Updated all navigation to `/add-payment` to include a `from` parameter representing the current route.
- Modified the save payment logic in `add-payment.tsx` to check for the `from` parameter and redirect the user back to that route after saving, otherwise fallback to the previous logic.
- Ensured compatibility for both web and native platforms.

---

## 2025-07-14  
- Documented Firebase configuration now supplied via Vercel environment variables  
  (`EXPO_PUBLIC_FIREBASE_*`).  No runtime code was changed; this commit is only to
  force a new deployment and confirm the build succeeds after the env-vars update.

### 🔧 Hotfix (same day)
- Added `FIREBASE_CONFIG` constant in `config.ts` (and example file) so web builds
  receive the injected env-vars and Firebase initialises correctly. Fixes Vercel
  build error: `Firebase: Need to provide options (app/no-options)`.

### 🔧 Follow-up validation
- Updated both `core/firebase.ts` and `core/firebase.web.ts` to validate **all** six
  Firebase config fields at startup and throw a descriptive error listing any
  missing keys. This provides faster, clearer feedback during CI builds.

### 🐛 Build debug
- Augmented `scripts/update-build-id.js` to log presence (not values) of the six
  `EXPO_PUBLIC_FIREBASE_*` variables during the **prebuild** step. This will help
  verify whether Vercel is actually injecting them.

### 🔧 Env-var linkage note  
Linked the six `EXPO_PUBLIC_FIREBASE_*` variables to the **RoundManagerApp** project in Vercel so they propagate to build-time processes.

---

## 2025-07-14 – Initial Firestore Security Rules 🔒
• Added `firestore.rules` with per-user access control for the `users/{uid}` document.
• Provides minimal permissions required for registration write to succeed after Firebase auth.

Files: `firestore.rules`.

---

## [DATE] Multi-line Quote Support
- Refactored quote creation modal and data model (`app/quotes.tsx`) to support multiple quote lines per client.
- Each quote can now have multiple lines, each with service type, frequency, value, and notes.
- Updated Quote type and UI to allow adding/removing lines.
- Updated context (`contexts/QuoteToClientContext.tsx`) to support passing an array of quote lines.
- Preserved backward compatibility for existing single-line quotes.
- Updated all relevant UI to display all quote lines.

---

(Last condensed: 2025-07-08)

- Updated `app/quotes.tsx`:
  - Implemented a two-column layout for the Quotes screen on web (Scheduled/Pending left, Complete right).
  - Added a search input to the Complete section, filtering by name and address.
  - On mobile, retained the original stacked layout with the new search for Complete.
  - The UI is now responsive and adapts based on platform.

## 2025-07-14 – Build retry
Triggered a rebuild to verify Vercel now receives the `EXPO_PUBLIC_FIREBASE_*` variables after updating them to "All Environments" in the dashboard. No functional code changes.

- Added verification email sending in `app/register.tsx` (Firebase `sendEmailVerification`).

- Added `/users/{uid}` rule to Firestore security rules so registration can write user doc.

- Switched `app/login.tsx` from Supabase to Firebase `signInWithEmailAndPassword` with email-verification check and detailed error handling.

- Migrated HomeScreen `(tabs)/index.tsx` to Firebase auth & Firestore; shows full menu again.

- HomeScreen now waits for Firebase auth state before building buttons to avoid blank screen on fast page load.

- Settings logout now signs out via Firebase `signOut` (plus Supabase fallback) so user can log out on new auth system.

---
## 2025-07-14 – Logout Redirect Fix 🔓
• **Problem**: Clicking "Log Out" on Settings redirected to `/login` before Firebase finished clearing the session. Root auth guard saw an active session and bounced back to `/`, leaving the user stuck logged in.
• **Fix**: Removed manual `router.replace('/login')` call. We now rely on `onAuthStateChanged` in `app/_layout.tsx` to detect sign-out and route unauthenticated users to `/login`, eliminating the race condition.
• **Files modified**: `app/(tabs)/settings.tsx`.

---
## 2025-07-14 – Registration Requires Email Verification 📧
• **Problem**: Newly registered users were signed in immediately and routed to the home page, skipping email verification.
• **Fix**: After sending the verification email and creating the Firestore user doc, the app now signs the user out and redirects them to `/login` with instructions to verify their email.
• **Files modified**: `app/register.tsx`.

---
## 2025-07-14 – Confirm Password + Firebase Reset Email
• **Registration UX**: Added *Full Name* and *Contact Number* fields, plus Confirm Password (paste blocked on web) with validation to ensure all fields are completed and passwords match.
• **Forgot Password**: Switched to Firebase `

---
## 2025-07-14 – Email Sending Flow Consolidated ✉️
• **Auth-Related Mail** (verification & password reset) now uses Firebase's built-in templates. Sender address updated in Firebase console to `noreply@guvnor.app` – allow 24-48 h for DNS propagation.
• **Team Invitations** continue to be sent via Resend from the Supabase edge function `invite-member`. Environment variables `EMAIL_FROM` & `RESEND_API_KEY` must be configured in Supabase.
• No other parts of the codebase reference Resend.

---

## 2025-01-17 – Quote Modal Consistency & Notes Display 📋
• **Unified quote modals**: Made the "Progress to Pending" modal in quotes screen match the nicer runsheet version
• **Added quote notes display**: Top-level quote notes are now shown in the progress modal
• **Improved UI consistency**: Both modals now have:
  - Transparent background overlay
  - Rounded white content box
  - Scrollable content area
  - Better styled input fields with labels
  - "Add Another Line" button functionality
  - Consistent button text ("Save & Progress" instead of just "Save")

**Issue**: 
- Modal for progressing quotes was different between runsheet and quotes screens
- Quote notes weren't visible when progressing to pending status

**Resolution**: 
- Replaced the simple modal in quotes.tsx with the enhanced version from runsheet
- Added a dedicated section to display quote notes at the top of the modal
- Removed unused `detailsForm` state

Files: `app/quotes.tsx`

---

## 2025-01-17 – Firebase Permission Errors Fix 🔒
• Updated Firestore security rules to handle edge cases where documents might be missing `ownerId` field
• Fixed `hasResourceAccess` and `hasCreateAccess` functions to include fallback checks
• Enhanced `completedWeeks` collection rules to handle multiple document ID formats and field structures
• Added backward compatibility for documents created with different structures
• Fixed inconsistent `completedWeeks` document ID format in client details view
• Ensured new `completedWeeks` documents include both `accountId` and `ownerId` fields

**Round 2 fixes**:
• Simplified Firestore rules to use `allow read` which covers both get and list operations
• Added proper member deletion permissions for leave team functionality
• Fixed member write permissions to allow members to delete their own record
• Removed incorrect `canQueryByOwnerId` function that was causing rule compilation issues
• Added composite Firestore indexes for common queries (jobs by ownerId+scheduledTime, jobs by ownerId+status)

**Round 3 fixes**:
• Separated `list` and `get` operations in Firestore rules
• For collection queries (list), only check if user is signed in - the query filters will handle access control
• For document reads (get), check proper resource access permissions
• This fixes the "Missing or insufficient permissions" error when querying collections with filters

**Issue**: Users were getting "Missing or insufficient permissions" errors when:
- Viewing client accounts (fetching service history)
- Loading runsheet
- Deleting scheduled quotes
- Members trying to leave team
- Archiving clients

**Resolution**: 
- Made Firestore rules more robust by checking for field existence before accessing them
- Fixed document ID inconsistency: `completedWeeks` documents now consistently use `${ownerId}_${date}` format
- Added proper `accountId` and `ownerId` fields to new documents for rule validation
- Allowed members to delete their own member records when leaving a team
- Simplified read permissions to properly handle collection queries

Files: `firestore.rules`, `firestore.indexes.json`, `app/(tabs)/clients/[id].tsx`, `app/runsheet/[week].tsx`

---

## 2025-01-21 – Quote Notes Editing Enhancement 📝
• **Issue**: Quote notes were not visible or editable in the runsheet modal when progressing quotes to pending
• **Issue**: Line-level notes were emphasized over overall quote notes

**Changes made**:
• **Runsheet Modal**: Added editable quote notes field at the top of the "Progress Quote to Pending" modal
• **Quotes Screen Modal**: Updated to make quote notes editable (previously read-only)
• **Consistent Experience**: Both modals now allow users to view and edit the overall quote notes
• **Data Persistence**: Quote notes are now properly saved when progressing to pending status from either location

**Implementation details**:
• Added `quoteData` state to store full quote information in runsheet
• Updated `handleProgressToPending` to fetch and store quote notes
• Added editable TextInput for quote notes in both modals
• Updated save handlers to persist edited quote notes to Firestore

Files: `app/runsheet/[week].tsx`, `app/quotes.tsx`

---

## 2025-01-21 – Collapsible Completed Quotes 🎯
• **Issue**: Completed quotes were showing all details, making the list lengthy and hard to scan
• **Request**: Collapse completed quotes to show only the address, expandable to show full details

**Changes made**:
• **Collapsible State**: Added `collapsedQuotes` state to track which completed quotes are collapsed
• **Address-Only View**: When collapsed, completed quotes show only the address in a larger font
• **Click to Toggle**: Clicking on a completed quote toggles between collapsed/expanded views
• **Visual Indicators**: Added arrow indicators (▶/▼) to show collapsed/expanded state
• **Smart Layout**: Action buttons (delete) only show when expanded to keep the interface clean
• **Auto-Collapse**: Completed quotes are automatically collapsed when first loaded for a cleaner initial view
• **Visual Distinction**: Completed quotes have a subtle green background to distinguish them

**Implementation details**:
• Added `collapsedQuotes` Set state to track collapsed quote IDs
• Modified `QuoteCard` component to check if quote is completed and in collapsed set
• Added `toggleCollapse` function to add/remove quote IDs from collapsed set
• Wrapped quote content in Pressable for click handling on completed quotes
• Conditional rendering based on `isCollapsed` state
• Updated `useEffect` to auto-collapse completed quotes on initial load
• Added green-tinted background color for completed quote cards

Files: `app/quotes.tsx`

---

## 2025-01-21 – First-Time Setup Modal 🚀
• **Issue**: New users had no guidance on initial setup and configuration
• **Request**: Add a first-time setup modal that asks about invite codes, working days, vehicle info, and daily limits

**Changes made**:
• **Setup Modal**: Created a new modal that appears when users log in for the first time
• **Three-Step Process**: 
  - Step 1: Ask if they have an invite code to join an organization
  - Step 2: Select default working days (if creating own organization)
  - Step 3: Enter vehicle details and daily turnover limit
• **Default Rota**: Automatically creates 52 weeks of rota entries based on selected working days
• **Vehicle Creation**: Creates a vehicle record with registration and daily limit
• **Navigation**: Routes users to invite code screen if they have one, or completes setup

**Updates based on feedback**:
• Changed title to "Welcome to Guvnor!"
• Changed button text to "No, continue without"
• Combined vehicle name and registration into single field
• Fixed navigation delay after setup completion
• Creates member record with vehicle assignment and daily rate
• Automatically assigns the created vehicle to the user

**Implementation details**:
• Created `FirstTimeSetupModal` component with multi-step wizard interface
• Added `firstTimeSetupCompleted` flag to user documents
• Added fields: `defaultWorkingDays`, `vehicleName`, `dailyTurnoverLimit`
• Modified home screen to check for first-time users and show modal
• Updated invite code flow to mark setup as complete when joining a team
• Automatically populates rota for the next 52 weeks based on working day preferences
• Creates member record with vehicle assignment and daily rate for proper team screen integration

Files: `components/FirstTimeSetupModal.tsx`, `app/(tabs)/index.tsx`, `app/enter-invite-code.tsx`

---

## 2025-01-23 – First-Time Setup UX Improvements 🎨
• **Issue**: Vehicle field placeholder text was confusing and setup completion had poor UX
• **Request**: Update placeholder text and fix navigation after setup completion

**Changes made**:
• **Vehicle Placeholder**: Changed from "e.g., White Transit Van or AB21 CDE" to "eg. registration, white transit, bicycle"
• **Setup Completion**: Fixed the issue where button stayed grey for 30 seconds after completion
  - Changed from alert with OK button to auto-dismissing success message
  - Modal now automatically closes and navigates after 1.5 seconds
  - Prevents confusion where button returns to blue while waiting for user action

**User Experience**:
• Clearer placeholder text showing more diverse vehicle examples
• Smooth transition after setup - success message appears briefly then auto-navigates
• No more waiting for user to click OK - automatic progression to home screen

Files: `components/FirstTimeSetupModal.tsx`

---

## 2025-01-23 – Quotes Screen Mobile Layout Fix 📱
• **Issue**: On mobile web browsers, the "Completed" quotes section wasn't visible as it was displayed in a side column
• **Request**: Stack the sections vertically on mobile instead of side-by-side columns

**Changes made**:
• **Added responsive layout**: Imported `useWindowDimensions` hook to detect screen width
• **Breakpoint logic**: Two-column layout only shows on web when screen width > 768px
• **Mobile experience**: All sections (Scheduled, Pending, Complete) now stack vertically on mobile browsers
• **Centered content**: Added `marginHorizontal: 'auto'` to center containers on larger screens

**Result**: Mobile web users can now see all quote sections by scrolling vertically

**Files modified**: `app/quotes.tsx`

---

## 2025-01-23 – Team Invitation Flow Fix 🔧
• **Issue**: "Domain not allowlisted by project" error when inviting team members who haven't registered yet
• **Root cause**: Firebase function was trying to create user accounts immediately, which failed for non-allowlisted domains

**Changes made**:
• **Firebase function update**: Modified `inviteMember` to:
  - No longer creates Firebase user accounts upfront
  - Stores invitation in Firestore with `uid: null` and `status: 'invited'`
  - Sends email with invite code and registration instructions
• **Email template**: Clear instructions for new users to register first, then enter code
• **Team screen UI**: 
  - Shows "Pending Invitation" badge for invited members
  - Hides vehicle/permissions controls until invitation accepted
  - Shows "Cancel Invitation" instead of "Remove" for pending invites

**New flow**:
1. Owner invites any email address
2. Recipient gets email with 6-digit code
3. Recipient registers account (if needed)
4. Recipient enters code to join team
5. Team screen updates to show active member

**Result**: Team invitations now work for any email address, regardless of registration status

**Files modified**: `functions/index.js`, `app/(tabs)/team.tsx`

---

## 2025-01-23 – Cancel Invitation Fix 🔧
• **Issue**: "Cancel Invitation" button would remove pending invitations from the UI temporarily, but they would reappear after refresh/navigation
• **Root cause**: `removeMember` function was designed for active members (using UID as document ID) but pending invitations use invite codes as document IDs

**Changes made**:
• **Firebase function fixes**:
  - Updated `listMembers` to return both `docId` (document ID) and `uid` fields
  - Modified `removeMember` to handle both active members and pending invitations
  - For pending invitations: deletes by invite code, no user document updates
  - For active members: deletes by UID, resets user document and clears claims
• **Frontend updates**:
  - Updated `MemberRecord` type to include `docId` field
  - Modified team screen to use correct identifier when removing members
  - Improved confirmation messages ("cancel this invitation" vs "remove this member")

**Technical details**:
- Pending invitations: `docId` = invite code, `uid` = null
- Active members: `docId` = user UID, `uid` = user UID
- `removeMember` now properly handles both cases

**Result**: Cancel invitation now permanently removes pending invitations from Firestore

**Files modified**: `functions/index.js`, `app/(tabs)/team.tsx`, `services/accountService.ts`

---

## 2025-01-27 - Performance Optimization: Client List Next Visit Loading

### Bug Fix:
**Fixed Performance Issue with Next Visit Display**: Resolved major performance bottleneck in clients list where "Next Visit: N/A" was showing despite jobs existing.

### Root Cause:
The `fetchNextVisits` function was making individual Firebase queries for each client in a sequential loop. With 529 clients, this meant 529 separate database queries, causing:
- Extremely slow loading times
- Component rendering before all queries completed
- "N/A" displaying while queries were still running

### Solution:
**Optimized Query Strategy (`app/clients.tsx`)**:
- Replaced individual client queries with single bulk query
- Fetches ALL pending/scheduled/in_progress jobs for the data owner at once
- Groups results by clientId in memory to find next visit dates
- Reduces 529 database queries to just 1 query

### Performance Impact:
- **Before**: 529 sequential Firebase queries (very slow)
- **After**: 1 Firebase query + in-memory processing (fast)
- **Result**: Next Visit data now loads immediately and displays correctly

### Technical Implementation:
- Single query: `where('ownerId', '==', ownerId)` + `where('status', 'in', ['pending', 'scheduled', 'in_progress'])`
- In-memory grouping by clientId to find earliest future job date
- Maintains same logic for date calculation and formatting
- Improved error handling with fallback to empty state

**Files modified**: `app/clients.tsx`

---

## 2025-01-27 - Comprehensive Job Capacity Management System

### Major Feature: Automatic Job Redistribution Based on Team Capacity

**Problem Solved**: Runsheets were displaying jobs that exceeded the daily capacity limits of available team members, causing operational inefficiencies and overloading.

### Core Functionality:

**1. Capacity Calculation System**:
- Calculates daily capacity = sum of (available team members' daily turnover limits)
- Factors in team member availability from rota (on/off/n/a status)
- Real-time capacity monitoring per day within each week

**2. Intelligent Job Redistribution**:
- **Overflow Detection**: Identifies when jobs exceed daily capacity limits
- **Round Order Preservation**: Maintains routing efficiency by moving job blocks, not individual jobs
- **Sequential Spillover**: Excess jobs roll to next day, then next, until capacity allows
- **Week Boundary Respect**: Jobs never move to following weeks - stay within current week
- **Final Day Exception**: If all future days lack capacity, keeps overflow on final viable day

**3. Automated Triggers**:
- **Job Addition**: Triggers redistribution when new jobs are created (future weeks only)
- **Team Changes**: Triggers when daily turnover limits change
- **Availability Changes**: Triggers when rota availability is modified
- **Current Week Protection**: Auto-triggers skip current week to avoid disrupting active operations

**4. Manual Override**:
- **Current Week Refresh**: Manual button on runsheet for current week capacity redistribution
- **Visual Feedback**: Shows redistribution results, warnings, and job counts moved
- **Real-time Updates**: Automatically refreshes screen after redistribution

### Algorithm Logic:

```
For each day Monday-Sunday:
  If (current jobs value > daily capacity):
    Calculate overflow jobs (maintaining round order)
    For each subsequent day in week:
      If (target day has available capacity):
        Move jobs that fit into available capacity
        Update capacity calculations
      Else:
        Continue to next day
    If (last day OR no remaining capacity):
      Keep remaining jobs on current day (accept overflow)
```

### Key Constraints:

- **Round Order Maintenance**: Jobs move as coherent blocks to preserve routing efficiency
- **Week Boundaries**: No cross-week job movement - contains work within current week
- **Capacity Respect**: Only moves jobs when target days have sufficient capacity
- **Team Availability**: Only counts team members marked as 'on' in rota for capacity calculations

### Technical Implementation:

**New Service**: `services/capacityService.ts`
- `calculateDayCapacity()`: Daily capacity computation with team availability
- `redistributeJobsForWeek()`: Core redistribution algorithm with round order preservation
- `manualRefreshWeekCapacity()`: Current week manual refresh functionality
- `triggerCapacityRedistribution()`: Automated trigger system for future weeks

**Integration Points**:
- `services/jobService.ts`: Auto-trigger on job creation
- `services/accountService.ts`: Auto-trigger on daily rate changes
- `services/rotaService.ts`: Auto-trigger on availability changes
- `app/runsheet/[week].tsx`: Manual refresh UI and capacity management integration

**Performance Optimizations**:
- Batched Firebase updates for job redistributions
- Dynamic imports to avoid circular dependencies
- Error isolation - capacity failures don't break core operations
- Efficient capacity calculations with in-memory processing

### User Experience:

**Automated Operation**: System automatically redistributes jobs for future weeks without user intervention when:
- New jobs are added to the system
- Team member daily limits are modified
- Team availability changes in the rota

**Manual Control**: Users can manually apply redistribution to current week using the "Refresh Capacity" button, which provides:
- Detailed feedback on jobs moved
- Warning messages for overflow situations
- Immediate visual updates to runsheet layout

**Exception Handling**: System gracefully handles edge cases:
- Days with no available team members
- Weeks with insufficient total capacity
- Final day overflow situations

### Business Impact:

- **Operational Efficiency**: Prevents team overloading and ensures realistic daily schedules
- **Route Optimization**: Maintains round order for efficient job sequencing
- **Workload Balance**: Distributes work evenly across available team capacity
- **Proactive Management**: Automatic redistribution prevents capacity issues before they occur

**Files created**: `services/capacityService.ts`

**Files modified**: `app/runsheet/[week].tsx`, `services/jobService.ts`, `services/accountService.ts`, `services/rotaService.ts`

---

## Capacity Management Bug Fixes (2025-01-21)

### Issues Fixed:

**1. Job Distribution Logic Correction**:
- **Problem**: Excess jobs were being distributed to the first available day with capacity
- **Fix**: Changed algorithm to distribute excess jobs to the LAST available day with capacity
- **Impact**: Jobs now correctly overflow to Saturday (last available day) instead of Monday

**2. Current Week Auto-Application Prevention**:
- **Problem**: Rota availability changes were automatically triggering redistribution on current week
- **Fix**: Modified `rotaService.ts` to only trigger redistribution for future weeks
- **Impact**: Current week redistribution now only happens via manual "Refresh Capacity" button

### Technical Changes:

**`services/capacityService.ts`**:
- Modified `redistributeJobsForWeek()`

---

## 2025-01-28 - Historical Data CSV Import Functions

### New Features:
1. **Import Payments from CSV**: Added ability to import historical payment records
2. **Import Completed Jobs from CSV**: Added ability to import historical completed job records

### Implementation Details:

**Payment Import (`app/(tabs)/settings.tsx`)**:
- CSV Format: `Account Number, Date, Amount (£), Type, Notes`
- Validates RWC account numbers and maps to client IDs
- Supports payment types: cash, card, BACS/bank transfer, cheque (defaults to 'other' for unrecognized)
- Date parsing supports DD/MM/YYYY and YYYY-MM-DD formats
- Creates payment records with all existing payment functionality (notes, balance calculations, etc.)

**Completed Jobs Import (`app/(tabs)/settings.tsx`)**:
- CSV Format: `Account Number, Date, Amount (£)`
- Creates jobs with serviceId: "Historic Completed Service" for easy identification
- Jobs are created with status: 'completed' to immediately appear in completed jobs lists
- Uses client's address for propertyDetails field
- Integrates seamlessly with existing balance calculations

**Technical Improvements**:
- Reuses existing CSV import infrastructure (file pickers, validation, error reporting)
- Both functions support CSV and Excel files (.csv, .xlsx, .xls)
- Comprehensive error reporting showing specific rows that failed with reasons
- Account number validation with automatic RWC prefix addition if missing
- No duplicate checking per user requirements - allows multiple payments/jobs on same date
- Cross-platform support (web and mobile implementations)

### Files Modified:
- `app/(tabs)/settings.tsx` - Added handleImportPayments and handleImportCompletedJobs functions
- `services/paymentService.ts` - Imported createPayment function
- `docs/code-changes.md` - Documentation update

**Impact**: Enables bulk import of historical financial data, allowing users to quickly populate their system with past payments and completed jobs while maintaining full integration with existing features like balance calculations, client history, and reporting.

---

## 2025-01-18 - Unknown Payments Feature

### Summary
Added a new feature to handle payments with unmatched account numbers during CSV import. Instead of skipping these payments, they are now saved to a separate "unknownPayments" collection with import metadata for future reconciliation.

### Implementation Details:

**Unknown Payments Storage**:
- New Firestore collection: `unknownPayments`
- Stores all payment data plus import metadata (import date, filename, CSV row number, original account identifier)
- Payments with invalid account numbers (RWC numbers not in system, "unknwn", "x", etc.) are saved here

**Unknown Payments Screen (`app/unknown-payments.tsx`)**:
- New screen to view all unknown payments
- Search/filter by account identifier, amount, date, or notes
- Displays payment details and import metadata
- Accessible from accounts screen via new button

**Import Process Updates (`app/(tabs)/settings.tsx`)**:
- Modified `handleImportPayments` to separate unknown account payments from skipped ones
- Unknown payments are saved to `unknownPayments` collection instead of being skipped
- Import confirmation shows counts for regular payments, unknown payments, and skipped rows
- Import result message includes unknown payment count

**Navigation Updates (`app/accounts.tsx`)**:
- Added "Unknown Payments" button in accounts dashboard
- Button positioned under "All Payments" button
- Updated dashboard button width to accommodate 3 buttons on web (31% width)

### Files Modified:
- `app/unknown-payments.tsx` - New file for unknown payments screen
- `app/accounts.tsx` - Added unknown payments button and adjusted styles
- `app/(tabs)/settings.tsx` - Modified payment import logic to handle unknown payments
- `firestore.rules` - Added security rules for unknownPayments collection
- `docs/code-changes.md` - Documentation update

## 2025-01-17: Edit Job Price Feature

Added functionality to edit individual job prices directly from the runsheet modal without affecting the client's quote value.

### Implementation Details:

**State Management (`app/runsheet/[week].tsx`)**:
- Added `priceEditModalVisible`, `priceEditJob`, and `priceEditValue` state variables
- Added `handleEditPrice()` function to open the edit modal with current job price
- Added `handleSavePriceEdit()` function to validate and save the new price

**UI Components**:
- Added "Edit Price" button to both iOS ActionSheet and Android/Web modal
- Created price edit modal with:
  - Display of client name and original quote price
  - Numeric input field with £ symbol
  - Save/Cancel buttons
  - Input validation for positive numbers

**Display Changes**:
- Changed job display from `client.quote` to `job.price`
- Added visual indicator (✏️) for jobs with custom prices
- Custom prices persist through job movements and capacity redistribution

**Data Model Updates (`types/models.ts`)**:
- Added `hasCustomPrice?: boolean` field to Job type
- Field is set to `true` when price is manually edited

**Technical Considerations**:
- Prices are stored on individual job documents
- Custom prices persist when jobs are moved between days
- Capacity distribution algorithm only updates `scheduledTime`, not prices
- Job regeneration (when editing client frequency) resets prices to client quote

### User Experience:
- All users with runsheet access can edit prices
- Works for both pending and completed jobs
- Quote jobs are excluded from price editing
- Success confirmation shown after price update

### Files Modified:
- `app/runsheet/[week].tsx` - Added price edit functionality and UI
- `types/models.ts` - Added hasCustomPrice field to Job type
- `docs/code-changes.md` - Documentation update

---

## 2025-01-17 - Additional Services Edit/Delete Functionality

### Added clickable additional services with edit/delete modal

**Files Modified:**
- `app/(tabs)/clients/[id].tsx`

**Changes Made:**
1. **Made Additional Services Area Clickable**: 
   - Wrapped each `additionalServiceCard` with a `Pressable` component
   - Users can now click on any additional service (like "Lantern" in the screenshot) to edit it

2. **Added Edit Service Modal State Management**:
   - Added new state variables for edit modal functionality:
     - `editServiceModalVisible` - Controls modal visibility
     - `selectedService` - Stores the service being edited
     - `editServiceType`, `editCustomServiceType` - Service type selection
     - `editServiceFrequency` - Frequency picker state
     - `editServicePrice` - Price input state
     - `editServiceNextVisit` - Next visit date picker state
     - `showEditServiceDatePicker` - Date picker visibility

3. **Created Edit Additional Service Modal**:
   - Full modal with service type picker (including custom "Other" option)
   - Frequency picker (4-52 weeks)
   - Price input field
   - Next visit date picker (web and mobile compatible)
   - Save changes button
   - Delete service button with confirmation dialog
   - Cancel button

4. **Added Handler Functions**:
   - `onEditServiceDateChange()` - Handles date picker changes for edit modal
   - Pressable onPress handler - Initializes edit modal with selected service data
   - Edit modal save handler - Updates service in Firestore and local state
   - Delete handler - Removes service with confirmation dialog

5. **Smart Service Type Detection**:
   - Automatically detects if a service is predefined or custom
   - If custom, sets picker to "Other" and populates custom text field
   - If predefined, selects correct picker option

**User Experience:**
- Users can click anywhere in the additional service box to edit
- No visual changes to the UI - maintains clean appearance
- Edit modal preserves all existing service data
- Delete functionality with safety confirmation
- Form validation ensures data integrity

**Technical Notes:**
- Updated service type picker options to match those in add modal
- Proper state cleanup on modal close
- Firestore document updates with error handling
- Local state synchronization for immediate UI updates
- Refreshes client data after changes to update service history

---

## 2025-01-28 - Enhanced ETA Time Picker with Single Dropdown and Context-Aware Defaults

### Summary
Improved the ETA time selection interface in runsheets by replacing the dual hour/minute dropdowns with a single time selection dropdown, and added context-aware default selection based on the previous job's ETA.

### Changes Made:

1. **TimePickerModal Component** - Complete redesign:
   - Replaced two separate hour/minute dropdowns with a single time slot dropdown
   - Time slots range from 08:00 to 18:00 in 5-minute increments (e.g., 08:00, 08:05, 08:10... 18:00)
   - Added support for `previousJobEta` prop to show context
   - Shows "Previous job: HH:MM" text when using context from previous job
   - Improved UI with single scrollable list on mobile and dropdown on web

2. **Runsheet Week Screen** - Enhanced context awareness:
   - Modified `showPickerForJob` to accept section data and job index
   - Added logic to find previous job's ETA by looking backwards through the section data
   - Skips over vehicle headers and note jobs when finding previous job
   - Passes previous job's ETA to TimePickerModal for smart default selection

### Implementation Details:
```
// Time slot generation (08:00 to 18:00 in 5-min increments)
const generateTimeSlots = () => {
  const times = [];
  for (let hour = 8; hour <= 18; hour++) {
    for (let minute = 0; minute < 60; minute += 5) {
      const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      times.push(timeString);
    }
  }
  return times;
};

// Context-aware default selection
const defaultTime = initialTime || previousJobEta || '09:00';
```

### Benefits:
- ✅ Faster time selection with single interaction instead of two
- ✅ Better mobile/touch experience with single scrollable list
- ✅ Smart defaults save time by using previous job's ETA as starting point
- ✅ Clear visual feedback showing context when using previous job's time
- ✅ Consistent 5-minute increments match real-world scheduling patterns
- ✅ No regression risk - isolated changes to time picker only

---

## 2025-01-28 - Fixed ETA Sorting to Respect Vehicle Boundaries

### Summary
Fixed a bug where setting ETAs would cause jobs to jump between vehicles. Now ETA-based reordering only happens within the same vehicle assignment.

### The Problem:
- When setting an ETA on a job that was earlier than jobs in another vehicle, the job would move to that other vehicle
- Example: Setting 09:00 ETA on a Vehicle 2 job would move it to Vehicle 1 if Vehicle 1 had later jobs
- This broke the intended vehicle assignments and work distribution

### Technical Fix:

1. **Removed Global ETA Sorting** (`app/runsheet/[week].tsx` - sections mapping):
   - Previously: Jobs were sorted by ETA globally across all vehicles before allocation
   - Now: Jobs are only sorted by roundOrderNumber initially

2. **Added Vehicle-Scoped ETA Sorting** (`allocateJobsForDay` function):
   - After jobs are allocated to vehicles based on capacity
   - Each vehicle's jobs are sorted by ETA independently
   - Note jobs remain attached to their original jobs

### Implementation Details:
```
// Old approach - global ETA sorting before vehicle allocation:
const nonNoteJobs = jobsForDay
  .filter(job => !isNoteJob(job))
  .sort((a, b) => {
    // ETA sorting happened here globally
    if (a.eta && b.eta) { /* compare ETAs */ }
    return (a.client?.roundOrderNumber ?? 999999) - (b.client?.roundOrderNumber ?? 999999);
  });

// New approach - ETA sorting within each vehicle:
activeBlocks.forEach(block => {
  // Sort this vehicle's jobs by ETA
  nonNoteJobs.sort((a, b) => {
    if (a.eta && b.eta) {
      // Compare ETAs only within this vehicle
    }
  });
});
```

### Benefits:
- ✅ Jobs stay within their assigned vehicles regardless of ETA
- ✅ Vehicle capacity planning remains intact
- ✅ Workers stay with their assigned vehicle routes
- ✅ ETA optimization still works within each vehicle
- ✅ Note jobs continue to follow their parent jobs

---

## 2025-01-30 - Added Van Selection to Move Job Modal

### Summary
Enhanced the "Move Job" functionality in runsheets to allow users to manually assign jobs to specific vans/vehicles in addition to selecting a date. This provides more control over job allocation while maintaining the automatic capacity-based distribution as a default option.

### Key Changes:

1. **Data Model Update** (`types/models.ts`):
   - Added optional `vehicleId` field to the Job type
   - Jobs without vehicleId use automatic allocation based on capacity

2. **UI Enhancements** (`app/runsheet/[week].tsx`):
   - Added vehicle dropdown below date picker in move job modal
   - "Automatic (Based on capacity)" as default option
   - Lists all available vehicles for manual selection
   - Works on both web and mobile platforms

3. **Allocation Algorithm Updates**:
   - Modified `allocateJobsForDay` to respect manual vehicle assignments
   - Manually assigned jobs are placed first into their designated vehicles
   - Remaining jobs continue to use automatic capacity-based allocation
   - Handles edge cases where assigned vehicle is unavailable

### Technical Implementation:

```
// Job type enhancement
export type Job = {
  // ... existing fields ...
  vehicleId?: string; // Manual vehicle assignment (optional)
};

// Allocation logic respects manual assignments
const manuallyAssignedJobs = jobsForDay.filter(job => job.vehicleId);
const autoAllocateJobs = jobsForDay.filter(job => !job.vehicleId);

// Place manual jobs first, then auto-allocate the rest
```

### User Experience:
- ✅ Move job modal now shows both date and vehicle selection
- ✅ Users can choose "Automatic" or a specific vehicle
- ✅ Maintains backward compatibility - existing jobs work as before
- ✅ Warnings logged if assigned vehicle is unavailable
- ✅ Success message confirms both date and vehicle changes

### Considerations:
- Manual assignments override capacity limits
- If assigned vehicle has no crew on target date, job falls back to auto-allocation
- Future capacity redistribution respects manual assignments
- Manual assignments can be cleared by selecting "Automatic"

---

## 2025-01-30 - Added Move Button to Quote Jobs

### Summary
Fixed an inconsistency where quote jobs on the runsheet were missing the "Move" button that regular jobs have. Quote jobs can now be moved to different dates and vehicles just like regular jobs.

### Changes:
- Added Move button to quote job rendering in `app/runsheet/[week].tsx`
- Used the same conditional logic as regular jobs: shows when job is today or in the future and the day isn't completed
- No additional functionality needed - existing handleDeferJob function works perfectly with quote jobs

### User Experience:
- ✅ Quote jobs now have consistent controls with regular jobs
- ✅ Users can reschedule quotes to different dates/vehicles
- ✅ All existing move functionality (date selection, vehicle assignment) works for quotes

---

## 2025-01-28 - Fixed Round Order Manager Confirm Button Issue on Android Chrome 📱

### Problem Fixed
The "Confirm Position" button in the Round Order Manager was not working properly on Android Chrome browser. Users experienced a "blink" but no selection was made, and when pressing the browser back button, no selection appeared on the Add New Client screen.

Additionally, two related issues were discovered:
1. Account numbers were showing as "1" instead of "RWC530" for new clients
2. The round order manager was performing unnecessary database operations for new clients

### Root Cause
**Primary Issue**: The `handleConfirm` function in `app/round-order-manager.tsx` was using `Alert.alert()` calls for error handling, but `Alert.alert()` doesn't work properly on web browsers, especially mobile Chrome.

**Account Number Issue**: The account number generation logic assumed all account numbers were stored as numbers, but CSV-imported clients have account numbers as strings like "RWC529". This caused the generation logic to fail.

**Round Order Logic Issue**: The round order manager was performing database batch operations to update existing client round orders even for new clients that hadn't been saved yet, which was unnecessary and could cause errors.

### Solution Implemented (`app/round-order-manager.tsx` & `app/add-client.tsx`):

**1. Platform-Specific Error Handling**:
- Replaced `Alert.alert()` calls with platform-specific error dialogs
- Used `window.alert()` for web platforms and `Alert.alert()` for native platforms

**2. Fixed Account Number Generation**:
- Updated logic to handle both numeric and RWC-prefixed string account numbers
- Extract numeric part from "RWC529" format and increment properly
- New clients now display and save as "RWC530" format for consistency

**3. Optimized Round Order Manager Logic**:
- For new clients, skip database operations entirely
- Only perform batch updates when editing existing clients or restoring ex-clients
- Early return for new clients with just navigation back to add-client screen

**Code Changes**:
```
// Fixed account number generation to handle both formats
if (typeof currentAccountNumber === 'string' && currentAccountNumber.toUpperCase().startsWith('RWC')) {
  const numericPart = currentAccountNumber.replace(/^RWC/i, '');
  const parsedNumber = parseInt(numericPart, 10);
  nextAccountNumber = isNaN(parsedNumber) ? 1 : parsedNumber + 1;
}

// Skip database operations for new clients
if (newClientData && !activeClient.id) {
  console.log('New client - skipping database operations, just returning position');
  // Navigate back with position only
  return;
}
```

### Impact:
- ✅ Confirm Position button works reliably on Android Chrome
- ✅ Account numbers now display correctly as "RWC530" instead of "1"
- ✅ Round order selection properly returns to Add New Client screen
- ✅ Faster performance for new client round order selection (no database operations)
- ✅ Maintains backward compatibility with both numeric and string account number formats
- ✅ Consistent behavior across web and native platforms

**Files Modified**:
- `app/round-order-manager.tsx`: Fixed Alert.alert calls + optimized logic for new clients
- `app/add-client.tsx`: Fixed account number generation + consistent RWC formatting

**4. Tracked Actions**:
- **Client Operations**: Create, edit, archive, round order changes
- **Quote Operations**: Create, edit, progress to pending, delete
- **Payment Actions**: Create, edit, delete (ready for implementation)
- **Team Management**: Permission changes, daily rate updates (ready for implementation)

### Activity Log Entries Format:
```
23/01/2025 14:32  [john@company.com]  Changed client details for "123 Main St, London, SW1A 1AA"
23/01/2025 14:28  [sarah@company.com] Created client for "456 Oak Ave, Manchester, M1 1AA"  
23/01/2025 09:15  [mike@company.com]  Archived client for "789 High St, Birmingham, B1 1AA"
```

### Technical Implementation:

**Audit Data Structure**:
```
type AuditLog = {
  id: string;
  timestamp: string;
  actorId: string;        // uid of person who performed action
  actorEmail: string;     // email for display
  actionType: string;     // 'client_edited', 'quote_created', etc.
  entityType: string;     // 'client', 'quote', 'rota', 'payment'
  entityId: string;       // ID of affected record
  entityName?: string;    // Display name for context
  description: string;    // Formatted description
  ownerId: string;        // Account scoping
}
```

**Integration Points**:
- `app/(tabs)/clients/[id]/edit-customer.tsx`: Client editing actions
- `app/add-client.tsx`: Client creation actions
- `app/(tabs)/clients/[id].tsx`: Client archiving actions
- `app/quotes.tsx`: Quote create, edit, delete, progress actions

**Security Features**:
- Owner-only access enforced at service and UI levels
- Account-scoped data queries prevent cross-account access
- Non-blocking audit logging prevents operational disruption

### Pending Items:
- **Rota Change Logging**: Deferred due to circular dependency issues
- **Payment Activity Logging**: Service hooks ready, awaiting implementation
- **Member Permission Logging**: Service hooks ready, awaiting implementation

### Business Impact:
- **Accountability**: Complete visibility into team member actions
- **Compliance**: Audit trail for business operations and client changes
- **Team Management**: Oversight of member activity patterns
- **Troubleshooting**: Historical context for data changes and issues

**Files created**:
- `types/audit.ts` - Audit data types and action definitions
- `services/auditService.ts` - Core audit logging functionality
- `app/audit-log.tsx` - Owner-only activity viewing screen

**Files modified**:
- `app/(tabs)/index.tsx` - Added Activity Log button for owners
- `app/(tabs)/clients/[id]/edit-customer.tsx` - Client edit logging
- `app/add-client.tsx` - Client creation logging
- `app/(tabs)/clients/[id].tsx` - Client archiving logging
- `app/quotes.tsx` - Quote operation logging

---

## 2025-01-21 - Comprehensive Notes System Overhaul

### Features Added:
1. **Quote Notes Field**: Added a notes field to the new quote form that persists through the quote lifecycle
2. **Separated Note Types**: Distinguished between "runsheet notes" (appear on job ! icon) and "account notes" (timestamped history)
3. **Account Notes System**: Implemented running notes list with author tracking and timestamps
4. **Quote-to-Client Notes Transfer**: Quote notes automatically become first account note when creating client

### Implementation Details:

1. **Quote Notes**:
   - Added notes field to quote form and data model
   - Notes display in quote cards throughout lifecycle (scheduled → pending → complete)
   - Files: `app/quotes.tsx`

2. **Note Type Separation**:
   - Renamed client.notes to client.runsheetNotes for clarity
   - Added migration logic for existing notes
   - Updated runsheet to use both legacy and new field names
   - Files: `types/client.ts`, `app/runsheet/[week].tsx`, `app/(tabs)/clients/[id].tsx`

3. **Account Notes**:
   - New AccountNote type with id, date, author, authorId, and text
   - Account notes display chronologically with author and timestamp
   - Modal for adding new notes with automatic user attribution
   - Files: `types/client.ts`, `app/(tabs)/clients/[id].tsx`

4. **Quote Transfer**:
   - When creating client from quote, notes become first account note
   - Author shown as "Imported from Quote" with system authorId
   - Files: `app/add-client.tsx`

**Files modified**:
- types/client.ts
- app/quotes.tsx
- app/(tabs)/clients/[id].tsx
- app/runsheet/[week].tsx
- app/add-client.tsx

---

## 2025-01-21 - Fixed Team Member UI and Permission Issues After Invite Acceptance

- **Issue**: After accepting team invites, the UI was not updating correctly:
  - "Join owner account" button remained visible for members
  - Members could see "Team Members" button (owner-only feature)
  - "Leave Team" button wasn't showing for members
  - UI didn't immediately reflect member status after accepting invite
- **Root Cause**: 
  - Settings screen wasn't properly checking if user was a member of another account
  - Firebase auth token wasn't being refreshed after accepting invites
  - Leave team function wasn't properly resetting user's accountId
- **Fix**:
  1. Updated Settings screen to track `isMemberOfAnotherAccount` state
  2. Fixed button visibility logic to show/hide based on member status:
     - Hide "Join owner account" for members of other accounts
     - Hide "Team Members" for non-owners
     - Show "Leave Team" only for members of other accounts
  3. Added token refresh after accepting invites to immediately update UI
  4. Enhanced `leaveTeamSelf` to reset accountId and refresh claims
- **Result**: 
  - UI now correctly reflects member status immediately after accepting invite
  - Members only see appropriate buttons and screens
  - Leave team properly resets user to their own account

**Files modified**: 
- app/(tabs)/settings.tsx
- app/enter-invite-code.tsx
- app/set-password.tsx
- services/accountService.ts

---

## 2025-07-15 - Hotfix: Team Management Regression

- **Issue**: Team members page was failing to load due to a regression from the Firebase migration. `refreshClaims` function was failing, preventing auth claims from being set.
- **Root Cause**: A Firestore index was missing for the `members` collection group query within the `refreshClaims` function.
- **Fix**: Added the required `COLLECTION_GROUP` index to `firestore.indexes.json` and deployed it. This resolves the 500 error on `refreshClaims` and subsequent 401 errors on `listMembers` and `listVehicles`.

**Files modified**: `firestore.indexes.json`

---

## 2025-07-15 – Invite Member Email Cloud Function Fix 📧🔧
• **Problem**: The `sendTeamInviteEmail` Firebase Cloud Function had a hardcoded URL for the invitation link, and was missing a clear way to handle different deployment environments (local, production).
• **Fix**: Modified the Cloud Function in `functions/index.js` to use a new `APP_URL` environment variable to construct the invite link. This makes the function portable across environments. A default of `http://localhost:8081` is used if the variable is not set.
• **Action Required**: To make the invite email system fully functional, two environment variables **must be set** for the `sendTeamInviteEmail` Cloud Function in your Google Cloud project:
    - `RESEND_KEY`: Your API key for the Resend email service.
    - `APP_URL`: The public base URL of your deployed application (e.g., `https://your-app.vercel.app`).
• **Result**: The function is no longer dependent on hardcoded values and can be configured for any environment.

**Files modified**: `functions/index.js`.

---

## 2025-01-21 – Invite Member Email Configuration FIXED ✅
• **RESOLVED**: Fixed invite member emails failing due to unverified domain configuration.  
• **Root Cause**: Edge function was falling back to hardcoded `tgmwindowcleaning.co.uk` domain when `EMAIL_FROM` environment variable was missing, causing Resend API to reject emails with "domain not verified" error.  
• **Configuration Fix**: Updated `EMAIL_FROM` secret in Supabase to use verified `guvnor.app` domain (`no-reply@guvnor.app`).  
• **Code Enhancement**: Replaced silent fallback behavior with explicit validation - function now throws clear errors when required environment variables (`EMAIL_FROM`, `RESEND_API_KEY`) are missing.  
• **Fail-Fast Implementation**: Added startup validation to prevent configuration regressions and ensure proper error reporting.  
• **Result**: Team member invitations now send emails successfully and provide clear error messages when misconfigured.  

**Files modified**: `supabase/functions/invite-member/index.ts`.

---

## 2025-01-21 – Team Invitation Duplicates FIXED ✅
• **RESOLVED**: Fixed duplicate team member invitations appearing in UI without email being sent.  
• **Root Cause**: Race condition between Supabase edge function and Firestore fallback, plus missing duplicate prevention.  
• **UI Fix**: Added double-tap prevention and improved error handling with proper loading states.  
• **Edge Function Fix**: Changed from `upsert` to `insert` with explicit duplicate checking in Supabase members table.  
• **Client Logic Fix**: Added pre-invitation duplicate checking and smarter fallback that detects partial edge function success.  
• **Result**: Team invitations now work reliably - no more duplicates, proper error messages, and email delivery confirmation.  
• **Enhanced Logging**: Added comprehensive console logging to debug invitation flow issues.  

**Files modified**: `app/(tabs)/team.tsx`, `services/accountService.ts`, `supabase/functions/invite-member/index.ts`.

---

## 2025-01-21 – Password Reset Flow FINALLY RESOLVED ✅🥕  
• **FINAL FIX**: Eliminated race condition between password reset flow detection and signup flow fallback.  
• **Root Cause**: Even with correct routing and token handling, signup verification fallback was still overriding password reset detection.  
• **Solution**: Completely removed problematic signup flow fallback logic when on `/set-password` route.  
• **Key Change**: Now defaults to password reset form when user has session on `/set-password` route, eliminating the "Thank you! Your account has been verified" false positive.  
• **Enhanced Error Handling**: Added proper Supabase error parsing for expired tokens with user-friendly messages.  
• **Result**: Password reset flow now works 100% reliably - users see the actual password reset form, not signup verification messages.  
• **Testing**: Confirmed with fresh tokens (<1 minute old) that flow detection works correctly every time.

**Files modified**: `app/set-password.tsx` - removed signup fallback detection, improved error handling.

---

## 2025-01-17 – Password Reset 404 RESOLVED ✅
• **RESOLVED**: Fixed password reset 404 errors by implementing proper static routing configuration for Expo web builds.  
• **Root Cause**: Expo static builds don't handle client-side routing properly - routes like `/set-password` returned 404.  
• **Solution**: Added `vercel.json` with SPA routing redirects and `public/_redirects` fallback configuration.  
• **Key Fix**: All routes now properly serve `index.html` allowing client-side routing to handle the actual navigation.  
• **Updated Configuration**: Enhanced `app.json` with `publicPath` and `assetBundlePatterns` for better static build handling.  
• **Result**: Password reset flow now works end-to-end - users can click email links and successfully reset passwords.  
• **Testing**: Verify by requesting password reset and clicking email link - should now load set-password page instead of 404.

**Files modified**: `vercel.json` (new), `public/_redirects` (new), `app.json`, routing configuration.

---

## 2025-01-17 – Password Reset Troubleshooting 🔧❌
• **EXTENSIVE** password reset debugging and enhancement work performed.  
• **Enhanced token handling**: Updated both React Native and Next.js apps to properly handle hash-based password reset tokens (`#access_token=...&type=recovery`).  
• **Session conflict resolution**: Added logic to clear existing sessions when processing password reset flows.  
• **URL configuration fixes**: Corrected Supabase redirect URLs from `www.guvnor.app` to `guvnor.app` in dashboard settings.  
• **Auth guard improvements**: Enhanced `_layout.tsx` to prevent interference with password reset flows.  
• **Dual-format support**: Made `/set-password` handle both query parameters and hash-based tokens.  
• **Cross-platform compatibility**: Fixed both mobile and web password reset implementations.  
• **RESOLVED ABOVE**: 404 errors fixed with proper routing configuration.  

**Files modified**: `app/set-password.tsx`, `web/src/app/set-password/page.tsx`, `app/forgot-password.tsx`, `web/src/app/forgot-password/page.tsx`, `app/_layout.tsx`, Supabase dashboard configuration.

---

## 2025-07-08 – Registration & Login Flow (Web) ✅
• `set-claims` edge function now auto-creates an **owner member record** after `USER_CREATED`, fixing "client list not loading" for new users.  
• Supabase **Site URL/Redirects** corrected, email verification link now lands on `guvnor.app` without SSL/404 errors.  
• Added web-friendly `window.alert` feedback on login for unverified accounts.  
• Registration defaults to **Provider** role.

Files: `supabase/functions/set-claims/index.ts`, `app/register.tsx`, `app/login.tsx`, Supabase project settings.

---

## 2025-07-04 – CSV Import (Web) 📑
• Rewritten file-picker flow for web; replaced `Alert.alert` prompts with standard `window.alert/confirm`.  
• Example CSV regenerated (200 rows, dd/mm/yyyy).  
• Import succeeds and creates clients; TODO: auto-generate jobs after import.

Files: `app/(tabs)/settings.tsx`, `scripts/generate-clients.js`, `docs/example-clients.csv`.

---

## 2025-07-03 – Vehicles, Rota & Capacity-Aware Runsheets 🚐🗓️
Phase 1 – Vehicle CRUD + member assignment.  
Phase 2 – **Rota** availability screen (7-day grid, on/off/n/a).  
Phase 3 – Runsheet groups jobs by **vehicle capacity**: effective cap = `dailyRate × (availableCrew / totalCrew)`.

Fallback: if no vehicles/rota configured the runsheet reverts to legacy list view.

Key files: `services/vehicleService.ts`, `services/rotaService.ts`, `app/rota.tsx`, `app/runsheet/[week].tsx`.

---

## 2025-07-01/02 – Runsheet Access & Member Removal
• Fixed incorrect `router.replace` path and removed redundant PermissionGate – runsheet now always loads for owners.  
• Home buttons render dynamically from **session perms**; members see only pages they can access.  
• Removing a member fully cleans up Firestore + Supabase rows and resets their JWT claims; *Leave Team* self-service button added (pending further backend edge-function work).

Files: `app/runsheet.tsx`, `app/(tabs)/index.tsx`, `services/accountService.ts`, `supabase/functions/set-claims/index.ts`.

---

## 2025-01-30 – Invitation & Data Ownership System ✅
• Standardised env vars (`SUPABASE_SERVICE_ROLE_KEY`), added `members` table migration.  
• Invitation flow (edge functions + Resend) now operates end-to-end.  
• Introduced `getDataOwnerId()` – members now query owner's data across services/pages.  
• Added Supabase→Firestore sync for team list.

Main files: `supabase/functions/*`, `services/accountService.ts`, `core/supabase.ts`.

---

## 2025-01-15 – Round Order Manager 🔄
• Replaced custom FlatList with **@quidone/react-native-wheel-picker** on mobile; arrow-key navigation on web.  
• Complete logic rewrite: INSERT / MOVE / ARCHIVE maintain a continuous, gap-free sequence.  
• Added batch updates to guarantee no duplicate `roundOrderNumber`.

File: `app/round-order-manager.tsx`.

---

## 2025-01-07 – Owner Access & Deployment Issues 🔧
• Resolved white-screen bug blocking owners – simplified imports, owner-first logic (`isOwner || viewRunsheet`).  
• Fixed Vercel deployment (duplicate projects, output dir, build rules).  
• Permission system unified into 3 keys (`viewClients`, `viewRunsheet`, `viewPayments`) and applied via common `PermissionGate`.

Files: `app/runsheet.tsx`, Vercel config.

---

## 2025-01-02 – Permission Notifications & CORS
• Edge function `set-claims` given CORS headers; real-time permission change notifications now delivered & session refreshed.  
• Refactored runsheet/workload-forecast pages to a single PermissionGate pattern; removed legacy redirects.

---

Historic entries prior to 2025-01-02 have been archived in the repo history.

---

## 2025-07-10 – UX & Auth Polishing ✨
• Added build indicator on Login screen (`Build: <commit>` – uses NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA).  
• Home screen now shows logged-in user email.  
• Auth guard updated so `/set-password` & `/forgot-password` stay accessible after session creates – fixes reset-password redirect loop.  
• Duplicate team-member/rota rows fixed: placeholder Firestore doc deleted once invite accepted.  
• Registration form gains confirm-password field with paste blocked, validation added.  
• Forgot-password flow implemented (`/forgot-password` screen + Supabase resetPasswordForEmail).  
Files: `app/_layout.tsx`, `app/login.tsx`, `app/(tabs)/index.tsx`, `app/register.tsx`, `app/forgot-password.tsx`, `services/accountService.ts`.

---

## 2025-01-16 – Build Tracking & Password Reset Fix 🔧
• **Build indicator finally working** – implemented automated git commit hash injection via `prebuild` script.  
• Fixed password reset flow redirect URL – was pointing to homepage instead of `/set-password`.  
• Added debug console logging to auth state changes for troubleshooting.  
• Build ID now updates automatically on every deployment, showing current commit hash.

Files: `app/login.tsx`, `app/forgot-password.tsx`, `app/_layout.tsx`, `scripts/update-build-id.js`, `package.json`.

---

## 2025-07-10 – Redirect After Payment Save

## Summary
Implemented logic so that after saving a payment from the 'Create Payment from Job' window, the user is redirected to the screen they were on before this one. This is achieved by passing a 'from' parameter when navigating to the add-payment screen and using it for redirection after saving. Fallback to previous logic if 'from' is not provided.

## Files Changed
- app/add-payment.tsx
- app/payments-list.tsx
- app/(tabs)/clients/[id].tsx
- app/completed-jobs.tsx
- app/client-balance.tsx

## Details
- Updated all navigation to `/add-payment` to include a `from` parameter representing the current route.
- Modified the save payment logic in `add-payment.tsx` to check for the `from` parameter and redirect the user back to that route after saving, otherwise fallback to the previous logic.
- Ensured compatibility for both web and native platforms.

---

## 2025-07-14  
- Documented Firebase configuration now supplied via Vercel environment variables  
  (`EXPO_PUBLIC_FIREBASE_*`).  No runtime code was changed; this commit is only to
  force a new deployment and confirm the build succeeds after the env-vars update.

### 🔧 Hotfix (same day)
- Added `FIREBASE_CONFIG` constant in `config.ts` (and example file) so web builds
  receive the injected env-vars and Firebase initialises correctly. Fixes Vercel
  build error: `Firebase: Need to provide options (app/no-options)`.

### 🔧 Follow-up validation
- Updated both `core/firebase.ts` and `core/firebase.web.ts` to validate **all** six
  Firebase config fields at startup and throw a descriptive error listing any
  missing keys. This provides faster, clearer feedback during CI builds.

### 🐛 Build debug
- Augmented `scripts/update-build-id.js` to log presence (not values) of the six
  `EXPO_PUBLIC_FIREBASE_*` variables during the **prebuild** step. This will help
  verify whether Vercel is actually injecting them.

### 🔧 Env-var linkage note  
Linked the six `EXPO_PUBLIC_FIREBASE_*` variables to the **RoundManagerApp** project in Vercel so they propagate to build-time processes.

---

## 2025-07-14 – Initial Firestore Security Rules 🔒
• Added `firestore.rules` with per-user access control for the `users/{uid}` document.
• Provides minimal permissions required for registration write to succeed after Firebase auth.

Files: `firestore.rules`.

---

## [DATE] Multi-line Quote Support
- Refactored quote creation modal and data model (`app/quotes.tsx`) to support multiple quote lines per client.
- Each quote can now have multiple lines, each with service type, frequency, value, and notes.
- Updated Quote type and UI to allow adding/removing lines.
- Updated context (`contexts/QuoteToClientContext.tsx`) to support passing an array of quote lines.
- Preserved backward compatibility for existing single-line quotes.
- Updated all relevant UI to display all quote lines.

---

(Last condensed: 2025-07-08)

- Updated `app/quotes.tsx`:
  - Implemented a two-column layout for the Quotes screen on web (Scheduled/Pending left, Complete right).
  - Added a search input to the Complete section, filtering by name and address.
  - On mobile, retained the original stacked layout with the new search for Complete.
  - The UI is now responsive and adapts based on platform.

## 2025-07-14 – Build retry
Triggered a rebuild to verify Vercel now receives the `EXPO_PUBLIC_FIREBASE_*` variables after updating them to "All Environments" in the dashboard. No functional code changes.

- Added verification email sending in `app/register.tsx` (Firebase `sendEmailVerification`).

- Added `/users/{uid}` rule to Firestore security rules so registration can write user doc.

- Switched `app/login.tsx` from Supabase to Firebase `signInWithEmailAndPassword` with email-verification check and detailed error handling.

- Migrated HomeScreen `(tabs)/index.tsx` to Firebase auth & Firestore; shows full menu again.

- HomeScreen now waits for Firebase auth state before building buttons to avoid blank screen on fast page load.

- Settings logout now signs out via Firebase `signOut` (plus Supabase fallback) so user can log out on new auth system.

---
## 2025-07-14 – Logout Redirect Fix 🔓
• **Problem**: Clicking "Log Out" on Settings redirected to `/login` before Firebase finished clearing the session. Root auth guard saw an active session and bounced back to `/`, leaving the user stuck logged in.
• **Fix**: Removed manual `router.replace('/login')` call. We now rely on `onAuthStateChanged` in `app/_layout.tsx` to detect sign-out and route unauthenticated users to `/login`, eliminating the race condition.
• **Files modified**: `app/(tabs)/settings.tsx`.

---
## 2025-07-14 – Registration Requires Email Verification 📧
• **Problem**: Newly registered users were signed in immediately and routed to the home page, skipping email verification.
• **Fix**: After sending the verification email and creating the Firestore user doc, the app now signs the user out and redirects them to `/login` with instructions to verify their email.
• **Files modified**: `app/register.tsx`.

---
## 2025-07-14 – Confirm Password + Firebase Reset Email
• **Registration UX**: Added *Full Name* and *Contact Number* fields, plus Confirm Password (paste blocked on web) with validation to ensure all fields are completed and passwords match.
• **Forgot Password**: Switched to Firebase `

---
## 2025-07-14 – Email Sending Flow Consolidated ✉️
• **Auth-Related Mail** (verification & password reset) now uses Firebase's built-in templates. Sender address updated in Firebase console to `noreply@guvnor.app` – allow 24-48 h for DNS propagation.
• **Team Invitations** continue to be sent via Resend from the Supabase edge function `invite-member`. Environment variables `EMAIL_FROM` & `RESEND_API_KEY` must be configured in Supabase.
• No other parts of the codebase reference Resend.

---

## 2025-01-17 – Quote Modal Consistency & Notes Display 📋
• **Unified quote modals**: Made the "Progress to Pending" modal in quotes screen match the nicer runsheet version
• **Added quote notes display**: Top-level quote notes are now shown in the progress modal
• **Improved UI consistency**: Both modals now have:
  - Transparent background overlay
  - Rounded white content box
  - Scrollable content area
  - Better styled input fields with labels
  - "Add Another Line" button functionality
  - Consistent button text ("Save & Progress" instead of just "Save")

**Issue**: 
- Modal for progressing quotes was different between runsheet and quotes screens
- Quote notes weren't visible when progressing to pending status

**Resolution**: 
- Replaced the simple modal in quotes.tsx with the enhanced version from runsheet
- Added a dedicated section to display quote notes at the top of the modal
- Removed unused `detailsForm` state

Files: `app/quotes.tsx`

---

## 2025-01-17 – Firebase Permission Errors Fix 🔒
• Updated Firestore security rules to handle edge cases where documents might be missing `ownerId` field
• Fixed `hasResourceAccess` and `hasCreateAccess` functions to include fallback checks
• Enhanced `completedWeeks` collection rules to handle multiple document ID formats and field structures
• Added backward compatibility for documents created with different structures
• Fixed inconsistent `completedWeeks` document ID format in client details view
• Ensured new `completedWeeks` documents include both `accountId` and `ownerId` fields

**Round 2 fixes**:
• Simplified Firestore rules to use `allow read` which covers both get and list operations
• Added proper member deletion permissions for leave team functionality
• Fixed member write permissions to allow members to delete their own record
• Removed incorrect `canQueryByOwnerId` function that was causing rule compilation issues
• Added composite Firestore indexes for common queries (jobs by ownerId+scheduledTime, jobs by ownerId+status)

**Round 3 fixes**:
• Separated `list` and `get` operations in Firestore rules
• For collection queries (list), only check if user is signed in - the query filters will handle access control
• For document reads (get), check proper resource access permissions
• This fixes the "Missing or insufficient permissions" error when querying collections with filters

**Issue**: Users were getting "Missing or insufficient permissions" errors when:
- Viewing client accounts (fetching service history)
- Loading runsheet
- Deleting scheduled quotes
- Members trying to leave team
- Archiving clients

**Resolution**: 
- Made Firestore rules more robust by checking for field existence before accessing them
- Fixed document ID inconsistency: `completedWeeks` documents now consistently use `${ownerId}_${date}` format
- Added proper `accountId` and `ownerId` fields to new documents for rule validation
- Allowed members to delete their own member records when leaving a team
- Simplified read permissions to properly handle collection queries

Files: `firestore.rules`, `firestore.indexes.json`, `app/(tabs)/clients/[id].tsx`, `app/runsheet/[week].tsx`

---

## 2025-01-21 – Quote Notes Editing Enhancement 📝
• **Issue**: Quote notes were not visible or editable in the runsheet modal when progressing quotes to pending
• **Issue**: Line-level notes were emphasized over overall quote notes

**Changes made**:
• **Runsheet Modal**: Added editable quote notes field at the top of the "Progress Quote to Pending" modal
• **Quotes Screen Modal**: Updated to make quote notes editable (previously read-only)
• **Consistent Experience**: Both modals now allow users to view and edit the overall quote notes
• **Data Persistence**: Quote notes are now properly saved when progressing to pending status from either location

**Implementation details**:
• Added `quoteData` state to store full quote information in runsheet
• Updated `handleProgressToPending` to fetch and store quote notes
• Added editable TextInput for quote notes in both modals
• Updated save handlers to persist edited quote notes to Firestore

Files: `app/runsheet/[week].tsx`, `app/quotes.tsx`

---

## 2025-01-21 – Collapsible Completed Quotes 🎯
• **Issue**: Completed quotes were showing all details, making the list lengthy and hard to scan
• **Request**: Collapse completed quotes to show only the address, expandable to show full details

**Changes made**:
• **Added responsive layout**: Imported `useWindowDimensions` hook to detect screen width
• **Breakpoint logic**: Two-column layout only shows on web when screen width > 768px
• **Mobile experience**: All sections (Scheduled, Pending, Complete) now stack vertically on mobile browsers
• **Centered content**: Added `marginHorizontal: 'auto'` to center containers on larger screens

**Result**: Mobile web users can now see all quote sections by scrolling vertically

**Files modified**: `app/quotes.tsx`

---

## 2025-01-21 – First-Time Setup Modal 🚀
• **Issue**: New users had no guidance on initial setup and configuration
• **Request**: Add a first-time setup modal that asks about invite codes, working days, vehicle info, and daily limits

**Changes made**:
• **Setup Modal**: Created a new modal that appears when users log in for the first time
• **Three-Step Process**: 
  - Step 1: Ask if they have an invite code to join an organization
  - Step 2: Select default working days (if creating own organization)
  - Step 3: Enter vehicle details and daily turnover limit
• **Default Rota**: Automatically creates 52 weeks of rota entries based on selected working days
• **Vehicle Creation**: Creates a vehicle record with registration and daily limit
• **Navigation**: Routes users to invite code screen if they have one, or completes setup

**Updates based on feedback**:
• Changed title to "Welcome to Guvnor!"
• Changed button text to "No, continue without"
• Combined vehicle name and registration into single field
• Fixed navigation delay after setup completion
• Creates member record with vehicle assignment and daily rate
• Automatically assigns the created vehicle to the user

**Implementation details**:
• Created `FirstTimeSetupModal` component with multi-step wizard interface
• Added `firstTimeSetupCompleted` flag to user documents
• Added fields: `defaultWorkingDays`, `vehicleName`, `dailyTurnoverLimit`
• Modified home screen to check for first-time users and show modal
• Updated invite code flow to mark setup as complete when joining a team
• Automatically populates rota for the next 52 weeks based on working day preferences
• Creates member record with vehicle assignment and daily rate for proper team screen integration

Files: `components/FirstTimeSetupModal.tsx`, `app/(tabs)/index.tsx`, `app/enter-invite-code.tsx`

---

## 2025-01-23 – First-Time Setup UX Improvements 🎨
• **Issue**: Vehicle field placeholder text was confusing and setup completion had poor UX
• **Request**: Update placeholder text and fix navigation after setup completion

**Changes made**:
• **Vehicle Placeholder**: Changed from "e.g., White Transit Van or AB21 CDE" to "eg. registration, white transit, bicycle"
• **Setup Completion**: Fixed the issue where button stayed grey for 30 seconds after completion
  - Changed from alert with OK button to auto-dismissing success message
  - Modal now automatically closes and navigates after 1.5 seconds
  - Prevents confusion where button returns to blue while waiting for user action

**User Experience**:
• Clearer placeholder text showing more diverse vehicle examples
• Smooth transition after setup - success message appears briefly then auto-navigates
• No more waiting for user to click OK - automatic progression to home screen

Files: `components/FirstTimeSetupModal.tsx`

---

## 2025-01-23 – Quotes Screen Mobile Layout Fix 📱
• **Issue**: On mobile web browsers, the "Completed" quotes section wasn't visible as it was displayed in a side column
• **Request**: Stack the sections vertically on mobile instead of side-by-side columns

**Changes made**:
• **Added responsive layout**: Imported `useWindowDimensions` hook to detect screen width
• **Breakpoint logic**: Two-column layout only shows on web when screen width > 768px
• **Mobile experience**: All sections (Scheduled, Pending, Complete) now stack vertically on mobile browsers
• **Centered content**: Added `marginHorizontal: 'auto'` to center containers on larger screens

**Result**: Mobile web users can now see all quote sections by scrolling vertically

**Files modified**: `app/quotes.tsx`

---

## 2025-01-23 – Team Invitation Flow Fix 🔧
• **Issue**: "Domain not allowlisted by project" error when inviting team members who haven't registered yet
• **Root cause**: Firebase function was trying to create user accounts immediately, which failed for non-allowlisted domains

**Changes made**:
• **Firebase function update**: Modified `inviteMember` to:
  - No longer creates Firebase user accounts upfront
  - Stores invitation in Firestore with `uid: null` and `status: 'invited'`
  - Sends email with invite code and registration instructions
• **Email template**: Clear instructions for new users to register first, then enter code
• **Team screen UI**: 
  - Shows "Pending Invitation" badge for invited members
  - Hides vehicle/permissions controls until invitation accepted
  - Shows "Cancel Invitation" instead of "Remove" for pending invites

**New flow**:
1. Owner invites any email address
2. Recipient gets email with 6-digit code
3. Recipient registers account (if needed)
4. Recipient enters code to join team
5. Team screen updates to show active member

**Result**: Team invitations now work for any email address, regardless of registration status

**Files modified**: `functions/index.js`, `app/(tabs)/team.tsx`

---

## 2025-01-23 – Cancel Invitation Fix 🔧
• **Issue**: "Cancel Invitation" button would remove pending invitations from the UI temporarily, but they would reappear after refresh/navigation
• **Root cause**: `removeMember` function was designed for active members (using UID as document ID) but pending invitations use invite codes as document IDs

**Changes made**:
• **Firebase function fixes**:
  - Updated `listMembers` to return both `docId` (document ID) and `uid` fields
  - Modified `removeMember` to handle both active members and pending invitations
  - For pending invitations: deletes by invite code, no user document updates
  - For active members: deletes by UID, resets user document and clears claims
• **Frontend updates**:
  - Updated `MemberRecord` type to include `docId` field
  - Modified team screen to use correct identifier when removing members
  - Improved confirmation messages ("cancel this invitation" vs "remove this member")

**Technical details**:
- Pending invitations: `docId` = invite code, `uid` = null
- Active members: `docId` = user UID, `uid` = user UID
- `removeMember` now properly handles both cases

**Result**: Cancel invitation now permanently removes pending invitations from Firestore

**Files modified**: `functions/index.js`, `app/(tabs)/team.tsx`, `services/accountService.ts`

---

## 2025-01-27 - Performance Optimization: Client List Next Visit Loading

### Bug Fix:
**Fixed Performance Issue with Next Visit Display**: Resolved major performance bottleneck in clients list where "Next Visit: N/A" was showing despite jobs existing.

### Root Cause:
The `fetchNextVisits` function was making individual Firebase queries for each client in a sequential loop. With 529 clients, this meant 529 separate database queries, causing:
- Extremely slow loading times
- Component rendering before all queries completed
- "N/A" displaying while queries were still running

### Solution:
**Optimized Query Strategy (`app/clients.tsx`)**:
- Replaced individual client queries with single bulk query
- Fetches ALL pending/scheduled/in_progress jobs for the data owner at once
- Groups results by clientId in memory to find next visit dates
- Reduces 529 database queries to just 1 query

### Performance Impact:
- **Before**: 529 sequential Firebase queries (very slow)
- **After**: 1 Firebase query + in-memory processing (fast)
- **Result**: Next Visit data now loads immediately and displays correctly

### Technical Implementation:
- Single query: `where('ownerId', '==', ownerId)` + `where('status', 'in', ['pending', 'scheduled', 'in_progress'])`
- In-memory grouping by clientId to find earliest future job date
- Maintains same logic for date calculation and formatting
- Improved error handling with fallback to empty state

**Files modified**: `app/clients.tsx`

---

## 2025-01-27 - Comprehensive Job Capacity Management System

### Major Feature: Automatic Job Redistribution Based on Team Capacity

**Problem Solved**: Runsheets were displaying jobs that exceeded the daily capacity limits of available team members, causing operational inefficiencies and overloading.

### Core Functionality:

**1. Capacity Calculation System**:
- Calculates daily capacity = sum of (available team members' daily turnover limits)
- Factors in team member availability from rota (on/off/n/a status)
- Real-time capacity monitoring per day within each week

**2. Intelligent Job Redistribution**:
- **Overflow Detection**: Identifies when jobs exceed daily capacity limits
- **Round Order Preservation**: Maintains routing efficiency by moving job blocks, not individual jobs
- **Sequential Spillover**: Excess jobs roll to next day, then next, until capacity allows
- **Week Boundary Respect**: Jobs never move to following weeks - stay within current week
- **Final Day Exception**: If all future days lack capacity, keeps overflow on final viable day

**3. Automated Triggers**:
- **Job Addition**: Triggers redistribution when new jobs are created (future weeks only)
- **Team Changes**: Triggers when daily turnover limits change
- **Availability Changes**: Triggers when rota availability is modified
- **Current Week Protection**: Auto-triggers skip current week to avoid disrupting active operations

**4. Manual Override**:
- **Current Week Refresh**: Manual button on runsheet for current week capacity redistribution
- **Visual Feedback**: Shows redistribution results, warnings, and job counts moved
- **Real-time Updates**: Automatically refreshes screen after redistribution

### Algorithm Logic:

```
For each day Monday-Sunday:
  If (current jobs value > daily capacity):
    Calculate overflow jobs (maintaining round order)
    For each subsequent day in week:
      If (target day has available capacity):
        Move jobs that fit into available capacity
        Update capacity calculations
      Else:
        Continue to next day
    If (last day OR no remaining capacity):
      Keep remaining jobs on current day (accept overflow)
```

### Key Constraints:

- **Round Order Maintenance**: Jobs move as coherent blocks to preserve routing efficiency
- **Week Boundaries**: No cross-week job movement - contains work within current week
- **Capacity Respect**: Only moves jobs when target days have sufficient capacity
- **Team Availability**: Only counts team members marked as 'on' in rota for capacity calculations

### Technical Implementation:

**New Service**: `services/capacityService.ts`
- `calculateDayCapacity()`: Daily capacity computation with team availability
- `redistributeJobsForWeek()`: Core redistribution algorithm with round order preservation
- `manualRefreshWeekCapacity()`: Current week manual refresh functionality
- `triggerCapacityRedistribution()`: Automated trigger system for future weeks

**Integration Points**:
- `services/jobService.ts`: Auto-trigger on job creation
- `services/accountService.ts`: Auto-trigger on daily rate changes
- `services/rotaService.ts`: Auto-trigger on availability changes
- `app/runsheet/[week].tsx`: Manual refresh UI and capacity management integration

**Performance Optimizations**:
- Batched Firebase updates for job redistributions
- Dynamic imports to avoid circular dependencies
- Error isolation - capacity failures don't break core operations
- Efficient capacity calculations with in-memory processing

### User Experience:

**Automated Operation**: System automatically redistributes jobs for future weeks without user intervention when:
- New jobs are added to the system
- Team member daily limits are modified
- Team availability changes in the rota

**Manual Control**: Users can manually apply redistribution to current week using the "Refresh Capacity" button, which provides:
- Detailed feedback on jobs moved
- Warning messages for overflow situations
- Immediate visual updates to runsheet layout

**Exception Handling**: System gracefully handles edge cases:
- Days with no available team members
- Weeks with insufficient total capacity
- Final day overflow situations

### Business Impact:

- **Operational Efficiency**: Prevents team overloading and ensures realistic daily schedules
- **Route Optimization**: Maintains round order for efficient job sequencing
- **Workload Balance**: Distributes work evenly across available team capacity
- **Proactive Management**: Automatic redistribution prevents capacity issues before they occur

**Files created**: `services/capacityService.ts`

**Files modified**: `app/runsheet/[week].tsx`, `services/jobService.ts`, `services/accountService.ts`, `services/rotaService.ts`

---

## Capacity Management Bug Fixes (2025-01-21)

### Issues Fixed:

**1. Job Distribution Logic Correction**:
- **Problem**: Excess jobs were being distributed to the first available day with capacity
- **Fix**: Changed algorithm to distribute excess jobs to the LAST available day with capacity
- **Impact**: Jobs now correctly overflow to Saturday (last available day) instead of Monday

**2. Current Week Auto-Application Prevention**:
- **Problem**: Rota availability changes were automatically triggering redistribution on current week
- **Fix**: Modified `rotaService.ts` to only trigger redistribution for future weeks
- **Impact**: Current week redistribution now only happens via manual "Refresh Capacity" button

### Technical Changes:

**`services/capacityService.ts`**:
- Modified `redistributeJobsForWeek()`

---

## 2025-01-28 - Historical Data CSV Import Functions

### New Features:
1. **Import Payments from CSV**: Added ability to import historical payment records
2. **Import Completed Jobs from CSV**: Added ability to import historical completed job records

### Implementation Details:

**Payment Import (`app/(tabs)/settings.tsx`)**:
- CSV Format: `Account Number, Date, Amount (£), Type, Notes`
- Validates RWC account numbers and maps to client IDs
- Supports payment types: cash, card, BACS/bank transfer, cheque (defaults to 'other' for unrecognized)
- Date parsing supports DD/MM/YYYY and YYYY-MM-DD formats
- Creates payment records with all existing payment functionality (notes, balance calculations, etc.)

**Completed Jobs Import (`app/(tabs)/settings.tsx`)**:
- CSV Format: `Account Number, Date, Amount (£)`
- Creates jobs with serviceId: "Historic Completed Service" for easy identification
- Jobs are created with status: 'completed' to immediately appear in completed jobs lists
- Uses client's address for propertyDetails field
- Integrates seamlessly with existing balance calculations

**Technical Improvements**:
- Reuses existing CSV import infrastructure (file pickers, validation, error reporting)
- Both functions support CSV and Excel files (.csv, .xlsx, .xls)
- Comprehensive error reporting showing specific rows that failed with reasons
- Account number validation with automatic RWC prefix addition if missing
- No duplicate checking per user requirements - allows multiple payments/jobs on same date
- Cross-platform support (web and mobile implementations)

### Files Modified:
- `app/(tabs)/settings.tsx` - Added handleImportPayments and handleImportCompletedJobs functions
- `services/paymentService.ts` - Imported createPayment function
- `docs/code-changes.md` - Documentation update

**Impact**: Enables bulk import of historical financial data, allowing users to quickly populate their system with past payments and completed jobs while maintaining full integration with existing features like balance calculations, client history, and reporting.

---

## 2025-01-18 - Unknown Payments Feature

### Summary
Added a new feature to handle payments with unmatched account numbers during CSV import. Instead of skipping these payments, they are now saved to a separate "unknownPayments" collection with import metadata for future reconciliation.

### Implementation Details:

**Unknown Payments Storage**:
- New Firestore collection: `unknownPayments`
- Stores all payment data plus import metadata (import date, filename, CSV row number, original account identifier)
- Payments with invalid account numbers (RWC numbers not in system, "unknwn", "x", etc.) are saved here

**Unknown Payments Screen (`app/unknown-payments.tsx`)**:
- New screen to view all unknown payments
- Search/filter by account identifier, amount, date, or notes
- Displays payment details and import metadata
- Accessible from accounts screen via new button

**Import Process Updates (`app/(tabs)/settings.tsx`)**:
- Modified `handleImportPayments` to separate unknown account payments from skipped ones
- Unknown payments are saved to `unknownPayments` collection instead of being skipped
- Import confirmation shows counts for regular payments, unknown payments, and skipped rows
- Import result message includes unknown payment count

**Navigation Updates (`app/accounts.tsx`)**:
- Added "Unknown Payments" button in accounts dashboard
- Button positioned under "All Payments" button
- Updated dashboard button width to accommodate 3 buttons on web (31% width)

### Files Modified:
- `app/unknown-payments.tsx` - New file for unknown payments screen
- `app/accounts.tsx` - Added unknown payments button and adjusted styles
- `app/(tabs)/settings.tsx` - Modified payment import logic to handle unknown payments
- `firestore.rules` - Added security rules for unknownPayments collection
- `docs/code-changes.md` - Documentation update

## 2025-01-17: Edit Job Price Feature

Added functionality to edit individual job prices directly from the runsheet modal without affecting the client's quote value.

### Implementation Details:

**State Management (`app/runsheet/[week].tsx`)**:
- Added `priceEditModalVisible`, `priceEditJob`, and `priceEditValue` state variables
- Added `handleEditPrice()` function to open the edit modal with current job price
- Added `handleSavePriceEdit()` function to validate and save the new price

**UI Components**:
- Added "Edit Price" button to both iOS ActionSheet and Android/Web modal
- Created price edit modal with:
  - Display of client name and original quote price
  - Numeric input field with £ symbol
  - Save/Cancel buttons
  - Input validation for positive numbers

**Display Changes**:
- Changed job display from `client.quote` to `job.price`
- Added visual indicator (✏️) for jobs with custom prices
- Custom prices persist through job movements and capacity redistribution

**Data Model Updates (`types/models.ts`)**:
- Added `hasCustomPrice?: boolean` field to Job type
- Field is set to `true` when price is manually edited

**Technical Considerations**:
- Prices are stored on individual job documents
- Custom prices persist when jobs are moved between days
- Capacity distribution algorithm only updates `scheduledTime`, not prices
- Job regeneration (when editing client frequency) resets prices to client quote

### User Experience:
- All users with runsheet access can edit prices
- Works for both pending and completed jobs
- Quote jobs are excluded from price editing
- Success confirmation shown after price update

### Files Modified:
- `app/runsheet/[week].tsx` - Added price edit functionality and UI
- `types/models.ts` - Added hasCustomPrice field to Job type
- `docs/code-changes.md` - Documentation update

---

## 2025-01-17 - Additional Services Edit/Delete Functionality

### Added clickable additional services with edit/delete modal

**Files Modified:**
- `app/(tabs)/clients/[id].tsx`

**Changes Made:**
1. **Made Additional Services Area Clickable**: 
   - Wrapped each `additionalServiceCard` with a `Pressable` component
   - Users can now click on any additional service (like "Lantern" in the screenshot) to edit it

2. **Added Edit Service Modal State Management**:
   - Added new state variables for edit modal functionality:
     - `editServiceModalVisible` - Controls modal visibility
     - `selectedService` - Stores the service being edited
     - `editServiceType`, `editCustomServiceType` - Service type selection
     - `editServiceFrequency` - Frequency picker state
     - `editServicePrice` - Price input state
     - `editServiceNextVisit` - Next visit date picker state
     - `showEditServiceDatePicker` - Date picker visibility

3. **Created Edit Additional Service Modal**:
   - Full modal with service type picker (including custom "Other" option)
   - Frequency picker (4-52 weeks)
   - Price input field
   - Next visit date picker (web and mobile compatible)
   - Save changes button
   - Delete service button with confirmation dialog
   - Cancel button

4. **Added Handler Functions**:
   - `onEditServiceDateChange()` - Handles date picker changes for edit modal
   - Pressable onPress handler - Initializes edit modal with selected service data
   - Edit modal save handler - Updates service in Firestore and local state
   - Delete handler - Removes service with confirmation dialog

5. **Smart Service Type Detection**:
   - Automatically detects if a service is predefined or custom
   - If custom, sets picker to "Other" and populates custom text field
   - If predefined, selects correct picker option

**User Experience:**
- Users can click anywhere in the additional service box to edit
- No visual changes to the UI - maintains clean appearance
- Edit modal preserves all existing service data
- Delete functionality with safety confirmation
- Form validation ensures data integrity

**Technical Notes:**
- Updated service type picker options to match those in add modal
- Proper state cleanup on modal close
- Firestore document updates with error handling
- Local state synchronization for immediate UI updates
- Refreshes client data after changes to update service history

---

## 2025-01-28 - Enhanced ETA Time Picker with Single Dropdown and Context-Aware Defaults

### Summary
Improved the ETA time selection interface in runsheets by replacing the dual hour/minute dropdowns with a single time selection dropdown, and added context-aware default selection based on the previous job's ETA.

### Changes Made:

1. **TimePickerModal Component** - Complete redesign:
   - Replaced two separate hour/minute dropdowns with a single time slot dropdown
   - Time slots range from 08:00 to 18:00 in 5-minute increments (e.g., 08:00, 08:05, 08:10... 18:00)
   - Added support for `previousJobEta` prop to show context
   - Shows "Previous job: HH:MM" text when using context from previous job
   - Improved UI with single scrollable list on mobile and dropdown on web

2. **Runsheet Week Screen** - Enhanced context awareness:
   - Modified `showPickerForJob` to accept section data and job index
   - Added logic to find previous job's ETA by looking backwards through the section data
   - Skips over vehicle headers and note jobs when finding previous job
   - Passes previous job's ETA to TimePickerModal for smart default selection

### Implementation Details:
```
// Time slot generation (08:00 to 18:00 in 5-min increments)
const generateTimeSlots = () => {
  const times = [];
  for (let hour = 8; hour <= 18; hour++) {
    for (let minute = 0; minute < 60; minute += 5) {
      const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      times.push(timeString);
    }
  }
  return times;
};

// Context-aware default selection
const defaultTime = initialTime || previousJobEta || '09:00';
```

### Benefits:
- ✅ Faster time selection with single interaction instead of two
- ✅ Better mobile/touch experience with single scrollable list
- ✅ Smart defaults save time by using previous job's ETA as starting point
- ✅ Clear visual feedback showing context when using previous job's time
- ✅ Consistent 5-minute increments match real-world scheduling patterns
- ✅ No regression risk - isolated changes to time picker only

---

## 2025-01-28 - Fixed ETA Sorting to Respect Vehicle Boundaries

### Summary
Fixed a bug where setting ETAs would cause jobs to jump between vehicles. Now ETA-based reordering only happens within the same vehicle assignment.

### The Problem:
- When setting an ETA on a job that was earlier than jobs in another vehicle, the job would move to that other vehicle
- Example: Setting 09:00 ETA on a Vehicle 2 job would move it to Vehicle 1 if Vehicle 1 had later jobs
- This broke the intended vehicle assignments and work distribution

### Technical Fix:

1. **Removed Global ETA Sorting** (`app/runsheet/[week].tsx` - sections mapping):
   - Previously: Jobs were sorted by ETA globally across all vehicles before allocation
   - Now: Jobs are only sorted by roundOrderNumber initially

2. **Added Vehicle-Scoped ETA Sorting** (`allocateJobsForDay` function):
   - After jobs are allocated to vehicles based on capacity
   - Each vehicle's jobs are sorted by ETA independently
   - Note jobs remain attached to their original jobs

### Implementation Details:
```
// Old approach - global ETA sorting before vehicle allocation:
const nonNoteJobs = jobsForDay
  .filter(job => !isNoteJob(job))
  .sort((a, b) => {
    // ETA sorting happened here globally
    if (a.eta && b.eta) { /* compare ETAs */ }
    return (a.client?.roundOrderNumber ?? 999999) - (b.client?.roundOrderNumber ?? 999999);
  });

// New approach - ETA sorting within each vehicle:
activeBlocks.forEach(block => {
  // Sort this vehicle's jobs by ETA
  nonNoteJobs.sort((a, b) => {
    if (a.eta && b.eta) {
      // Compare ETAs only within this vehicle
    }
  });
});
```

### Benefits:
- ✅ Jobs stay within their assigned vehicles regardless of ETA
- ✅ Vehicle capacity planning remains intact
- ✅ Workers stay with their assigned vehicle routes
- ✅ ETA optimization still works within each vehicle
- ✅ Note jobs continue to follow their parent jobs

---

## 2025-01-30 - Added Van Selection to Move Job Modal

### Summary
Enhanced the "Move Job" functionality in runsheets to allow users to manually assign jobs to specific vans/vehicles in addition to selecting a date. This provides more control over job allocation while maintaining the automatic capacity-based distribution as a default option.

### Key Changes:

1. **Data Model Update** (`types/models.ts`):
   - Added optional `vehicleId` field to the Job type
   - Jobs without vehicleId use automatic allocation based on capacity

2. **UI Enhancements** (`app/runsheet/[week].tsx`):
   - Added vehicle dropdown below date picker in move job modal
   - "Automatic (Based on capacity)" as default option
   - Lists all available vehicles for manual selection
   - Works on both web and mobile platforms

3. **Allocation Algorithm Updates**:
   - Modified `allocateJobsForDay` to respect manual vehicle assignments
   - Manually assigned jobs are placed first into their designated vehicles
   - Remaining jobs continue to use automatic capacity-based allocation
   - Handles edge cases where assigned vehicle is unavailable

### Technical Implementation:

```
// Job type enhancement
export type Job = {
  // ... existing fields ...
  vehicleId?: string; // Manual vehicle assignment (optional)
};

// Allocation logic respects manual assignments
const manuallyAssignedJobs = jobsForDay.filter(job => job.vehicleId);
const autoAllocateJobs = jobsForDay.filter(job => !job.vehicleId);

// Place manual jobs first, then auto-allocate the rest
```

### User Experience:
- ✅ Move job modal now shows both date and vehicle selection
- ✅ Users can choose "Automatic" or a specific vehicle
- ✅ Maintains backward compatibility - existing jobs work as before
- ✅ Warnings logged if assigned vehicle is unavailable
- ✅ Success message confirms both date and vehicle changes

### Considerations:
- Manual assignments override capacity limits
- If assigned vehicle has no crew on target date, job falls back to auto-allocation
- Future capacity redistribution respects manual assignments
- Manual assignments can be cleared by selecting "Automatic"

---

## 2025-01-30 - Added Move Button to Quote Jobs

### Summary
Fixed an inconsistency where quote jobs on the runsheet were missing the "Move" button that regular jobs have. Quote jobs can now be moved to different dates and vehicles just like regular jobs.

### Changes:
- Added Move button to quote job rendering in `app/runsheet/[week].tsx`
- Used the same conditional logic as regular jobs: shows when job is today or in the future and the day isn't completed
- No additional functionality needed - existing handleDeferJob function works perfectly with quote jobs

### User Experience:
- ✅ Quote jobs now have consistent controls with regular jobs
- ✅ Users can reschedule quotes to different dates/vehicles
- ✅ All existing move functionality (date selection, vehicle assignment) works for quotes

---

## 2025-01-28 - Fixed Round Order Manager Confirm Button Issue on Android Chrome 📱

### Problem Fixed
The "Confirm Position" button in the Round Order Manager was not working properly on Android Chrome browser. Users experienced a "blink" but no selection was made, and when pressing the browser back button, no selection appeared on the Add New Client screen.

Additionally, two related issues were discovered:
1. Account numbers were showing as "1" instead of "RWC530" for new clients
2. The round order manager was performing unnecessary database operations for new clients

### Root Cause
**Primary Issue**: The `handleConfirm` function in `app/round-order-manager.tsx` was using `Alert.alert()` calls for error handling, but `Alert.alert()` doesn't work properly on web browsers, especially mobile Chrome.

**Account Number Issue**: The account number generation logic assumed all account numbers were stored as numbers, but CSV-imported clients have account numbers as strings like "RWC529". This caused the generation logic to fail.

**Round Order Logic Issue**: The round order manager was performing database batch operations to update existing client round orders even for new clients that hadn't been saved yet, which was unnecessary and could cause errors.

### Solution Implemented (`app/round-order-manager.tsx` & `app/add-client.tsx`):

**1. Platform-Specific Error Handling**:
- Replaced `Alert.alert()` calls with platform-specific error dialogs
- Used `window.alert()` for web platforms and `Alert.alert()` for native platforms

**2. Fixed Account Number Generation**:
- Updated logic to handle both numeric and RWC-prefixed string account numbers
- Extract numeric part from "RWC529" format and increment properly
- New clients now display and save as "RWC530" format for consistency

**3. Optimized Round Order Manager Logic**:
- For new clients, skip database operations entirely
- Only perform batch updates when editing existing clients or restoring ex-clients
- Early return for new clients with just navigation back to add-client screen

**Code Changes**:
```
// Fixed account number generation to handle both formats
if (typeof currentAccountNumber === 'string' && currentAccountNumber.toUpperCase().startsWith('RWC')) {
  const numericPart = currentAccountNumber.replace(/^RWC/i, '');
  const parsedNumber = parseInt(numericPart, 10);
  nextAccountNumber = isNaN(parsedNumber) ? 1 : parsedNumber + 1;
}

// Skip database operations for new clients
if (newClientData && !activeClient.id) {
  console.log('New client - skipping database operations, just returning position');
  // Navigate back with position only
  return;
}
```

### Impact:
- ✅ Confirm Position button works reliably on Android Chrome
- ✅ Account numbers now display correctly as "RWC530" instead of "1"
- ✅ Round order selection properly returns to Add New Client screen
- ✅ Faster performance for new client round order selection (no database operations)
- ✅ Maintains backward compatibility with both numeric and string account number formats
- ✅ Consistent behavior across web and native platforms

**Files Modified**:
- `app/round-order-manager.tsx`: Fixed Alert.alert calls + optimized logic for new clients
- `app/add-client.tsx`: Fixed account number generation + consistent RWC formatting
• **Files Modified**: `config.ts`

### Solution:
**Optimized Query Strategy (`app/clients.tsx`)**:
- Replaced individual client queries with single bulk query
- Fetches ALL pending/scheduled/in_progress jobs for the data owner at once
- Groups results by clientId in memory to find next visit dates
- Reduces 529 database queries to just 1 query

### Performance Impact:
- **Before**: 529 sequential Firebase queries (very slow)
- **After**: 1 Firebase query + in-memory processing (fast)
- **Result**: Next Visit data now loads immediately and displays correctly

### Technical Implementation:
- Single query: `where('ownerId', '==', ownerId)` + `where('status', 'in', ['pending', 'scheduled', 'in_progress'])`
- In-memory grouping by clientId to find earliest future job date
- Maintains same logic for date calculation and formatting
- Improved error handling with fallback to empty state

**Files modified**: `app/clients.tsx`