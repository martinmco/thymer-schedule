# Thymer Schedule

## Where we are

| Workstream | State | Immediate next outcome |
| --- | --- | --- |
| ✅ v0.1 hardening | Scoped popover cleanup, settings readback, partial date-write handling, and installer verification are built; four focused tests pass | Preserve the verified bundle |
| ✅ Public package | Public repository, source, installer, docs, license, and third-party notice are assembled for v0.1.0 | Maintain from tagged release |
| ✅ Live update | Seven Collection plugins and the global installer were backed up, updated, and read back with unchanged configuration | Validate fresh runtime interaction when a UI session is available |

## Current work

Version 0.1.0 is the first public package of the opt-in FullCalendar Schedule plugin. The Collection view and global installer are separate pasteable bundles. Existing Collection configuration and recognized older code are preserved without silently overwriting unrelated plugins.

## Remaining work — single backlog

No remaining work for the v0.1.0 package. A future release may add an explicit update workflow for existing Collection code and more live UI regression coverage.

## Release decisions

- Public GitHub repository: `martinmco/thymer-schedule`.
- MIT license; include FullCalendar MIT notice in source distribution and bundled view code.
- Global plugin installs Schedule only after an explicit Collection selection.
- Unknown Collection custom code remains a merge-required case.

## Verification

- `npm ci`, `npm run build`, and four focused installer tests passed. Generated bundles include this project's MIT license and FullCalendar's MIT notice.
- The release audit found no workspace IDs, credentials, private Collection names, or local paths in tracked files.
- The seven existing Collection plugins and the global installer were backed up, updated to the v0.1.0 bundles, and read back through Thymer MCP. Each retained its exact configuration. Current v0.1.0 UI interaction has not been retested on screen.
