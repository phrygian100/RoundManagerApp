# Project contribution rules

1. After **every** code change (function, service, component, config, etc.) you must append a concise entry to `docs/code-changes.md` describing:
   - The date (YYYY-MM-DD)
   - What was changed (file / feature)
   - Why the change was made

Failure to update the changelog blocks the PR / commit review. 

2. Changes to UI or functionality must preserve platform specific integrity. Updates for web or mobile must not degrade or break the other platforms experience. Always ensure functions do not disrupt platform specific functionality or layouts. If you are unsure you are working on changes for the mobile or web version, always ask.