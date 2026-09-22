// ============================================================================
// modals.js — registro central de modales + modales genéricos (autorización,
// confirmación). Cada módulo de vista registra los suyos con registerModal().
// ============================================================================
import { icon } from './icons.js';
import { store } from './db.js';
import { closeModal, ui, showToast } from './state.js';
import { avatar } from './ui.js';
import { ROLE_LABEL, escapeHtml } from './helpers.js';

export const MODALS = {};
export function registerModal(type, renderFn) { MODALS[type] = renderFn; }

export function modalHtml() {
  const m = ui.modal;
  if (!m) return '';
  const renderer = MODALS[m.type];
  if (!renderer) return '';
  const { title, body, foot, wide } = renderer(m);
  return `<div class="modal-scrim" data-action="scrimClose">
    <div class="modal ${wide ? 'wide' : ''}" data-stop="1">
      <div class="modal-head">
        <div class="modal-title">${title}</div>
        <button class="icon-btn" data-action="closeModal">${icon('close')}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Autorización — pide PIN de un rol habilitado antes de continuar
// ---------------------------------------------------------------------------
export const authState = { pin: '' };

registerModal('authorize', (m) => {
  const eligible = store.data.users.filter(u => m.roles.has(u.role) && u.active !== false);
  const dots = Array.from({ length: 4 }, (_, i) => `<div class="pin-dot ${i < authState.pin.length ? 'filled' : ''}"></div>`).join('');
  return {
    title: 'Autorización requerida',
    body: `
      <div class="small muted" style="text-align:center">${escapeHtml(m.reason || 'Esta acción requiere autorización de un supervisor.')}</div>
      <div class="col" style="gap:6px">
        <div class="small muted bold" style="text-align:center;margin-top:4px">Selecciona quién autoriza</div>
        <div class="flex wrap" style="justify-content:center;gap:8px">
          ${eligible.map(u => `<button class="btn sm ${m.authUserId === u.id ? 'primary' : ''}" data-action="authPick" data-id="${u.id}">${escapeHtml(u.name)}</button>`).join('') || '<div class="small muted">No hay usuarios con permiso configurados.</div>'}
        </div>
      </div>
      ${m.authUserId ? `
      <div class="pin-dots">${dots}</div>
      <div class="pin-pad">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="pin-key" data-action="authKey" data-k="${n}">${n}</button>`).join('')}
        <button class="pin-key wide" data-action="authKey" data-k="clear">Borrar</button>
        <button class="pin-key" data-action="authKey" data-k="0">0</button>
        <button class="pin-key wide" data-action="authKey" data-k="back">←</button>
      </div>` : ''}
    `,
    foot: `<button class="btn ghost" data-action="closeModal">Cancelar</button>`,
  };
});

export function tryAuthSubmit(m) {
  const user = store.data.users.find(u => u.id === m.authUserId);
  if (!user) return;
  if (String(user.pin || '') === authState.pin) {
    authState.pin = '';
    m.onAuthorized(user);
  } else {
    showToast('PIN incorrecto', 'danger');
    authState.pin = '';
  }
}

// ---------------------------------------------------------------------------
// Confirmación genérica
// ---------------------------------------------------------------------------
registerModal('confirm', (m) => ({
  title: m.title || 'Confirmar',
  body: `<div class="small">${m.message || ''}</div>`,
  foot: `
    <button class="btn ghost" data-action="closeModal">Cancelar</button>
    <button class="btn ${m.danger ? 'danger' : 'primary'}" data-action="confirmYes">${m.confirmLabel || 'Confirmar'}</button>
  `,
}));

export function confirmDialog({ title, message, danger, confirmLabel, onConfirm }) {
  return { type: 'confirm', title, message, danger, confirmLabel, onConfirm };
}
