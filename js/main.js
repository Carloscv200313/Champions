// ============================================================================
// main.js — arranque, router, delegación de eventos y bucle de render.
// ============================================================================
import { store } from './db.js';
import {
  ui, session, closeModal, requestRender, bindRenderer, showToast, logout,
  ensureTables, migrateLegacyCategories,
} from './state.js';
import { ACTIONS, registerActions } from './actions.js';
import { ROUTES } from './routes.js';
import { routeAllowed } from './ui.js';
import { modalHtml, authState, tryAuthSubmit } from './modals.js';
import { toastHtml } from './ui.js';
import { ROLE_LABEL } from './helpers.js';

// -- importar todas las vistas (se auto-registran vía registerRoute) -------
import './views/login.js';
import './views/dashboard.js';
import './views/orders.js';
import './views/checkout.js';
import './views/accounts.js';
import './views/customers.js';
import './views/inventory.js';
import './views/recipes.js';
import './views/reports.js';
import './views/audit.js';
import './views/settings.js';

const root = document.getElementById('app');

function currentHtml() {
  if (!session.currentUser) return ROUTES.login();
  if (!routeAllowed(ui.route)) ui.route = 'dashboard';
  const renderFn = ROUTES[ui.route] || ROUTES.dashboard;
  return renderFn() + modalHtml() + toastHtml();
}

function render() {
  const active = document.activeElement;
  let savedId = null, selStart = null, selEnd = null;
  if (active && root.contains(active) && active.id) {
    savedId = active.id;
    if ('selectionStart' in active) { try { selStart = active.selectionStart; selEnd = active.selectionEnd; } catch (e) {} }
  }
  root.innerHTML = currentHtml();
  if (savedId) {
    const el = document.getElementById(savedId);
    if (el) {
      el.focus();
      if (selStart != null && 'setSelectionRange' in el) {
        try { el.setSelectionRange(selStart, selEnd); } catch (e) {}
      }
    }
  }
}
bindRenderer(render);

// -- acciones globales -------------------------------------------------
registerActions({
  go(el) {
    const route = el.dataset.route;
    if (!routeAllowed(route)) { showToast('No tienes acceso a esta sección', 'danger'); return; }
    ui.route = route;
    ui.sidebarOpen = false;
    requestRender();
  },
  toggleSidebar() { ui.sidebarOpen = !ui.sidebarOpen; requestRender(); },
  closeSidebar() { ui.sidebarOpen = false; requestRender(); },
  logout() { logout(); requestRender(); },
  openUserMenu() {
    const u = session.currentUser;
    if (u) showToast(`${u.name} · ${ROLE_LABEL[u.role] || u.role}`);
  },
  closeModal() { authState.pin = ''; closeModal(); },
  confirmYes() {
    const m = ui.modal;
    closeModal();
    m?.onConfirm?.();
  },
  authPick(el) {
    if (ui.modal) { ui.modal.authUserId = el.dataset.id; authState.pin = ''; requestRender(); }
  },
  authKey(el) {
    const m = ui.modal;
    if (!m || !m.authUserId) return;
    const k = el.dataset.k;
    if (k === 'back') { authState.pin = authState.pin.slice(0, -1); requestRender(); return; }
    if (k === 'clear') { authState.pin = ''; requestRender(); return; }
    if (authState.pin.length >= 4) return;
    authState.pin += k;
    requestRender();
    if (authState.pin.length === 4) setTimeout(() => tryAuthSubmit(m), 100);
  },
});

// -- delegación de eventos ----------------------------------------------
root.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal-scrim')) {
    ACTIONS.closeModal(); return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el, e); }
});

root.addEventListener('input', (e) => {
  const name = e.target.dataset && e.target.dataset.oninput;
  if (name && ACTIONS[name]) ACTIONS[name](e.target, e);
});

root.addEventListener('change', (e) => {
  const name = e.target.dataset && e.target.dataset.onchange;
  if (name && ACTIONS[name]) ACTIONS[name](e.target, e);
});

root.addEventListener('keydown', (e) => {
  const name = e.target.dataset && e.target.dataset.onenter;
  if (e.key === 'Enter' && name && ACTIONS[name]) { e.preventDefault(); ACTIONS[name](e.target, e); }
});

// -- arranque -------------------------------------------------------------
render();
let _bootstrapped = false;
store.onChange(() => {
  render();
  if (!_bootstrapped && store.ready) {
    _bootstrapped = true;
    // Migra catálogos viejos y siembra el roster de mesas la primera vez.
    migrateLegacyCategories();
    ensureTables();
  }
});
store.init();
