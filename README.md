# Thymer Schedule

An opt-in timed calendar view for ordinary [Thymer](https://thymer.com) Collections, powered by [FullCalendar](https://fullcalendar.io). Version **0.1.0**.

Schedule has a configurable 1–14 day view, Week, and Day. Its gear sets the number of days and the visible hour range per Collection; right-click the day-span button for the same settings. The default range is 09:00–18:00 and the default span is three days. Week starts Monday. Saturday and Sunday are shaded, today is accented, and event creation, dragging, and resizing snap to 15 minutes. Day uses a centered 640px calendar; Week and custom days fill the available Collection width. The hour grid grows to fill the available height when possible and scrolls for long ranges or short windows.

Schedule stores visible hours and day count in the Collection view's `opts`. It remembers the selected mode and date in browser-local storage on that device. Events come from editable, single-value Start and End date/time fields; a Record without Start is not shown.

## Install

1. In Thymer, create a **new global plugin** named “Schedule (add when needed)” and save the plugin container.
2. Paste [installer/dist/plugin.js](installer/dist/plugin.js) into its Custom Code field and [installer/plugin.json](installer/plugin.json) into Configuration, then save both.
3. Open a Collection and run **Schedule: add to current Collection** from Thymer's command palette. **Schedule: choose a Collection…** opens a picker with availability and skip reasons.

The global plugin changes no Collection until you choose one. On a fresh eligible Collection it adds editable Start and End fields, a Schedule view, and the Collection plugin code. It reads back the code, view, mapping, and fields after saving. Running the command again is a no-op. If the Schedule view was removed but recognized Schedule code remains, the command restores the view without replacing the code.

Thymer has one Collection plugin code slot. If a Collection already has unrelated custom code, the installer reports **merge required** and leaves it alone. Journal uses a different core plugin and is skipped. A custom view cannot be registered once globally for every Collection through the current SDK. The installer does not automatically attach Schedule to future Collections; use the command when needed.

**Existing installations:** The v0.1 installer recognizes the bundled view code and known earlier Schedule bundles. It reports an already-installed view as ready when the code and editable field mapping agree. Updating Schedule code in an existing Collection is a separate, manual operation in v0.1; back up that Collection's code and configuration first. The installer does not silently replace it.

## Build from source

```sh
npm ci
npm test
npm run build
```

`plugin.js` is the Collection view source. `dist/plugin.js` is its unminified pasteable bundle, and `dist/plugin.min.js` is embedded in the global installer. `installer/plugin.js` is the installer source; `installer/dist/plugin.js` is the pasteable global plugin. Bundles are committed so installation does not require Node.js. Build scripts include this project's MIT license and FullCalendar's MIT notice in the generated view code; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

No workspace IDs, API keys, or external services are needed. The plugin uses Thymer's plugin SDK and FullCalendar packages only. Thymer's plugin APIs can change; exact signatures were checked against the [official SDK](https://github.com/thymerapp/thymer-plugin-sdk/blob/6f25f1470ff1/types.d.ts) for this release.

## Configuration and limits

The Collection view uses a custom view with ID `VTHYMERDAYWEEK` and label `Schedule`. A fresh installation saves:

```json
{
  "custom": { "dayWeek": { "startField": "start", "endField": "end", "defaultMinutes": 60 } },
  "views": [{ "id": "VTHYMERDAYWEEK", "type": "custom", "label": "Schedule", "opts": { "visibleStart": "09:00", "visibleEnd": "18:00", "spanDays": 3 } }]
}
```

The excerpt shows only Schedule-owned keys; the installer preserves other Collection fields, views, and configuration. If `start` or `end` is already used by an incompatible field, the installer chooses a distinct `schedule_start` or `schedule_end` ID. It does not merge another plugin's Collection code.

Creating an event makes a Thymer Record. If its dates cannot be saved, Schedule moves the incomplete Record to recoverable Trash and removes it from the grid. If a drag or resize fails, Schedule reverts the calendar interaction and attempts to restore the original Start value; check the Record dates if Thymer reports a write error. All-day and recurring events are outside v0.1 scope.

## License

MIT. FullCalendar's included packages are also MIT licensed; their notice is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
