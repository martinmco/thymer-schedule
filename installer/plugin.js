// Opt-in Schedule installer for ordinary Thymer Collections. Built with build.mjs.
const VIEW_SOURCE = __VIEW_SOURCE__;
const LEGACY_VIEW_HASHES = __LEGACY_VIEW_HASHES__;
const VIEW_ID = 'VTHYMERDAYWEEK';
const PANEL_ID = 'thymer-schedule-installer-picker';
const STUB = 'class Plugin extends CollectionPlugin {\n  onLoad() {\n    // Put your custom code here...\n  }\n}';
const isEmptyCode = (value) => !value || !value.trim() || value.trim() === STUB;
const field = (id, label) => ({ id, label, icon: 'ti-calendar-time', many: false, read_only: false, active: true, type: 'datetime' });
const asText = (error) => error instanceof Error ? error.message : String(error);
const sha256 = async (value) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
const usableDateField = (conf, id) => conf.fields.some((item) => item.id === id && item.type === 'datetime' && item.many !== true && item.read_only !== true);

class Plugin extends AppPlugin {
  onLoad() {
    this._inFlight = new Set();
    this._stopped = false;
    this.ui.registerCustomPanelType(PANEL_ID, (panel) => {
      panel.setTitle('Add Schedule');
      this.renderPicker(panel);
    });
    this._commands = [
      this.ui.addCommandPaletteCommand({
        label: 'Schedule: add to current Collection', icon: 'ti-calendar-plus',
        onSelected: () => this.addToCurrent()
      }),
      this.ui.addCommandPaletteCommand({
        label: 'Schedule: choose a Collection...', icon: 'ti-calendar',
        onSelected: () => this.openPicker()
      })
    ];
  }

  onUnload() {
    this._stopped = true;
    for (const command of this._commands || []) command.remove();
  }

  async status(api) {
    const name = api.getName();
    if (api.isJournalPlugin()) return { name, state: 'unavailable', detail: 'Journal uses its own core plugin' };
    const current = api.getExistingCodeAndConfig();
    const conf = current?.json;
    if (!conf || !Array.isArray(conf.fields) || !Array.isArray(conf.views)) return { name, state: 'unavailable', detail: 'Collection schema is unavailable' };
    const ownedCode = current.code === VIEW_SOURCE || LEGACY_VIEW_HASHES.includes(await sha256(current.code || ''));
    const installedView = conf.views.find((view) => view.id === VIEW_ID && view.type === 'custom');
    if (installedView) {
      const mapping = conf.custom?.dayWeek;
      if (!ownedCode) return { name, state: 'unavailable', detail: 'Schedule view exists with different Collection code; merge required' };
      if (!mapping || !usableDateField(conf, mapping.startField) || !usableDateField(conf, mapping.endField) || mapping.startField === mapping.endField) {
        return { name, state: 'unavailable', detail: 'Schedule date fields or mapping need repair' };
      }
      return { name, state: 'installed', detail: 'Schedule is already available' };
    }
    if (conf.views.some((view) => view.id === VIEW_ID || view.label === 'Schedule')) return { name, state: 'unavailable', detail: 'Schedule name or ID belongs to another view' };
    if (ownedCode) {
      const mapping = conf.custom?.dayWeek;
      if (mapping && (!usableDateField(conf, mapping.startField) || !usableDateField(conf, mapping.endField) || mapping.startField === mapping.endField)) {
        return { name, state: 'unavailable', detail: 'Schedule date fields need repair before the view can be restored' };
      }
      return { name, state: 'available', detail: 'Restore the removed Schedule view', ownedCode: true };
    }
    if (!isEmptyCode(current.code)) return { name, state: 'unavailable', detail: 'Collection has custom plugin code; merge required' };
    if (conf.custom?.dayWeek) return { name, state: 'unavailable', detail: 'Schedule configuration key is already in use' };
    return { name, state: 'available', detail: 'Ready to add' };
  }

  async addToCurrent() {
    const collection = this.ui.getActivePanel()?.getActiveCollection();
    if (!collection) return this.openPicker();
    const result = await this.install(collection.getGuid());
    this.ui.addToaster({
      title: result.state === 'installed' ? 'Schedule ready' : 'Schedule was not added',
      message: `${result.name}: ${result.detail}`, dismissible: true, autoDestroyTime: 7000
    });
  }

