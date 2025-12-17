# Code Changes Log

## December 17, 2025

### Register Page: Require Address + Add Postcode Field + UI Polish

**File Changed**: `app/register.tsx`

**Problems**:
- `/register` UI looked like a basic unstyled form (default inputs/buttons, no hierarchy).
- Address fields were shown as optional and were not validated.
- Production `/register` was missing a visible postcode input (now explicitly present in the source UI).

**Solution**:
- Rebuilt the Register screen layout to match the more polished style used on `app/login.tsx` (hero + centered card + labeled fields + modern buttons), while keeping it cross-platform for web and mobile.
- Made **Address line 1**, **Town/City**, and **Postcode** required at registration.
- Always saves `address1`, `town`, `postcode`, and the legacy combined `address` field to the user document.
- Normalizes postcode to uppercase and collapses extra spaces before saving.

**User Impact**:
- New users must provide a complete address including postcode (improves downstream features like weather).
- Register page now looks consistent with the rest of the web experience.

---

## December 16, 2025

### Fixed Additional Services Occlusion on Flyer Back

**File**: `app/materials.tsx`

**Problem**: The additional services section on the back of the flyer was being covered by the footer, making it partially or fully invisible.

**Solution**: Reduced the height of the flyer footers by adjusting padding, curve dimensions, and icon/text sizes.

**Changes Made**:
- `flyerStyles.footer`: Reduced padding from `24/12/16` to `8/6/12`
- `flyerStyles.footerCurve`: Reduced curve height from 40px to 24px, adjusted top offset from -20 to -12
- `flyerStyles.phoneNumber`: Reduced font size from 27 to 16
- `flyerStyles.contactText`: Reduced font size from 15 to 11
- `flyerStyles.contactRow`: Reduced gap and margin
- Footer icons: Reduced from 24/21 to 14/12 size
- `flyerStyles.servicesSection`: Adjusted marginTop from -400 to -80

**User Impact**: Additional services section is now fully visible above the footer on the back of the flyer.

---

### Dark Mode Readability Fix for Clients Pages

**Files Changed**:
- `constants/Colors.ts` - Extended with dark mode color palette
- `app/clients.tsx` - Updated to use theme-aware colors
- `app/(tabs)/clients/[id].tsx` - Updated to use theme-aware colors

**Problem**: Users on dark mode phones couldn't read text in the clients list and client detail pages because styles used hardcoded light-mode colors (`#f9f9f9`, `#333`, `#666`, etc.) that don't adapt to dark mode.

**Solution**: Extended the theme color system and updated client-related components to use theme-aware colors.

**New Colors Added to Theme**:
- `card` / `cardBorder` - Card/item backgrounds and borders
- `secondaryText` / `tertiaryText` - Muted text colors
- `inputBackground` / `inputBorder` / `inputText` - Form input styling
- `sectionCard` / `sectionCardHeader` / `sectionCardBorder` - Section card styling
- `jobItemBackground` / `jobItemBorder` - Job history items
- `paymentItemBackground` / `paymentItemBorder` - Payment history items
- `modalBackground` / `modalOverlay` - Modal styling
- `divider` - Divider lines
- `notesBackground` - Notes section background
- `buttonSecondary` / `panelBackground` - Secondary button and panel backgrounds

**Components Updated**:
- Client list cards now use theme-aware backgrounds
- Sort buttons and search input use theme colors
- Client detail page section cards, history items, notes sections all adapt to dark mode
- Modal backgrounds and text are now readable in dark mode
- All icons use theme-aware secondary text color

**User Impact**: Client list and client detail pages are now fully readable on both light and dark mode devices.

---

### Client Portal Mobile Layout Fixes

**File**: `app/[businessName].tsx`

**Problems Fixed**:
1. **Logo not centered on mobile**: The navigation header logo was left-aligned on mobile when nav links were hidden, instead of being centered.
2. **Quote form overflow**: The Email and Notes fields were appearing outside the form card border on mobile viewports. This was caused by `flex: 1` on the form cards splitting available height equally between login and quote cards in column layout.

**Solutions**:
1. **Logo centering**: Added `navContentMobile` style with `justifyContent: 'center'` applied when `isNarrowWeb` is true.
2. **Form card height**: Added `formCardMobile` style that removes `flex: 1` so cards can expand naturally to fit their content. Applied to both login and quote cards.

**New Styles Added**:
- `navContentMobile`: Centers logo in the navigation header on narrow viewports
- `formCardMobile`: Removes flex constraint so form cards grow to fit content

**User Impact**: The client portal page now displays correctly on mobile devices with:
- Centered Guvnor.app logo in the header
- Full quote form visible within its bordered card (Email and Notes fields no longer overflow)

---

### Home: Progress Card Opens Runsheet

**File**: `app/(tabs)/index.tsx`

