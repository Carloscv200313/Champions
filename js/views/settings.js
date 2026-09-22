// ============================================================================
// views/settings.js — usuarios y roles del negocio.
// ============================================================================
import { store } from '../db.js';
import { ui, requestRender, openModal, closeModal, showToast, createUser, updateUser } from '../state.js';
import { registerActions } from '../actions.js';
import { registerRoute } from '../routes.js';
import { registerModal } from '../modals.js';
import { layout, tableWrap, pill, avatar } from '../ui.js';
import { icon } from '../icons.js';
import { escapeHtml, ROLES, ROLE_LABEL } from '../helpers.js';

function render() {
  const users = [...store.data.users].sort((a,b)=>a.name.localeCompare(b.name));
  const content = `
    <div class="section-head"><div class="section-title">Usuarios y roles</div><div class="small muted">Cada rol define qué puede hacer sin autorización adicional</div></div>
    ${tableWrap(`
      <thead><tr><th>Nombre</th><th>Rol</th><th>PIN</th><th>Estado</th><th></th></tr></thead>
      <tbody>
        ${users.map(u => `<tr class="${u.active===false?'faint':''}">
          <td class="bold flex" style="gap:8px">${avatar(u.name,26)}${escapeHtml(u.name)}</td>
          <td class="small">${ROLE_LABEL[u.role]||u.role}</td>
          <td class="num small">••${String(u.pin||'').slice(-2)}</td>
          <td>${u.active===false?pill('Inactivo','neutral'):pill('Activo','good')}</td>
          <td><button class="icon-btn" data-action="userEditOpen" data-id="${u.id}">${icon('edit','ic')}</button></td>
        </tr>`).join('') || '<tr><td colspan="5" class="tbl-empty">Sin usuarios</td></tr>'}
      </tbody>
    `)}
    <div class="card card-pad mt-24">
      <div class="section-title mb-8">Roles del sistema</div>
      <div class="col" style="gap:6px">
        <div class="small"><b>Administrador</b> — acceso total, incluida configuración.</div>
        <div class="small"><b>Gerente</b> — reportes, inventario, recetas y ajustes autorizados.</div>
        <div class="small"><b>Supervisor</b> — autoriza descuentos/cortesías/cancelaciones y revisa cajas e inventario.</div>
        <div class="small"><b>Cajero</b> — vende, cobra y abre/cierra su propia caja.</div>
        <div class="small"><b>Mesero</b> — levanta pedidos en mesas y cuentas abiertas, no cobra ni ve caja.</div>
      </div>
    </div>
  `;
  return layout(content, {
    title: 'Configuración', sub: 'Usuarios, roles y permisos',
    actions: `<button class="btn primary" data-action="userNewOpen">${icon('plus','ic')} Nuevo usuario</button>`,
  });
}
registerRoute('settings', render);

registerActions({
  userNewOpen() { openModal({ type: 'userForm', mode:'new', data:{ name:'', pin:'', role:'cajero' } }); },
  userEditOpen(el) {
    const u = store.get('users', el.dataset.id);
    openModal({ type:'userForm', mode:'edit', id:u.id, data:{ name:u.name, pin:u.pin, role:u.role, active:u.active!==false } });
  },
  userField(el) { if (ui.modal) ui.modal.data[el.dataset.f] = el.value; },
  async userSubmit() {
    const m = ui.modal;
    const d = m.data;
    if (!d.name.trim()) { showToast('Escribe un nombre', 'danger'); return; }
    if (!/^\d{4}$/.test(d.pin)) { showToast('El PIN debe tener 4 dígitos', 'danger'); return; }
    if (m.mode === 'new') await createUser({ name: d.name.trim(), pin: d.pin, role: d.role });
    else await updateUser(m.id, { name: d.name.trim(), pin: d.pin, role: d.role, active: d.active !== false });
    showToast('Usuario guardado');
    closeModal();
  },
  async userToggleActive() {
    const m = ui.modal;
    await updateUser(m.id, { active: !(m.data.active !== false) });
    closeModal();
  },
});

registerModal('userForm', (m) => {
  const d = m.data;
  return {
    title: m.mode === 'new' ? 'Nuevo usuario' : 'Editar usuario',
    body: `
      <label class="field">Nombre<input class="input" value="${escapeHtml(d.name)}" data-oninput="userField" data-f="name"></label>
      <div class="field-row">
        <label class="field">Rol
          <select class="input" data-onchange="userField" data-f="role">
            ${ROLES.map(r => `<option value="${r.id}" ${r.id===d.role?'selected':''}>${r.label}</option>`).join('')}
          </select>
        </label>
        <label class="field">PIN (4 dígitos)<input class="input" maxlength="4" inputmode="numeric" value="${escapeHtml(d.pin)}" data-oninput="userField" data-f="pin"></label>
      </div>
    `,
    foot: m.mode === 'edit'
      ? `<button class="btn danger" data-action="userToggleActive">${d.active!==false?'Desactivar':'Reactivar'}</button><button class="btn primary" data-action="userSubmit">Guardar</button>`
      : `<button class="btn ghost" data-action="closeModal">Cancelar</button><button class="btn primary" data-action="userSubmit">Crear usuario</button>`,
  };
});
