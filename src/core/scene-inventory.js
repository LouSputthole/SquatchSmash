import { inventorySlotView } from './inventory-view.js';

let stylesheetInstalled = false;

function installStylesheet() {
  if (stylesheetInstalled || typeof document === 'undefined') return;
  stylesheetInstalled = true;
  if (document.querySelector('link[data-squatch-inventory]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./inventory-bar.css', import.meta.url).href;
  link.dataset.squatchInventory = 'true';
  document.head.append(link);
}

export function renderInventorySlots(root, spec = {}) {
  if (!root) return [];
  const view = inventorySlotView(spec);
  const nodes = view.map((slot) => {
    const el = document.createElement('div');
    el.className = `slot${slot.selected ? ' on' : ''}`;
    el.dataset.key = slot.key;
    el.textContent = slot.icon;
    el.title = slot.label;
    el.setAttribute('aria-label', slot.label);
    return el;
  });
  root.replaceChildren(...nodes);
  root.classList.remove('hidden');
  root.dataset.slotCount = String(view.length);
  return view;
}

/**
 * Small adapter for scenes that do not use the apartment Hud class. The scene
 * owns the loadout; this owns only the stable bottom-box presentation.
 */
export class SceneInventoryBar {
  constructor({ slots = 5, root = null, catalog = {}, visible = true } = {}) {
    installStylesheet();
    this.slots = slots;
    this.catalog = catalog;
    this.items = [];
    this.selected = 0;
    this.root = root || document.getElementById('hotbar');
    if (!this.root) {
      let hands = document.getElementById('scene-inventory-hands');
      if (!hands) {
        hands = document.createElement('div');
        hands.id = 'scene-inventory-hands';
        document.body.append(hands);
      }
      this.root = document.createElement('div');
      this.root.id = 'hotbar';
      hands.append(this.root);
    }
    this.root.classList.toggle('hidden', !visible);
    if (visible) this.render();
  }

  set(items = [], selected = this.selected) {
    this.items = [...items];
    this.selected = selected;
    return this.render();
  }

  show() {
    this.root.classList.remove('hidden');
    return this.render();
  }

  hide() { this.root.classList.add('hidden'); }

  render() {
    if (this.root.classList.contains('hidden')) return [];
    return renderInventorySlots(this.root, {
      slots: this.slots,
      items: this.items,
      selected: this.selected,
      catalog: this.catalog,
    });
  }
}
