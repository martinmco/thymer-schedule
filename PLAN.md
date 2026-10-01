# Thymer Schedule plan

## Where we are

| Workstream | State | Immediate next outcome |
| --- | --- | --- |
| ✅ v0.1.0 release | The opt-in installer and Collection view are published with source and pasteable bundles | Maintain compatibility with the released configuration |
| ✅ Reproducible builds | Locked FullCalendar dependencies, bundled license notices, tests, and CI checks cover the committed bundles | Keep generated files in sync with source |
| ✅ Public README | The approved README opens with a plain definition, realistic Cedar example on light grey, horizontal menu, functions table, and complete short setup | Keep the screenshot and setup steps in sync with future releases |
| 🟡 Existing installation updates | The installer recognizes earlier Schedule code but does not replace it automatically | Design an explicit, reversible update flow |
| ⬜ Light theme support | v0.1 event text has insufficient contrast in light mode | Use Thymer theme variables for event colors and verify both appearances |
| ⬜ UI regression coverage | Installer behavior has automated tests; calendar interactions rely on manual checks | Add repeatable checks for view switching, settings, creation, drag, and resize |

## Current work

Keep the v0.1 release installable and review bug reports against the current Thymer SDK. Changes to Collection code must preserve a Collection's existing view options and date-field mapping.

The public README keeps first-time setup, compatibility, source, and build details alongside the approved product preview; installation remains tied to the v0.1 release.

## Remaining work — single backlog

1. Design an opt-in update action for existing Schedule installations, with a configuration backup, a code ownership check, and readback after saving.
2. Fix light-theme event contrast using Thymer's current theme variables and verify both light and dark appearances.
3. Add repeatable UI checks for Day, Week, custom days, Calendar → Schedule navigation, settings persistence, and event edits.

## Decisions

- Schedule is a Collection custom view. A global plugin offers commands to install it in selected Collections.
- Installation leaves unrelated Collection plugin code alone and reports a merge requirement.
- View settings live in the Collection view's `opts`; selected mode and date are local to each device.
- Pasteable bundles are committed for installation without a local build. CI rebuilds them and checks for drift.

## Release history

- [v0.1.0](https://github.com/martinmco/thymer-schedule/releases/tag/v0.1.0): first public release with Day, Week, configurable day span and hours, editable timed events, and an opt-in installer.
