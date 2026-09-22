// ============================================================================
// views/login.js — selección de cajero + PIN
// ============================================================================
import { store } from '../db.js';
import { ui, login, showToast, requestRender } from '../state.js';
import { registerActions } from '../actions.js';
import { registerRoute } from '../routes.js';
import { icon } from '../icons.js';
import { avatar } from '../ui.js';
import { ROLE_LABEL, escapeHtml } from '../helpers.js';

function defaultRouteFor(role) {
  if (role === 'cajero') return 'accounts';
  if (role === 'mesero') return 'orders';
  return 'dashboard';
}

function render() {
  const users = store.data.users.filter(u => u.active !== false);
  const picked = users.find(u => u.id === ui.login.pickedId);

  if (!store.ready) {
    return `<div class="login-screen"><div class="login-card">
      <div class="login-mark display">C</div>
      <div class="login-title display">Champions</div>
      <div class="login-sub">Cargando…</div>
    </div></div>`;
  }

  if (!picked) {
    return `<div class="login-screen"><div class="login-card">
      <div class="login-mark display">C</div>
      <div class="login-title display">Champions</div>
      <div class="login-sub">Sistema de control de barra · selecciona tu usuario</div>
      <div class="staff-grid">
        ${users.map(u => `
          <button class="staff-item" data-action="loginPick" data-id="${u.id}">
            ${avatar(u.name, 44)}
            <div class="staff-item-name">${escapeHtml(u.name)}</div>
            <div class="staff-item-role">${ROLE_LABEL[u.role] || u.role}</div>
          </button>`).join('')}
        ${!users.length ? `<div class="small muted" style="grid-column:1/-1">No hay usuarios configurados todavía.</div>` : ''}
      </div>
      ${!store.online ? `<div class="small faint mt-24">Modo local de práctica · los datos no se comparten</div>` : ''}
    </div></div>`;
  }

  const dots = Array.from({ length: 4 }, (_, i) => `<div class="pin-dot ${i < ui.login.pin.length ? 'filled' : ''}"></div>`).join('');
  return `<div class="login-screen"><div class="login-card">
    ${avatar(picked.name, 56)}
    <div class="login-title display mt-16">${escapeHtml(picked.name)}</div>
    <div class="login-sub">Ingresa tu PIN</div>
    <div class="pin-dots">${dots}</div>
    <div class="pin-pad">
      ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="pin-key" data-action="loginKey" data-k="${n}">${n}</button>`).join('')}
      <button class="pin-key wide" data-action="loginBack">Atrás</button>
      <button class="pin-key" data-action="loginKey" data-k="0">0</button>
      <button class="pin-key wide" data-action="loginKey" data-k="back">←</button>
    </div>
  </div></div>`;
}

registerRoute('login', render);

registerActions({
  loginPick(el) {
    ui.login.pickedId = el.dataset.id;
    ui.login.pin = '';
    requestRender();
  },
  loginBack() {
    ui.login.pickedId = null;
    ui.login.pin = '';
    requestRender();
  },
  loginKey(el) {
    const k = el.dataset.k;
    if (k === 'back') { ui.login.pin = ui.login.pin.slice(0, -1); requestRender(); return; }
    if (ui.login.pin.length >= 4) return;
    ui.login.pin += k;
    requestRender();
    if (ui.login.pin.length === 4) {
      const user = store.data.users.find(u => u.id === ui.login.pickedId);
      setTimeout(() => {
        if (user && String(user.pin || '') === ui.login.pin) {
          login(user);
          ui.route = defaultRouteFor(user.role);
          ui.login = { pickedId: null, pin: '' };
        } else {
          showToast('PIN incorrecto', 'danger');
          ui.login.pin = '';
        }
        requestRender();
      }, 120);
    }
  },
});