- Made the "Today's Progress" card tappable/clickable and route directly to the current week's runsheet (`/runsheet/[week]` with the correct Monday anchor).
- Added a subtle pressed state for feedback while keeping existing styling intact.

---

## December 15, 2025

### Materials: Fix logo upload crash (web)

**File**: `app/materials.tsx`

- Fixed Configure Materials logo upload failing on web due to React Native `Image` import shadowing the browser `Image()` constructor.
- Aliased React Native `Image` to `RNImage` and used a DOM `<img>` element for upload processing.
- Updated modal helper text to reflect 2MB limit.

### Materials: Fix missing logos in PNG export

**File**: `app/materials.tsx`

- Fixed exported PNGs sometimes missing uploaded logos by waiting for images to load/decode before capture and preserving `<img>` `src`/eager-loading behavior in the `html2canvas` clone.
- Added a fallback for small images (logos) to be rendered as `background-image` on their parent container in the clone, avoiding intermittent `<img>` drops in `html2canvas`.
- Mapped logo `<img>` `object-fit`/`object-position` to `background-size`/`background-position` to keep the exported logo framing identical to the preview.

### Reimagined Dashboard UI

**Files**: `app/(tabs)/index.tsx`, `package.json`, `package-lock.json`

- Redesigned the home dashboard to match the new graphical concept: gradient background, hero progress card, weather pill, and icon-driven tile grid with responsive sizing for web and mobile.
- Added outlined icons per tile plus badge support for New Business requests; preserved existing navigation and permission gating.
- Introduced `expo-linear-gradient` for the cross-platform background treatment.

### Mobile visual fixes

- Reduced gradient accent sizes/opacity and added overflow clipping to stop the light overlay washing out tiles and to prevent horizontal scrolling on mobile.

---

## December 15, 2025

### Added SMS Invoice Shortcut for Outstanding Accounts

**File**: `app/accounts.tsx`

- Load owner profile (business name + bank details) for the accounts screen.
- Added a "Send SMS Invoice" button on each outstanding account card that opens the native SMS app with a pre-filled invoice-style reminder including balance due, bank transfer details (sort code, account number, reference), and account reference.
- The SMS also links to the client portal so the customer can view their full statement online.
- Updated copy: removed “due on receipt” and the “Account Name” bank line; added a note asking customers to contact if they paid with a different reference so unknown payments can be linked.

---

## December 15, 2025

### Move Payments Between Clients from Service History

**File**: `app/(tabs)/clients/[id].tsx`

- Added “Move” action to payment entries in Service History.
- New modal lets users search/select another client and reassign the payment; job link is cleared to avoid mismatches.
- Service history refreshes after the move and guards prompt for client selection.

---

## December 15, 2025

### Added Multi-Select Move for Runsheet Jobs

**File**: `app/runsheet/[week].tsx`

- Added a `Select multiple` toggle next to the runsheet home button with a live count badge and selected jobs notice.
- Jobs can now be multi-selected (highlighted with a check and "Selected" tag) and moved in one action via a new `Move jobs` button that appears while selection is active.
- Bulk move now asks for both the target date and vehicle (or automatic allocation), with a shared date/vehicle picker (web and mobile) and batched updates, preserving defer/original date logic when crossing weeks.
- Guards prevent moving to past dates or to today when today is marked complete, and non-movable items (notes, quotes, completed jobs) are ignored automatically.
- Selection state clears after a successful move or when toggling selection off to avoid stale selections.

---

## December 13, 2025

### Fixed Mobile Overflow Issues in Expo App Login Screen

**File**: `app/login.tsx`

**Problem**: The login screen was cutting off content and overflowing on mobile devices:
- Logos were way too large (520px width) causing horizontal overflow
- Footer content was cut off at the bottom
- "Start free with up to 20 clients →" text was clipped on the right
- No proper overflow constraints on containers
- Navigation links were cut off on mobile

**Solution**: 
1. **Optimized logo sizes** for better mobile/desktop balance:
   - Nav logo: 520px → 400px (mobile: 320px)
   - Form logo: 480px → 360px (mobile: 280px) 
   - Footer logo: 360px → 300px (mobile: 240px)

2. **Fixed container overflow**: Added overflow hidden and proper constraints to prevent content spilling

3. **Improved footer responsiveness**:
   - Added proper padding and flex-wrap for mobile
   - Centered footer columns on mobile
   - Reduced gaps and padding for smaller screens

4. **Fixed features section**:
   - Made feature text wrap properly
   - Added horizontal padding for mobile
   - Prevented pricing link from being cut off

5. **Fixed navigation for mobile**:
   - Hide full navigation on narrow mobile screens
   - Show only Home and Pricing links on mobile to prevent overflow
   - Full navigation remains visible on desktop/tablet

