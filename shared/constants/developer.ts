// Single source of truth for the developer account UID (exempt tier + admin tools).
// NOTE: functions/index.js is a separately deployed codebase and cannot import this
// file; it keeps its own copy of this value. If the developer account ever changes,
// update BOTH this constant and DEVELOPER_UID in functions/index.js.
export const DEVELOPER_UID = 'X4TtaVGKUtQSCtPLF8wsHsVZ0oW2';
