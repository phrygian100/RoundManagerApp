
### (Date: 2025-07-30) – Added Payments CSV Export

1. `app/(tabs)/settings.tsx`
   • Implemented `handleExportPayments` exporting all payments (columns: Account Number, Date, Amount (£), Type, Notes).
   • Added "Export Payments" button under Export Data.
   • Uses same share/download pattern as other exports.

### (Date: 2025-07-30) – Runsheet “Complete Day” owner restriction & UX cleanup

1. `app/runsheet/[week].tsx`
   • Added owner detection (`getUserSession`) and `isOwner` state.
   • "Day complete?" button is now shown only for owners.
   • `handleDayComplete` blocks non-owner attempts with a permission alert.
   • Removed the modal prompt after the final job completes by disabling the `Alert` in `handleComplete`.
   • Updated session import to include `getUserSession`.