**Impact**: The login page now fits properly within mobile viewports without horizontal scrolling or cut-off content, with appropriately sized logos and responsive navigation.

---

## December 13, 2025

### Past Date Validation for Job Deferral in Runsheets

**Problem**: Jobs could potentially be moved to past dates through the date picker, which doesn't make sense for scheduling future work.

**Solution**: Added validation to prevent moving jobs to dates that have already passed.

**Changes Made**:

**File**: `app/runsheet/[week].tsx`

1. **Backend Validation in handleDeferDateChange()**:
   - Added date comparison check before processing job move
   - Compares selected date with today's date (both normalized to midnight)
   - Shows alert "Cannot Move to Past Date" with message "You cannot move jobs to a date that has already passed."
   - Prevents the job move action and resets the deferral state

2. **UI Prevention (Already Existed)**:
   - Web: HTML date input already had `min={format(new Date(), 'yyyy-MM-dd')}` attribute
   - Mobile: DateTimePicker already had `minimumDate={new Date()}` property
   - These UI restrictions prevent selecting past dates in the date picker itself

**User Experience**:
- Date pickers only allow selecting today or future dates
- If a past date is somehow selected (e.g., edge cases, developer tools manipulation), a clear error message is shown
- Jobs can only be scheduled for today or future dates, maintaining logical scheduling flow

---

## December 13, 2025

### Fixed Marketing Site Mobile Layout Overflow + Missing Navigation Links

**Problem**: On narrow smartphone screens the marketing pages could overflow horizontally (spilling to the right) and the header navigation links were not accessible on mobile.

**Solution**:
- Added an explicit viewport configuration for correct mobile scaling.
- Added global CSS guardrails to prevent horizontal overflow.
- Implemented a shared, mobile-friendly marketing navigation with a hamburger menu.
- Fixed a non-wrapping flex row on `/pricing` that could force horizontal scrolling.
- Routed the site root (`/`) to the marketing home page.
- Updated Vercel rewrites to support marketing routes with and without trailing slashes.

**Files Changed**:
- `vercel.json`
- `web/src/app/layout.tsx`
- `web/src/app/globals.css`
- `web/src/components/MarketingNav.tsx`
- `web/src/app/page.tsx`
- `web/src/app/home/page.tsx`
- `web/src/app/about/page.tsx`
- `web/src/app/contact/page.tsx`
- `web/src/app/pricing/page.tsx`
- `web/src/app/feature-tour/page.tsx`
- `web/src/app/terms/page.tsx`
- `web/src/app/privacy-policy/page.tsx`

---

## December 11, 2025

### Added Item-Specific Configuration Modals for Materials

**File**: `app/materials.tsx`

**Feature**: Each material type (Invoice, Flyer, Canvassing Flyer, New Business Leaflet) now has an "Options" button that opens a configuration modal with checkboxes to customize what sections to include.

**Invoice Options**:
- Direct Debit (show/hide)
- Cash (show/hide)
- Include Business Address (show/hide)

**Flyer Options** (placeholder):
- Contact Details
- Services List
- FREE Quote Badge

**Canvassing Flyer Options** (placeholder):
- Price Boxes
- Additional Services
- Contact Information

**New Business Leaflet Options** (placeholder):
- Pricing Table
- Payment Methods
- Service Area Map

**Implementation**:
- Added item configuration interfaces: `InvoiceItemConfig`, `FlyerItemConfig`, `CanvassingFlyerItemConfig`, `LeafletItemConfig`
- Added `ItemConfigurationModal` component with checkbox UI
- Added "Options" button next to "Download PDF" for each material section
- Added `itemConfigStyles` stylesheet for the modal

**Note**: The options UI is complete but the actual toggle functionality to show/hide sections in the previews will be implemented next.

---

### Made Materials Page Settings Button More Prominent

**File**: `app/materials.tsx`

**Problem**: The settings button on the materials page was just a small icon in the top right corner of the header, making it too hidden when it's actually a very important feature for configuring business details.

**Solution**: Added a prominent configuration banner below the header that clearly highlights the settings functionality.

