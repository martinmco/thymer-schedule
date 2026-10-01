import { Calendar } from '@fullcalendar/core';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

const DEFAULT_MINUTES = 60;
const DEFAULT_VISIBLE_START = '09:00';
const DEFAULT_VISIBLE_END = '18:00';
const DEFAULT_SPAN_DAYS = 3;
const MAX_SPAN_DAYS = 14;

const validTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):(00|15|30|45)$/.test(value);
const timeMinutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const timeOptions = () => {
  const values = [];
  for (let minutes = 0; minutes <= 24 * 60; minutes += 15) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    values.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  }
  return values;
};

export class Plugin extends CollectionPlugin {
  onLoad() {
    this.views.register('Schedule', (viewContext) => {
      let calendar = null;
      let root = null;
      let sizeObserver = null;
      let observedWidth = 0;
      let records = [];
      let busy = false;
      let pendingCreate = null;
      let settingsPopover = null;
      let destroyed = false;
      const config = this.getConfiguration().custom?.dayWeek || {};
      const startField = config.startField || 'start';
      const endField = config.endField || 'end';
      const defaultMinutes = Number(config.defaultMinutes) > 0 ? Number(config.defaultMinutes) : DEFAULT_MINUTES;
      const scheduleView = this.getConfiguration().views?.find((view) => view.label === 'Schedule' && view.type === 'custom');
      let visibleStart = validTime(scheduleView?.opts?.visibleStart) ? scheduleView.opts.visibleStart : DEFAULT_VISIBLE_START;
      let visibleEnd = validTime(scheduleView?.opts?.visibleEnd) || scheduleView?.opts?.visibleEnd === '24:00' ? scheduleView.opts.visibleEnd : DEFAULT_VISIBLE_END;
      let spanDays = Number.isInteger(scheduleView?.opts?.spanDays) && scheduleView.opts.spanDays >= 1 && scheduleView.opts.spanDays <= MAX_SPAN_DAYS
        ? scheduleView.opts.spanDays : DEFAULT_SPAN_DAYS;
      if (timeMinutes(visibleEnd) <= timeMinutes(visibleStart)) {
        visibleStart = DEFAULT_VISIBLE_START;
        visibleEnd = DEFAULT_VISIBLE_END;
      }
      const stateKey = `thymer-day-week:${this.collection.getGuid()}:${scheduleView?.id || 'Schedule'}`;
      let savedState = {};
      try { savedState = JSON.parse(localStorage.getItem(stateKey) || '{}') || {}; }
      catch { savedState = {}; }
      const initialView = ['timeGridSpan', 'timeGridWeek', 'timeGridDay'].includes(savedState.mode) ? savedState.mode : 'timeGridWeek';
      const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(savedState.date || '') && Number.isFinite(Date.parse(savedState.date)) ? savedState.date : undefined;
      const canWrite = () => !viewContext.isViewingOldVersion();
      const syncCalendarSize = () => {
        if (!calendar || !root?.isConnected) return;
        calendar.updateSize();
      };
      const fitCalendarHeight = () => {
        if (!calendar || !root) return;
        const available = Math.max(300, window.innerHeight - root.getBoundingClientRect().top - 28);
        const halfHours = Math.ceil((timeMinutes(visibleEnd) - timeMinutes(visibleStart)) / 30);
        const height = Math.floor(Math.min(available, Math.max(300, halfHours * 60)));
        if (calendar.getOption('height') !== height) calendar.setOption('height', height);
        else calendar.updateSize();
      };
      const spanLabel = () => `${spanDays} ${spanDays === 1 ? 'day' : 'days'}`;
      const updateSpanButton = () => {
        const button = root?.querySelector('.fc-timeGridSpan-button');
        if (!button) return;
        button.textContent = spanLabel();
        button.setAttribute('title', 'Click to view; right-click to choose days');
      };
      const showSettings = (button) => {
        if (destroyed || !root?.contains(button)) return;
        if (settingsPopover) {
          settingsPopover.remove();
          settingsPopover = null;
          return;
        }
        const popover = document.createElement('div');
        popover.className = 'thymer-day-week-hours-popover';
        settingsPopover = popover;
        const heading = document.createElement('strong');
        heading.textContent = 'Schedule settings';
        const row = document.createElement('div');
        row.className = 'thymer-day-week-hours-row';
        const makeSelect = (labelText, selected) => {
          const label = document.createElement('label');
          label.textContent = labelText;
          const select = document.createElement('select');
          for (const value of timeOptions()) {
            if (labelText === 'From' && value === '24:00') continue;
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.append(option);
          }
          select.value = selected;
          label.append(select);
          row.append(label);
          return select;
        };
        const from = makeSelect('From', visibleStart);
        const to = makeSelect('To', visibleEnd);
        const daysLabel = document.createElement('label');
        daysLabel.textContent = 'Days';
        const days = document.createElement('select');
        for (let count = 1; count <= MAX_SPAN_DAYS; count++) {
          const option = document.createElement('option');
          option.value = String(count);
          option.textContent = `${count} ${count === 1 ? 'day' : 'days'}`;
          days.append(option);
        }
        days.value = String(spanDays);
        daysLabel.append(days);
        row.append(daysLabel);
        const error = document.createElement('div');
        error.className = 'thymer-day-week-hours-error';
        const actions = document.createElement('div');
        actions.className = 'thymer-day-week-hours-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.onclick = () => { popover.remove(); settingsPopover = null; };
        const save = document.createElement('button');
        save.type = 'button';
        save.textContent = 'Save';
        save.onclick = async () => {
          if (timeMinutes(to.value) <= timeMinutes(from.value)) {
            error.textContent = 'End must be after start.';
            return;
          }
          if (!canWrite()) { error.textContent = 'This version is read-only.'; return; }
          save.disabled = true;
          try {
            const latest = this.collection.getExistingCodeAndConfig().json;
            const next = JSON.parse(JSON.stringify(latest));
            const view = next.views.find((item) => item.id === scheduleView?.id);
            if (!view) throw new Error('Schedule view is missing from the Collection configuration.');
            view.opts ||= {};
            view.opts.visibleStart = from.value;
            view.opts.visibleEnd = to.value;
            view.opts.spanDays = Number(days.value);
            const saved = await this.collection.saveConfiguration(next);
            if (!saved) throw new Error('Thymer did not save Schedule settings.');
            const live = this.data.getPluginByGuid(this.collection.getGuid())?.getExistingCodeAndConfig()?.json;
            const savedView = live?.views?.find((item) => item.id === scheduleView.id);
            if (savedView?.opts?.visibleStart !== from.value || savedView?.opts?.visibleEnd !== to.value || savedView?.opts?.spanDays !== Number(days.value)) {
              throw new Error('Saved Schedule settings did not match readback.');
            }
            if (destroyed) return;
            visibleStart = from.value;
            visibleEnd = to.value;
            spanDays = Number(days.value);
            calendar?.setOption('slotMinTime', `${visibleStart}:00`);
            calendar?.setOption('slotMaxTime', `${visibleEnd}:00`);
            calendar?.setOption('duration', { days: spanDays });
            requestAnimationFrame(updateSpanButton);
            requestAnimationFrame(fitCalendarHeight);
            popover.remove();
            settingsPopover = null;
          } catch (failure) {
            if (!destroyed) {
              error.textContent = 'Could not confirm saved settings. Check this view before retrying.';
              save.disabled = false;
            }
            console.error('Thymer Schedule settings save failed', failure);
          }
        };
        actions.append(cancel, save);
        popover.append(heading, row, error, actions);
        if (button.parentElement) {
          button.parentElement.style.position = 'relative';
          button.parentElement.append(popover);
        }
      };
      const onToolbarContextMenu = (event) => {
        const button = event.target instanceof Element ? event.target.closest('.fc-timeGridSpan-button') : null;
        if (!button || !root?.contains(button)) return;
        event.preventDefault();
        event.stopPropagation();
        showSettings(button);
      };

      const recordEvent = (record) => {
        const start = record.prop(startField)?.datetime();
        if (!start) return null;
        const end = record.prop(endField)?.datetime();
        const startDate = start.toDate();
        const endDate = end?.toDate() || new Date(startDate.getTime() + defaultMinutes * 60000);
        if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) return null;
        return { id: record.guid, title: record.getName(), start: startDate, end: endDate, allDay: false };
      };

      const refresh = () => {
        if (!calendar) return;
        calendar.removeAllEvents();
        calendar.addEventSource(records.map(recordEvent).filter(Boolean));
      };

      const updateDates = (record, start, end) => {
        const startProp = record.prop(startField);
        const endProp = record.prop(endField);
        if (!startProp || !endProp) throw new Error('Start and End fields must exist and be editable.');
        const previousStart = startProp.datetime()?.toDate();
        startProp.setFromDate(start);
        try { endProp.setFromDate(end); }
        catch (error) {
          if (previousStart) {
            try { startProp.setFromDate(previousStart); }
            catch (rollbackError) { console.error('Thymer Schedule could not restore Start after End failed', rollbackError); }
          }
          throw error;
        }
      };

      const finishCreate = (record, start, end) => {
        try {
          updateDates(record, start, end);
        } catch (error) {
          pendingCreate = null;
          try { record.trash(); }
          catch (trashError) { console.error('Thymer Day/Week could not remove incomplete record', trashError); }
          records = records.filter((item) => item.guid !== record.guid);
          calendar?.unselect();
          refresh();
          console.error('Thymer Day/Week create failed', error);
          this.ui.addToaster({ title: 'Event was not created', message: 'Start and End could not be saved.', dismissible: true, autoDestroyTime: 7000 });
          return;
        }
        pendingCreate = null;
        viewContext.openRecordInOtherPanel(record.guid);
      };

      const handleMove = (info) => {
        if (!canWrite() || busy) { info.revert(); return; }
        const record = viewContext.getRecord(info.event.id);
        if (!record || !info.event.start) { info.revert(); return; }
        try {
          busy = true;
          updateDates(record, info.event.start, info.event.end || new Date(info.event.start.getTime() + defaultMinutes * 60000));
        } catch (error) {
          info.revert();
          console.error('Thymer Day/Week update failed', error);
          this.ui.addToaster({ title: 'Event was not moved', message: 'Start or End could not be saved. Check the Record dates.', dismissible: true, autoDestroyTime: 7000 });
        } finally { busy = false; }
      };

      return {
        onLoad: () => {
          viewContext.makeWideLayout();
          root = viewContext.getElement();
          root.innerHTML = '';
          root.classList.add('thymer-day-week');
          if (!this._scheduleCssInjected) this.ui.injectCSS(`
            .thymer-day-week { min-height: 0; width: 100%; max-width: 100%; padding: 0; }
            .thymer-day-week.is-day { width: min(100%, 640px); max-width: 640px; margin-inline: auto; }
            .thymer-day-week.is-day .fc-toolbar { flex-wrap: wrap; gap: 8px; }
            .thymer-day-week.is-day .fc-toolbar-chunk:first-child { flex: 1 0 100%; }
            .thymer-day-week.is-day .fc-toolbar-title { white-space: nowrap; }
            .thymer-day-week.fc {
              color: var(--text-default); font-family: inherit;
              --fc-page-bg-color: var(--panel-bg-color);
              --fc-neutral-bg-color: var(--panel-bg-color);
              --fc-border-color: var(--thin-divider-color);
              --fc-now-indicator-color: var(--color-primary-700);
              --fc-today-bg-color: color-mix(in srgb, var(--color-primary-400) 9%, transparent);
              --fc-event-bg-color: color-mix(in srgb, var(--panel-bg-color) 78%, var(--text-default) 22%);
              --fc-event-border-color: transparent;
              --fc-event-text-color: var(--text-default);
            }
            .thymer-day-week.fc .fc-toolbar { margin-bottom: 16px; align-items: center; }
            .thymer-day-week.fc .fc-toolbar-title { font-size: 20px; font-weight: 600; line-height: 1.4; }
            .thymer-day-week.fc .fc-button-primary,
            .thymer-day-week.fc .fc-button-primary:not(:disabled):hover,
            .thymer-day-week.fc .fc-button-primary:not(:disabled).fc-button-active {
              background: transparent; border: 0; box-shadow: none; color: var(--text-muted);
              padding: 5px 9px; font-size: 14px; font-weight: 500; text-transform: capitalize;
            }
            .thymer-day-week.fc .fc-button-primary:not(:disabled):hover { color: var(--text-default); background: var(--bg-hover); }
            .thymer-day-week.fc .fc-button-primary:not(:disabled).fc-button-active { color: var(--text-default); background: var(--bg-hover); border-radius: 6px; }
            .thymer-day-week.fc .fc-button-group { gap: 2px; }
            .thymer-day-week.fc .fc-button-group > .fc-button { border-radius: 6px; }
            .thymer-day-week.fc .fc-settings-button, .thymer-day-week.fc .fc-timeGridSpan-button { position: relative; }
            .thymer-day-week-hours-popover { position: absolute; top: 100%; right: 0; z-index: 20; width: 310px; padding: 14px; border: 1px solid var(--fc-border-color); border-radius: 8px; background: var(--panel-bg-color); box-shadow: var(--shadow-medium); color: var(--text-default); font-size: 13px; text-align: left; }
            .thymer-day-week-hours-row { display: flex; gap: 10px; margin: 12px 0 6px; }
            .thymer-day-week-hours-row label { display: grid; gap: 5px; flex: 1; color: var(--text-muted); }
            .thymer-day-week-hours-row select { width: 100%; padding: 6px; border: 1px solid var(--fc-border-color); border-radius: 5px; background: var(--input-bg-color); color: var(--text-default); font: inherit; }
            .thymer-day-week-hours-error { min-height: 16px; color: var(--text-error); font-size: 12px; }
            .thymer-day-week-hours-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 5px; }
            .thymer-day-week-hours-actions button { padding: 5px 9px; border: 1px solid var(--fc-border-color); border-radius: 5px; background: var(--button-bg-color); color: var(--text-default); font: inherit; cursor: pointer; }
            .thymer-day-week .fc-col-header-cell,
              .thymer-day-week .fc-scrollgrid-section-header th { background: var(--panel-bg-color) !important; color: var(--text-default) !important; text-align: left; }
            .thymer-day-week .fc-col-header-cell-cushion { display: block; width: 100%; color: var(--text-muted) !important; font-weight: 500; font-size: 13px; padding: 8px 4px; }
            .thymer-day-week .thymer-day-header { display: flex; align-items: center; justify-content: flex-start; gap: 6px; min-height: 35px; padding-left: 8px; }
            .thymer-day-week .thymer-day-number { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: color-mix(in srgb, var(--panel-bg-color) 90%, var(--text-default) 10%); color: var(--text-default); font-size: 13px; font-weight: 600; }
            .thymer-day-week .thymer-day-header.today .thymer-day-number { background: var(--selection-bg); color: var(--text-hilite); }
            .thymer-day-week .thymer-day-name { color: var(--text-subtle); font-size: 11px; font-weight: 500; }
            .thymer-day-week.fc .fc-timegrid-col.thymer-weekend { background: color-mix(in srgb, var(--text-default) 3%, transparent); }
            .thymer-day-week.fc .fc-timegrid-col.fc-day-today { background: var(--fc-today-bg-color); }
            .thymer-day-week.fc .fc-timegrid-slot-label-cushion { color: var(--text-muted); font-size: 12px; }
            .thymer-day-week.fc .fc-timegrid-slot { height: 28px; }
            .thymer-day-week.fc .fc-timegrid-event { border-radius: 5px; padding: 2px 4px; }
            .thymer-day-week.fc .fc-timegrid-event .fc-event-resizer-end { height: 14px; bottom: -4px; z-index: 5; cursor: s-resize; }
            .thymer-day-week.fc .fc-timegrid-event:hover .fc-event-resizer-end::after { content: ''; position: absolute; left: calc(50% - 14px); bottom: 5px; width: 28px; height: 3px; border-radius: 3px; background: var(--text-muted); opacity: .8; }
            .thymer-day-week.fc-theme-standard td, .thymer-day-week.fc-theme-standard th,
            .thymer-day-week.fc-theme-standard .fc-scrollgrid { border-color: var(--thin-divider-color); }
          `);
          this._scheduleCssInjected = true;
          calendar = new Calendar(root, {
            plugins: [timeGridPlugin, interactionPlugin],
            initialView,
            initialDate,
            duration: { days: spanDays },
            views: { timeGridSpan: { type: 'timeGrid', buttonText: spanLabel() } },
            firstDay: 1,
            headerToolbar: { left: 'title', center: '', right: 'prev,next today timeGridSpan,timeGridWeek,timeGridDay settings' },
            customButtons: { settings: { text: '⚙', hint: 'Schedule settings', click: (_ev, element) => showSettings(element) } },
            dayHeaderContent: ({ date, isToday }) => ({ html: `<span class="thymer-day-header${isToday ? ' today' : ''}"><span class="thymer-day-number">${date.getDate()}</span><span class="thymer-day-name">${date.toLocaleDateString(undefined, { weekday: 'short' })}</span></span>` }),
            dayCellClassNames: ({ dow }) => dow === 0 || dow === 6 ? ['thymer-weekend'] : [],
            datesSet: ({ view }) => {
              const isDay = view.type === 'timeGridDay';
              viewContext.makeWideLayout();
              root?.classList.toggle('is-day', isDay);
              requestAnimationFrame(updateSpanButton);
              try { localStorage.setItem(stateKey, JSON.stringify({ mode: view.type, date: localDate(calendar.getDate()) })); }
              catch (error) { console.warn('Thymer Day/Week could not remember view position', error); }
              requestAnimationFrame(() => {
                fitCalendarHeight();
                requestAnimationFrame(syncCalendarSize);
              });
            },
            nowIndicator: true,
            selectable: true,
            editable: true,
            eventDurationEditable: true,
            selectMirror: true,
            slotDuration: '00:30:00',
            snapDuration: '00:15:00',
            slotMinTime: `${visibleStart}:00`,
            slotMaxTime: `${visibleEnd}:00`,
            scrollTime: `${visibleStart}:00`,
            allDaySlot: false,
            expandRows: true,
            height: 600,
            events: [],
            eventClick: ({ event }) => viewContext.openRecordInOtherPanel(event.id),
            eventDrop: handleMove,
            eventResize: handleMove,
            select: ({ start, end }) => {
              if (!canWrite() || busy || !viewContext.supportsCreateRecord()) return;
              const guid = viewContext.createRecord();
              if (!guid) return;
              pendingCreate = { guid, start, end };
              const record = viewContext.getRecord(guid) || this.data.getRecord(guid);
              if (record) finishCreate(record, start, end);
            }
          });
          calendar.render();
          observedWidth = root.getBoundingClientRect().width;
          sizeObserver = new ResizeObserver(([entry]) => {
            const width = entry.contentRect.width;
            if (Math.abs(width - observedWidth) < 1) return;
            observedWidth = width;
            requestAnimationFrame(syncCalendarSize);
          });
          sizeObserver.observe(root);
          root.addEventListener('contextmenu', onToolbarContextMenu);
          updateSpanButton();
          fitCalendarHeight();
          window.addEventListener('resize', fitCalendarHeight);
        },
        onRefresh: ({ records: nextRecords }) => {
          records = nextRecords;
          if (pendingCreate) {
            const record = records.find((item) => item.guid === pendingCreate.guid) || this.data.getRecord(pendingCreate.guid);
            if (record) {
              const { start, end } = pendingCreate;
              finishCreate(record, start, end);
            }
          }
          refresh();
        },
        onPanelResize: fitCalendarHeight,
        onDestroy: () => { destroyed = true; settingsPopover?.remove(); settingsPopover = null; window.removeEventListener('resize', fitCalendarHeight); sizeObserver?.disconnect(); sizeObserver = null; root?.removeEventListener('contextmenu', onToolbarContextMenu); if (pendingCreate) { try { this.data.getRecord(pendingCreate.guid)?.trash(); } catch (error) { console.error('Thymer Day/Week could not remove incomplete record', error); } pendingCreate = null; } calendar?.destroy(); calendar = null; root = null; records = []; },
        onFocus: () => {},
        onBlur: () => {},
        onKeyboardNavigation: () => {}
      };
    });
  }
}