  async install(guid) {
    if (this._inFlight.has(guid)) return { name: guid, state: 'busy', detail: 'Installation already running' };
    this._inFlight.add(guid);
    try {
      let api = this.data.getPluginByGuid(guid);
      if (!api || typeof api.isJournalPlugin !== 'function') return { name: guid, state: 'unavailable', detail: 'Collection is missing' };
      const initial = await this.status(api);
      if (initial.state !== 'available') return initial;
      const current = api.getExistingCodeAndConfig();
      const next = JSON.parse(JSON.stringify(current.json));
      const ids = new Set(next.fields.map((item) => item.id));
      const choose = (base) => {
        if (!ids.has(base)) { ids.add(base); return base; }
        const existing = next.fields.find((item) => item.id === base);
        if (existing?.type === 'datetime' && existing.many !== true && existing.read_only !== true) return base;
        let candidate = `schedule_${base}`;
        for (let suffix = 2; ids.has(candidate); suffix++) candidate = `schedule_${base}_${suffix}`;
        ids.add(candidate);
        return candidate;
      };
      const mapping = initial.ownedCode ? next.custom?.dayWeek : null;
      const start = mapping?.startField || choose('start');
      const end = mapping?.endField || choose('end');
      if (!next.fields.some((item) => item.id === start)) next.fields.push(field(start, 'Start'));
      if (!next.fields.some((item) => item.id === end)) next.fields.push(field(end, 'End'));
      next.views.push({
        id: VIEW_ID, type: 'custom', icon: 'ti-calendar', label: 'Schedule',
        description: 'Timed calendar with configurable day span, week, and day views',
        shown: true, read_only: false,
        field_ids: [...(ids.has('title') ? ['title'] : []), start, end],
        sort_dir: 'asc', sort_field_id: start, group_by_field_id: null,
        opts: { visibleStart: '09:00', visibleEnd: '18:00', spanDays: 3 }
      });
      next.custom ||= {};
      if (!initial.ownedCode) next.custom.dayWeek = { startField: start, endField: end, defaultMinutes: 60 };
      // Restore only configuration when Schedule's exact installed code is present.
      // New installs save the fields, view and code together.
      const saved = initial.ownedCode
        ? await api.saveConfiguration(next)
        : await api.savePlugin(next, VIEW_SOURCE);
      if (!saved) return { name: initial.name, state: 'error', detail: 'Thymer refused the save; check edit permission' };
      api = this.data.getPluginByGuid(guid);
      const readback = api?.getExistingCodeAndConfig();
      const savedView = readback?.json?.views?.find((view) => view.id === VIEW_ID && view.type === 'custom');
      const savedMapping = readback?.json?.custom?.dayWeek;
      const originalFieldsKept = current.json.fields.every((field) => readback?.json?.fields?.some((savedField) => savedField.id === field.id));
      const originalViewsKept = current.json.views.every((view) => readback?.json?.views?.some((savedView) => savedView.id === view.id));
      if (readback?.code !== (initial.ownedCode ? current.code : VIEW_SOURCE) || !savedView ||
          savedMapping?.startField !== start || savedMapping?.endField !== end ||
          !usableDateField(readback.json, start) || !usableDateField(readback.json, end) ||
          !originalFieldsKept || !originalViewsKept) {
        return { name: initial.name, state: 'error', detail: 'Save returned success but readback did not match' };
      }
      const result = { name: initial.name, state: 'installed', detail: initial.ownedCode ? 'Schedule view restored' : 'Start, End, and Schedule added' };
      return result;
    } catch (error) {
      console.error('Schedule install failed', guid, error);
      return { name: guid, state: 'error', detail: asText(error) };
    } finally {
      this._inFlight.delete(guid);
    }
  }

  async openPicker() {
    const panel = await this.ui.createPanel();
    if (panel) panel.navigateToCustomType(PANEL_ID);
  }

  async renderPicker(panel) {
    const root = panel.getElement();
    if (!root) return;
    root.replaceChildren();
    root.style.cssText = 'padding:24px;overflow:auto;color:var(--text-default);font:14px system-ui;';
    const title = document.createElement('h2');
    title.textContent = 'Add Schedule to a Collection';
    root.append(title);
    const intro = document.createElement('p');
    intro.textContent = 'Choose a Collection when you want Schedule. No new Collection gets it automatically.';
    root.append(intro);
    const list = document.createElement('div');
    list.textContent = 'Loading Collections…';
    root.append(list);
    const refresh = document.createElement('button');
    refresh.textContent = 'Refresh list';
    refresh.onclick = () => draw();
    root.insertBefore(refresh, list);
    const draw = async () => {
      const collections = await this.data.getAllCollections();
      if (this._stopped || !root.isConnected) return;
      list.replaceChildren();
      for (const collection of [...(collections || [])].sort((a, b) => a.getName().localeCompare(b.getName()))) {
        const guid = collection.getGuid();
        const api = this.data.getPluginByGuid(guid);
        if (!api || typeof api.isJournalPlugin !== 'function') continue;
        const state = await this.status(api);
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--faint-divider-color);';
        const info = document.createElement('span');
        info.style.flex = '1';
        info.textContent = `${state.name} — ${state.detail}`;
        row.append(info);
        if (state.state === 'available') {
          const button = document.createElement('button');
          button.textContent = 'Add Schedule';
          button.onclick = async () => {
            button.disabled = true;
            button.textContent = 'Adding…';
            const result = await this.install(guid);
            info.textContent = `${result.name} — ${result.detail}`;
            button.textContent = result.state === 'installed' ? 'Added' : 'Retry';
            button.disabled = result.state === 'installed';
          };
          row.append(button);
        }
        list.append(row);
      }
    };
    await draw();
  }
}