**Changes**:
- Removed the small settings icon from the header
- Added a large, eye-catching blue banner with:
  - Settings icon in a circular container
  - "Configure Your Business Details" title
  - Subtitle explaining what can be configured (business name, contact info, banking details & services)
  - Chevron arrow indicating it's tappable
  - Blue background (#007AFF) with shadow for visual prominence

**New Styles Added**:
- `configBanner` - Main banner container with blue background and shadow
- `configBannerContent` - Flexbox row layout for icon, text, and chevron
- `configBannerIcon` - Circular icon container with semi-transparent background
- `configBannerText` - Container for title and subtitle
- `configBannerTitle` - Bold white title text
- `configBannerSubtitle` - Slightly transparent white subtitle text

**User Impact**: The configuration modal is now much more discoverable, making it easier for users to set up their business details for invoice and flyer generation.

---

### Invoice Front Layout Improvements

**File**: `app/materials.tsx`

**Changes**:
1. **Restructured to row-based layout**: Changed from two independent columns to a two-section layout:
   - **Top Section (row)**: Header + Branding (left) | Bank Transfer + Notes (right)
   - **Bottom Section (row)**: Direct Debit + Cash + Post (left) | Work Completed (right)
   
2. **Proper alignment**: Direct Debit and Work Completed now start at exactly the same vertical position because they're in the same row container.

3. **Added "Post" Box**: The business address section is now in a blue-bordered box with the title "Post" instead of just plain text, matching the design pattern of other sections.

**New Styles Added**:
- `topSection` - Flex row for top portion (branding + bank/notes)
- `bottomSection` - Flex row for bottom portion (payment methods + work completed)
- `topLeftColumn`, `topRightColumn` - Column containers for top section
- `bottomLeftColumn`, `bottomRightColumn` - Column containers for bottom section

---

## December 10, 2025

### Added Materials Page with Invoice Preview

**Files Changed**:
- `app/(tabs)/index.tsx` - Added Materials button to homescreen with permission key
- `app/(tabs)/team.tsx` - Added Materials permission toggle for team members
- `app/materials.tsx` - Materials page with Invoice preview component

**Purpose**: Materials page for users to find invoices, leaflets, and lead generation flyers.

**Invoice Component Features**:
- Two-column layout replicating physical invoice design
- Left column:
  - Services provided date header with checkmark icon
  - Business logo/branding section (logo circle, business name, tagline)
  - Phone number and social media links
  - Direct Debit payment box with GoCardless URL
  - Cash payment instructions box
  - Business address footer
- Right column:
  - Bank Transfer details box (account name, sort code, account number, payment reference)
  - Notes section
  - Work completed table with 9 service line items and total row
- Blue (#2E86AB) accent color for borders, links, and highlights
- Clean, professional styling matching the physical invoice template

**Permission System**:
- Owner accounts always have access to Materials
- Team members need the `viewMaterials` permission enabled by the owner
- Permission can be toggled in Team → member card → Permissions section

**Next Steps**: Invoice data will be populated from user settings/context (business name, bank details, services, etc.)

---

### Moved Activity Log Button from Homescreen to Rota Page

**Files Changed**:
- `app/(tabs)/index.tsx` - Removed Activity Log button from homescreen
- `app/rota.tsx` - Added Activity Log button to rota page header

**Changes**:
- Removed the "Activity Log" button from the homescreen button grid (both in `baseButtons` and `buttonDefs` arrays)
- Added an "Activity Log" link to the rota page header, positioned next to the existing "Rota History" link
- The Activity Log remains accessible at `/audit-log` route

**Reason**: Declutters the homescreen by moving less frequently used functionality to a more contextually appropriate location within the Rota page.

---

### Implemented New Business Quote Requests Page

**File**: `app/new-business.tsx`

**Feature**: Complete page for viewing and managing quote requests submitted through the client portal.

**Quote Request Cards Display**:
- Customer name and submission date
- Status badge (New, Quote Scheduled, Converted, Declined)
- Phone number, email (if provided), and full address
- Notes from the prospective customer (if any)

**Action Buttons**:
1. **Schedule Quote** (Blue)
   - Opens a modal to create a new quote in the quotes system
   - Pre-populates: Name, Address, Town, Phone Number, Notes
   - Includes date picker for scheduling the quote visit
   - Lead source auto-set to "Client Portal"
   - Updates request status to "contacted" after creation
   - Explainer tip: "Raise a visit to quote on a later date"

2. **Add Client** (Green)
   - Navigates directly to `/add-client` with pre-populated fields
   - Pre-fills: Name, Address Line 1, Town, Postcode, Mobile Number, Email, Source
   - Updates request status to "converted"
   - For when you've already quoted and agreed terms

3. **Delete Request** (Red text)
   - Removes the quote request with confirmation prompt

**Header Features**:
- Title and subtitle explaining the page purpose
- Home button to return to main dashboard
- Pending count badge showing new unprocessed requests

**Technical Implementation**:
- Real-time Firestore listener for quote requests
- Queries `quoteRequests` collection filtered by `businessId`
- Creates quotes in the `quotes` collection (same format as /quotes page)
- Logs quote creation to audit log
- Updates request status on action completion

### Removed Add New Client Button from Home Screen

**File**: `app/(tabs)/index.tsx`

**Change**: Removed the "Add New Client" button from the home screen grid since this functionality is accessible from within the Client List page. This creates a cleaner 2x4 grid layout with the new "New Business" button.

---

## December 9, 2025

### Reworked Accounts Financial Summary

**File**: `app/accounts.tsx`

- Pulled the three financial quick links (Completed Jobs, All Payments, Unknown Payments) out into their own standalone cards so they read clearly as tappable boxes on both desktop and mobile.
- Replaced the old financial summary grid with an over-time bar chart showing completed job value (blue) vs payments received (green), plus a £ axis for clarity.
- Added timeframe chips (Daily, Weekly, Monthly, Year-to-date, Annual, Lifetime) to switch the chart aggregation, using existing Firestore job/payment data.
- Included a simple legend and updated styling for the quick links to feel more prominent/clickable.
- Fixed bar rendering by correcting available width and making the chart area flex to its container.
- Improved chart readability with nicer y-axis ticks, capped x-label density, range totals line, hover/tap tooltips showing exact £ values per bucket, and replaced the multi-chip timeframe selector with a single cycle button to avoid overflow on mobile.
- Adjusted chart insets (symmetric start/end gaps) so bars center within the plot instead of appearing squashed to the right.
- Fixed bar/label horizontal alignment so x-axis labels are directly under their corresponding bar groups.
- Increased chart height for better visual separation and readability.
- Fixed bar baseline so bars start from the £0 line instead of floating above it.
- Changed y-axis scaling to use max value + 10%, rounded up to nearest £100, ensuring bars never exceed chart height.
- Fixed bar/gridline alignment by using consistent top-based positioning so bar heights match y-axis values.
- Split combined bar chart into two separate charts (Completed Jobs and Payments Received), each with its own y-axis scale for clearer reading.

### Added Bulk Payments Feature (UI Only)

**Files**: 
- `app/accounts.tsx` - Added "Add Bulk Payments" button
- `app/bulk-payments.tsx` - New spreadsheet-style bulk payment entry page

**Feature**: Added a new bulk payments interface accessible from the Accounts page. This allows users to enter multiple payments at once using a spreadsheet-like interface.

**Accounts Page Changes**:
- Added "Add Bulk Payments" button in the header
- Desktop: Navigates to `/bulk-payments`
- Mobile: Shows alert explaining feature is desktop-only

**Bulk Payments Page Features**:
- Native HTML table for proper paste support on web
- Spreadsheet grid with columns: Account Number, Date, Amount, Type, Notes, Status
- Starts with 15 empty rows, "Add 5 Rows" button to expand
- **Paste support**: Click any cell and paste from Excel/Google Sheets/LibreOffice - data fills across columns and down rows
- Real-time validation:
  - Account numbers matched against existing clients (green = valid, yellow = unknown)
  - Date validation (expects DD/MM/YYYY format)
  - Amount validation (must be positive number)
  - Type dropdown with options: Cash, Card, Bank Transfer, Cheque, Direct Debit, Other
  - Type column preserves raw pasted values - if invalid, shows red border with dropdown to fix
- Invalid account numbers scan for embedded references like "RWC123" inside noisy text and surface a one-click "Use RWC123" suggestion to auto-correct the cell
- For unknown accounts without an RWC hint, a "Find account" button opens a modal that lets the user search clients by name or address and apply the correct account number in one click
- Find-account modal now supports searching by account number too and is anchored to the right side of the screen
- Back button now falls back to `/accounts` if browser history cannot navigate back
- Submission implemented:
  - Valid rows create payments in `payments` collection
  - Unknown accounts create entries in `unknownPayments`
  - Duplicate detection within the submission (account + date + amount) with confirmation prompt
  - Input validation for date, amount, and type before submit
- Status column showing Valid/Unknown/Invalid for each row
- "Clear All" button to reset the spreadsheet
- Legend explaining color coding
- Mobile fallback with message to use desktop

**Note**: Submission functionality not yet implemented - this is UI-only for testing.

---

### Added Quick Action Buttons to Runsheet Job Rows

**File**: `app/runsheet/[week].tsx`

**Feature**: Added inline quick action buttons to each job row in the runsheet for faster access to common actions.

**Buttons**:
1. **Nav** - Opens Google Maps navigation to the client's address
2. **ETA** - Sends an ETA text message to the client
3. **£** - Sends account summary text message (colored by balance status)
   - 🔴 Red when client has outstanding balance
   - 🟢 Green when client is up-to-date or has credit
4. **+** - Opens the full options modal with all available actions

**Implementation**:
- Added `clientBalances` state to track balance for each client
- Added `useEffect` to fetch client balances when jobs load:
  - Fetches completed jobs and payments for all clients in batches
  - Calculates balance (payments - jobs + starting balance) for each client
- Added `quickActionsRow` with four compact buttons at the top of each job card
- New styles: `quickActionsRow`, `quickActionBtn`, `quickActionBtnRed`, `quickActionBtnGreen`, `quickActionText`, `quickActionTextLight`

**Modal Cleanup**:
- Removed "Navigate", "Message ETA", and "Send account summary" from the job options modal (accessed via + button)
- These actions are now exclusively available via the quick action buttons
- Remaining modal options: View details, Edit Price, Defer, Add note below, Delete Job

---

### Added "Send account summary" Button to Runsheet Job Modal

**File**: `app/runsheet/[week].tsx`

**Feature**: Added a new "Send account summary" button to the job action modal in runsheets. This allows users to send a text message to clients with their complete account summary.

**Message Content**:
- Customer name greeting
- Current balance (outstanding/credit)
- Services provided count and total billed
- Payments received count and total paid
- Banking details (if balance is outstanding):
  - Account Name (business name)
  - Sort Code
  - Account Number
  - Amount Due
  - Customer Reference (account number with RWC prefix)
- Sign-off with provider name and business name

**Implementation**:
- Added `handleSendAccountSummary` async function that:
  - Fetches completed jobs and payments for the client from Firestore
  - Calculates balance from jobs, payments, and starting balance
  - Builds a formatted SMS message with all account details
  - Opens the native SMS app with the pre-filled message
- Added button to iOS ActionSheet (after "Message ETA")
- Added button to Android/Web Modal (after "Message ETA")
- Added `displayAccountNumber` import from `../../utils/account`
- Added `Payment` type import from `../../types/models`

**Note**: This feature is only available for regular jobs (not quotes) since quotes don't have an associated client account yet.

---

### Added Client Portal Dashboard

**New Feature**: Full client dashboard after successful login at `guvnor.app/{businessname}`

**Dashboard Sections**:
1. **Welcome Header** - Shows client name and account number
2. **Account Balance** - Displays current balance (credit or amount owing) with color coding
3. **Your Services** - Lists active service plans with:
   - Service type
   - Price
   - Frequency (Weekly, Fortnightly, 4 Weekly, etc.)
   - Next service date
4. **Your Details** - Shows contact info with Edit button to change:
   - Name (editable)
   - Mobile number (editable)
   - Email (read-only)
   - Address (read-only)
5. **Service History** - Shows last 10 items:
   - Completed jobs (in red as charges)
   - Payments (in green as credits)
   - Date and description for each
6. **Sign Out** - Returns to login screen

**Technical Implementation**:
- Fetches service plans from `servicePlans` collection (filtered by clientId, isActive)
- Fetches completed jobs from `jobs` collection (filtered by clientId, status=completed)
- Fetches payments from `payments` collection (filtered by clientId)
- Calculates balance: `totalPaid - totalBilled + startingBalance`
- Allows profile updates via Firestore `updateDoc`

**Firestore Rules Updated**:
- Added public read for `jobs`, `servicePlans`, `payments` collections
- Added public update for `clients` collection (for profile edits)

**Files Changed**: 
- `app/[businessName].tsx` - Dashboard UI and data fetching
- `firestore.rules` - Public access for portal data

---

### Implemented Multi-Step Client Portal Login

**New Feature**: Two-step client authentication for business customer portals

**How It Works**:
1. **Step 1 - Account Lookup**: Client enters their account number (with "RWC" pre-filled as prefix)
   - Queries the business owner's clients collection to find matching account
   - Shows "Account not found" error if no match
   - If found, shows client name and moves to step 2

2. **Step 2 - Phone Verification**: Client enters last 4 digits of their phone number
   - Compares against the `mobileNumber` stored in their client record
   - Shows error if phone doesn't match
   - On success, displays "Successfully Logged In" message

**UI Features**:
- Step indicator showing progress (dots connected by line)
- Pre-filled "RWC" prefix in account number field
- Green confirmation box showing found client name/account
- Back button to return to step 1
- Error messages in styled red containers
- Success state with checkmark and welcome message

**File Changed**: `app/[businessName].tsx`

---

### Fixed Client Portal Route Redirect Issue

**Problem**: Navigating to `guvnor.app/tgmwindowcleaning` (or any business portal URL) was immediately redirecting to `/login` instead of showing the client portal page.

**Root Cause**: Race condition in `_layout.tsx` - the `usePathname()` hook from Expo Router may not return the correct pathname immediately on initial page load on web, causing the auth redirect logic to incorrectly identify business routes as unauthorized pages.

**Solution**:
1. Changed auth guard to use `window.location.pathname` directly on web instead of relying solely on Expo Router's `usePathname()`
2. Improved business route regex pattern to be more specific: `/^\/[a-zA-Z][a-zA-Z0-9]*$/`
3. Removed hardcoded business names from `unauthAllowed` array (now dynamically detected)
4. Fixed logged-in users being incorrectly redirected away from business portal routes

**File Changed**: `app/_layout.tsx`

---

### Added Client Portal System

**New Features Added**:

1. **Dynamic Business Route**: Created `/app/[businessName].tsx` for client portal access via URLs like `guvnor.app/TGMWindowCleaning`
2. **Business Name Lookup**: Implemented flexible business name matching that handles spaces and case variations (e.g., "TGMWindowCleaning" matches "TGM Window Cleaning")
3. **Owner vs Member Discrimination**: Added logic to ensure only business owners can have client portals, not team members
4. **Client Authentication UI**: Built login form for clients to enter account number (RWC...) and password

**Technical Implementation**:

#### 1. Dynamic Route Creation (`app/[businessName].tsx`)
- Uses Expo Router's dynamic routing with square brackets
- Extracts business name from URL and normalizes it for database lookup
- Validates that the business user is an owner, not a team member

#### 2. Business User Lookup Logic
- Queries Firestore users collection for business name matches
- Normalizes both URL and stored business names for flexible matching
- Prevents member users from having client portals

#### 3. Owner Discrimination
- Checks if `user.accountId !== user.uid` (member indicator)
- Verifies no member records exist in `accounts/{userId}/members/{userId}`
- Ensures only business owners can access client portal functionality

#### 4. Vercel Routing Updates
- Updated `vercel.json` to properly route business name URLs to the main app
- Maintains existing marketing page routing

**Security Considerations**:
- Only owner accounts can have client portals
- Client authentication logic ready for implementation (account number + password)
- Data isolation ensures clients only see their own business's data

#### 5. Authentication Guard Updates (`app/_layout.tsx`)
- Modified authentication logic to allow unauthenticated access to business portal routes
- Added explicit allowance for known business routes in `unauthAllowed` array
- Added business route detection using regex pattern `/^\/[^\/_][^\/]*$/` for future business routes
- Updated redirect logic to handle business routes appropriately for both logged-in and logged-out users

#### 6. Auto-Create Business Portals (`services/userService.ts`)
- Modified `updateUserProfile` to automatically create/update business portal documents
- When a user saves their business name in Settings, a `businessPortals/{normalizedName}` document is created
- This enables public lookup of business info for client portal pages
- If business name changes, old portal is deleted and new one is created
- No manual scripts needed - portals are created automatically!

#### 7. Firestore Rules (`firestore.rules`)
- Added public read access for `businessPortals` collection
- Only business owners can write to their own portal documents

**How Business Portals Work Now**:
1. User goes to Settings → Bank & Business Info
2. User saves their business name (e.g., "TGM Window Cleaning")
3. System automatically creates `businessPortals/tgmwindowcleaning` document
4. Clients can now access `guvnor.app/tgmwindowcleaning`

**For Existing Users**:
To enable the client portal, simply go to Settings → Bank & Business Info and click Save. This will create your portal document.

**Next Steps**:
- Implement client authentication against the business owner's client database
- Create client dashboard showing account balance, job history, and payments
- Add client self-service features (payment requests, booking, etc.)

---

## Previous Changes

### Fixed Critical Bugs in Accounts Screen (accounts.tsx)

**Problems Fixed**:

1. **Import Typo**: Line 1 had "thimport" instead of "import", causing all Ionicons references to fail and breaking the entire component
2. **Starting Balance Calculation Bug**: `Number(client.startingBalance) || 0` returned `NaN` when `startingBalance` was `undefined`, causing incorrect balance calculations
3. **Broken Add Payment Button**: The "Add Payment" button in the account details modal only closed the modal but didn't navigate to the add payment screen

**Root Causes**:
- Typo in import statement prevented proper module loading
- Unsafe type coercion with `Number(undefined)` returning `NaN`
- Missing `onAddPayment` prop in modal component interface

**Solutions**:

#### 1. Fixed Import Statement
**Location**: `app/accounts.tsx` line 1
- **Before**: `thimport { Ionicons } from '@expo/vector-icons';`
- **After**: `import { Ionicons } from '@expo/vector-icons';`
- **Impact**: Restored proper Ionicons import, fixing all icon references

#### 2. Fixed Starting Balance Type Safety
**Location**: `app/accounts.tsx` line 252
- **Before**: `const startingBalance = Number(client.startingBalance) || 0;`
- **After**: `const startingBalance = typeof client.startingBalance === 'number' ? client.startingBalance : 0;`
- **Impact**: Prevents `NaN` values in balance calculations when `startingBalance` is undefined

#### 3. Fixed Add Payment Button Functionality
**Location**: `app/accounts.tsx` - AccountDetailsModal component
- **Added**: `onAddPayment: (client: ClientWithBalance) => void` to `AccountDetailsModalProps` type
- **Updated**: Modal component to accept and use `onAddPayment` prop
- **Updated**: "Add Payment" button to call `onAddPayment(client!)` instead of just `onClose()`
- **Updated**: Modal instantiation to pass `handleAddPayment` as `onAddPayment` prop
- **Impact**: "Add Payment" button now properly navigates to add payment screen with client details pre-filled

**User-Facing Behavior**:
- Accounts screen now loads without TypeScript errors
- Balance calculations are accurate even for clients without starting balance
- Add Payment button in account details modal now works correctly
- No functional regressions in existing features

---

## December 3, 2025

### Fixed Job Completion Order Tracking for Collaborative Workflows

**Problem**: The job completion order tracking feature was broken when multiple users (owners and members) worked simultaneously from the same runsheet:

1. **Global completion sequencing**: Completion sequence numbers were assigned globally across all vehicles, causing conflicts when multiple vehicles completed jobs simultaneously
2. **Local-only swap proposals**: Out-of-order job completion suggestions were stored only in local React state, so member users' suggestions were never visible to owner accounts
3. **No real-time updates**: Users couldn't see each other's job completions in real-time, leading to stale data and decision-making based on outdated information

**Root Cause Analysis**:
- Completion sequences counted all jobs for the day globally instead of per-vehicle
- Swap proposals existed only in local component state, not persisted or shared
- No Firestore listeners for real-time job updates between collaborating users

**Solution**: Implemented three interconnected fixes for full collaborative workflow support:

#### 1. Per-Vehicle Completion Sequencing
**Location**: `app/runsheet/[week].tsx` - `handleComplete` function
- **Before**: Counted all completed jobs globally for the day
- **After**: Counts completed jobs only within the same vehicle block for the day
- **Impact**: Each vehicle now gets independent sequence numbers (→1, →2, →3...) regardless of other vehicles' progress

#### 2. Persistent Shared Swap Proposals
**Location**: `app/runsheet/[week].tsx`
- **New Firestore Structure**: `swapProposals/{accountId}_{weekStart}/proposals/{dayTitle}`
- **Real-time Sync**: Added Firestore `onSnapshot` listener to sync swap proposals across all user sessions
- **Cross-user Visibility**: Swap proposals created by member users are now visible to owner accounts and vice versa
- **Automatic Cleanup**: Swap proposals are deleted from Firestore after being applied or dismissed

#### 3. Real-time Job Updates
**Location**: `app/runsheet/[week].tsx` - main data loading useEffect
- **Added Firestore Listener**: Real-time subscription to job changes for the current week
- **Live Synchronization**: All users see job completions, status changes, and sequence updates immediately
- **Preserved Client Data**: Real-time updates merge with existing client relationship data to avoid breaking UI

### Technical Implementation Details:

#### Current Implementation Status:
- **Per-vehicle completion sequencing**: ✅ Implemented with error handling and fallbacks
- **Per-vehicle round order numbering**: ✅ Fixed - blue numbers now reset to 1 for each vehicle
- **Shared swap proposals**: 🔄 Temporarily reverted to local state (Firestore real-time listeners causing white screen)
- **Real-time job updates**: 🔄 Disabled to prevent crashes (can be re-enabled after stabilization)

#### Round Order Numbering Fix:
**Problem**: Blue numbers on the far left were continuing sequentially across vehicles instead of resetting per vehicle.

**Root Cause**: `dayJobPosition` was calculated globally across all jobs in the day, not per vehicle block.

**Solution**: Modified the calculation to filter jobs to only those within the same vehicle block before sorting and finding position.

**Code Change**: `app/runsheet/[week].tsx` lines ~1894-1930
- Moved vehicle boundary calculation to beginning of render logic
- Filter `vehicleJobs` to only jobs within the current vehicle block
- Sort and find position within vehicle-specific job list only
- Result: Each vehicle now shows 1, 2, 3... independently

#### White Screen Issue with Real-Time Listeners:
**Problem**: Enabling Firestore real-time listeners for swap proposals caused blank white screen.

**Root Cause**: Async operations in useEffect listeners interfering with component initialization and state updates.

**Current Status**: Real-time swap proposals temporarily disabled. Core per-vehicle logic works with local state swap proposals.

**Next Steps**: Real-time collaborative features will be implemented after core functionality is validated in testing.

#### Firestore Data Structure (Future):
```
swapProposals/
  {accountId}_{yyyy-MM-dd}/  // Week document
    proposals/
      {dayTitle}/            // Day document
        proposals: [{ jobId, swapWithJobId }]
        updatedAt: timestamp
        updatedBy: userId
```

### User-Facing Behavior:
- **Independent vehicle tracking**: Each vehicle's completion sequence is independent (Vehicle A: →1, →2, →3...; Vehicle B: →1, →2, →3...)
- **Independent round order numbering**: Blue position numbers reset to 1 for each vehicle
- **Local swap proposals**: Out-of-order suggestions work within single user session (collaborative sharing temporarily disabled)
- **Stable operation**: App loads without crashes, core functionality preserved

---

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