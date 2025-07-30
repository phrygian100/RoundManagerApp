### (Date: 2025-07-30) – Added Client CSV Export

1. `app/(tabs)/settings.tsx`
   • Added `handleExportClients` function: queries current owner’s clients, converts data to CSV (including runsheet notes, account notes, GoCardless flag and one-row-per-additional-service) and saves / shares the file.
   • Injected dynamic import of `expo-sharing` to avoid build errors on platforms where the module is absent; uses `expo-file-system` for storage.
   • Inserted “Export Data” section in UI with a new `Export Clients` button.
   • Added `expo-file-system` import.

No existing functionality was modified; the change is additive only.
