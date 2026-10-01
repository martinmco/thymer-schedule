# Thymer Schedule

## Where we are

| Workstream | State | Immediate next outcome |
| --- | --- | --- |
| ✅ v0.1 hardening | Scoped popover cleanup, settings readback, partial date-write handling, and installer verification are built; four focused tests pass | Preserve the verified bundle |
| 🟡 Public package | Source, installer, docs, license, and third-party notice are assembled | Publish public repository and v0.1.0 release |
| ✅ Live update | Seven Collection plugins and the global installer were backed up, updated, and read back with unchanged configuration | Validate fresh runtime interaction when a UI session is available |

## Current work

Release a public, opt-in FullCalendar Schedule plugin. Keep the Collection view and global installer as separate pasteable bundles. Preserve existing Collection configuration and recognized older code without silently overwriting unrelated plugins.

## Remaining work — single backlog

1. Finish the repository content audit, publish the public repository and v0.1.0 GitHub release, and verify both remotely.

## Release decisions

- Public GitHub repository: `martinmco/thymer-schedule`.
- MIT license; include FullCalendar MIT notice in source distribution and bundled view code.
- Global plugin installs Schedule only after an explicit Collection selection.
- Unknown Collection custom code remains a merge-required case.
