// Single source of truth for the developer account UID (exempt tier + admin tools).
// NOTE: functions/index.js is a separately deployed codebase and cannot import this
// file; it keeps its own copy of this value. If the developer account ever changes,
// update BOTH this constant and DEVELOPER_UID in functions/index.js.
export const DEVELOPER_UID = 'X4TtaVGKUtQSCtPLF8wsHsVZ0oW2';

// Marker stored in quoteRequests.businessName for leads captured by the public
// Guvnor-branded quote page (/window-cleaning-quote). These leads belong to no
// app user yet: they land in the developer's quoteRequests bucket and are shown
// on /guvnor-leads instead of the developer's own /new-business screen.
export const GUVNOR_LEADS_BUSINESS_NAME = 'Guvnor';
