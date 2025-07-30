
### (Date: 2025-07-30) – Added Completed Jobs CSV Export

1. `app/(tabs)/settings.tsx`
   • Implemented `handleExportCompletedJobs` which exports all jobs with status `completed` into CSV (`Account Number`, `Date`, `Amount (£)`).
   • Pre-fetches client data to map clientId → accountNumber.
   • Shares / downloads the file similarly to client export, with dynamic import of `expo-sharing` for native platforms.
   • Added “Export Completed Jobs” button in the Export section.

This is a purely additive change and does not alter existing behavior.
