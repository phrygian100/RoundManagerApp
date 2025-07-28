Implemented fully functional contact form submission system for marketing website.

- Created Firebase Function `submitContactForm` to handle contact form submissions via Resend email service.
- Added React form state management and Firebase client integration to `/contact` page.
- Configured email delivery to support@guvnor.app with formatted HTML templates including sender details and message content.
- Added comprehensive form validation, loading states, success/error feedback, and disabled states during submission.
- Updated web package.json to include Firebase v11.1.0 dependency for client-side integration.
- Contact form now properly categorizes submissions by subject (Demo, Support, Pricing, Partnership, General).
- Email templates include professional formatting with contact information, message content, and timestamp.
- Form resets on successful submission and shows appropriate user feedback messages.
- Email addresses (support@guvnor.app, sales@guvnor.app) are configured with Zoho.com email hosting - inbox access via Zoho webmail.
- Fixed Vercel build error: corrected Firebase client import path from `../../../lib/firebaseClient` to `../../lib/firebaseClient` in contact page.
- Fixed TypeScript linting errors: replaced `any` types with proper Firebase types (`FirebaseApp`, `Functions`) and improved error handling with proper type checking.

Updated About Us page "Our Story" section with new company background text.

- Replaced generic cleaning business messaging with specific window cleaning company origin story.
- Updated content to reflect UK-based window cleaning business roots and fleet management experience.
- Emphasized route optimization expertise and window cleaner-specific functionality.
- Highlighted scalability and future development plans for UK window cleaning industry.

Added Stripe secret binding for Cloud Functions (premium upgrade flow).

- Imported `defineSecret` from `firebase-functions/params` in `functions/index.js`.
- Declared `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` secrets and attached them to the relevant 2nd-gen functions via the `secrets` option.
- Functions updated: `createCheckoutSession`, `stripeWebhook`, `createCustomerPortalSession`.
- Secrets now accessed with `STRIPE_SECRET_KEY.value()` etc., with environment-variable fallback for local emulators.
- Upgraded `firebase-functions` dependency to `^4.4.1` to ensure secret-param support.

Fixed Round Order Manager to show client address instead of "NEW CLIENT" when editing existing client position.

- Updated `renderPositionList()` function in `app/round-order-manager.tsx` to properly display client address when in edit mode (editingClientId is present).
- Fixed wheel picker data generation to show client address for mobile version when editing.
- Updated highlight text for both mobile browser and desktop browser versions to show correct client information.
- Now properly distinguishes between create mode (shows "NEW CLIENT") and edit mode (shows actual client address).

Improved Round Order Manager UI by removing awkward blue overlay highlights.

- Removed overlay highlight divs (`pickerHighlight` and `mobilePickerHighlight`) that appeared on top of list items.
- Added new styling (`selectedClientItem`, `selectedPositionText`, `selectedAddressText`) to make the selected list item blue and bold.
- Updated both desktop and mobile rendering functions to apply selected styling directly to the item being moved.
- Cleaner visual appearance with the selected item having a light blue background, blue border, and bold blue text.

Added long press functionality for mobile browsers in Round Order Manager.

- Added long press detection for mobile navigation buttons (up/down arrows) using `onPressIn` and `onPressOut` events.
- Long press behavior mimics holding arrow keys on desktop - starts after 500ms delay, then repeats action every 100ms.
- Only enabled for mobile browsers (detected via `isMobileBrowser()` function) to avoid interfering with native mobile app.
- Added proper cleanup of timers on component unmount to prevent memory leaks.
- Greatly reduces tedium when moving clients through many positions in the round order.

Added +10/-10 quick navigation buttons to Round Order Manager mobile interface.

- Replaced "Position x of x" text with two new navigation buttons: "-10" and "+10".
- -10 button moves position down by 10 places, +10 button moves position up by 10 places.
- New buttons include same long press functionality as single-step up/down buttons.
- Updated mobile navigation layout: ▲ | -10 | +10 | ▼ for fast navigation through large lists.
- Added proper boundary checking to prevent going below position 1 or above maximum position.
- Significantly improves efficiency when repositioning clients across many positions.

Completely redesigned Edit Customer interface with modern modal presentation and improved styling.

- Converted from full-screen interface to modal overlay presentation matching the design patterns of accounts and quotes interfaces.
- Added modal overlay with semi-transparent background and rounded corners (borderRadius: 16px).
- Enhanced header section with customer address subtitle and improved close button styling.
- Redesigned tab navigation with icons and improved active/inactive states using proper shadows and colors.
- Reorganized form into logical sections: Basic Information, Account Information, Contact Information, and Service Schedule.
- Improved input field styling with better spacing, colors (#f9f9f9 background), and proper placeholder text colors.
- Added visual hierarchy with section titles, input labels, and helper text for better user guidance.
- Enhanced Round Order button with icon and chevron for better visual feedback.
- Redesigned date picker with calendar icon and improved visual presentation.
- Added summary card in Service Routine tab showing customer name and address for context.
- Improved footer with Cancel/Save buttons using proper colors and icons.
- Added proper loading states with modal presentation.
- Enhanced responsive design with max width constraints and proper mobile/desktop adaptations.
- Follows consistent design language with proper shadows, elevation, and color schemes (#007AFF primary, #666 secondary text).

Completely redesigned New Quote modal with modern styling and improved user experience.

- Converted from basic full-screen modal to elegant overlay presentation with semi-transparent background and rounded corners.
- Added professional modal header with document icon, proper title, and improved close button styling.
- Organized form into logical sections: Customer Information and Quote Details with clear visual hierarchy.
- Improved input field styling with consistent padding (14px), background colors (#f9f9f9), and proper placeholder text colors.
- Enhanced date picker with calendar icon and improved visual presentation matching edit customer interface.
- Redesigned picker/dropdown styling with proper container and background colors.
- Added side-by-side layout for town/city and phone number fields for better space utilization.
- Improved text area styling for notes with proper height and helper text guidance.
- Enhanced footer with Cancel/Create buttons using consistent design patterns and proper icons.
- Added comprehensive StyleSheet with organized sections for modal, header, body, inputs, and footer styles.
- Implemented proper responsive design with max width constraints and mobile/desktop adaptations.
- Added proper visual feedback for form interactions and improved accessibility.
- Follows the same design language as edit customer modal with consistent colors and spacing patterns.

Fixed calendar date picker z-index layering issue in New Quote modal.

- Increased z-index of `webDatePickerContainer` from 1000 to 9999 to ensure calendar appears above all modal content.
- Increased elevation from 8 to 15 for better visual separation on Android devices.
- Resolved issue where calendar widget was appearing behind other UI elements when creating a new quote.
- Calendar now properly displays above the modal content without being obscured by other elements. 