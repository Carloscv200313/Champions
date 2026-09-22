// ============================================================================
// views/customers.js — base de clientes: ficha (nombre, folio, dirección),
// historial de consumo, abonos (pagos) y saldos pendientes. También expone
// el selector de cliente ("custPicker") reutilizable desde Cuentas/Pedidos
// para ligar una mesa/cuenta a un cliente de la base.
// ============================================================================
import { store } from '../db.js';
import {
  ui, requestRender, openModal, closeModal, showToast,
  createCustomer, updateCustomer, customerStats, assignAccountCustomer,
} from '../state.js';
import { registerActions } from '../actions.js';
import { registerRoute } from '../routes.js';
import { registerModal } from '../modals.js';
import { layout, tableWrap, pill, emptyState, avatar } from '../ui.js';
import { icon } from '../icons.js';
import { money, escapeHtml, fmtDate, fmtDateTime, PAYMENT_LABEL } from '../helpers.js';

function render() {
  const customers = store.data.customers;
  const rows = customers.map(c => ({ ...c, stats: customerStats(c.id) }))
    .sort((a, b) => b.stats.balance - a.stats.balance || b.stats.totalConsumed - a.stats.totalConsumed);
  const debtors = rows.filter(c => c.stats.balance > 0.01);

  const content = `
    ${debtors.length ? `
    <div class="section-head"><div class="section-title">Clientes con saldo pendiente</div></div>
    <div class="flex wrap mb-16" style="gap:8px">
      ${debtors.map(c => `<button class="pill danger" style="cursor:pointer" data-action="custOpenDetail" data-id="${c.id}">${escapeHtml(c.name)} — ${money(c.stats.balance)}</button>`).join('')}
    </div>` : ''}
    <div class="section-head"><div class="section-title">Todos los clientes</div></div>
    ${rows.length ? tableWrap(`
      <thead><tr><th>Cliente</th><th>Folio</th><th>Teléfono</th><th>Cuentas</th><th>Consumo total</th><th>Saldo</th></tr></thead>
      <tbody>
        ${rows.map(c => `
          <tr class="clickable" data-action="custOpenDetail" data-id="${c.id}">
            <td class="bold flex" style="gap:8px">${avatar(c.name, 26)}${escapeHtml(c.name)}</td>
            <td class="muted small">${escapeHtml(c.registrationNumber || '—')}</td>
            <td class="muted small">${escapeHtml(c.phone || '—')}</td>
            <td class="num">${c.stats.accountsCount}</td>
            <td class="num">${money(c.stats.totalConsumed)}</td>
            <td class="num" style="color:${c.stats.balance>0?'var(--danger)':'inherit'}">${money(c.stats.balance)}</td>
          </tr>`).join('')}
      </tbody>
    `) : emptyState('customers', 'Aún no hay clientes registrados')}
  `;
  return layout(content, {
    title: 'Clientes', sub: 'Ficha, historial de consumo y abonos de cada cliente',
    actions: `<button class="btn primary" data-action="custNewOpen">${icon('plus','ic')} Nuevo cliente</button>`,
  });
}
registerRoute('customers', render);

registerActions({
  // -- alta / edición de ficha -------------------------------------------
  custNewOpen() { openModal({ type: 'customerForm', id: null, name: '', phone: '', address: '', notes: '' }); },
  custEditOpen(el) {
    const c = store.get('customers', el.dataset.id);
    if (!c) return;
    openModal({ type: 'customerForm', id: c.id, name: c.name, phone: c.phone || '', address: c.address || '', notes: c.notes || '' });
  },
  custFormField(el) { if (ui.modal) ui.modal[el.dataset.f] = el.value; },
  async custFormSubmit() {
    const m = ui.modal;
    if (!m.name.trim()) { showToast('Escribe un nombre', 'danger'); return; }
    if (m.id) {
      await updateCustomer(m.id, { name: m.name.trim(), phone: m.phone.trim(), address: m.address.trim(), notes: m.notes.trim() });
      showToast('Cliente actualizado');
    } else {
      await createCustomer({ name: m.name.trim(), phone: m.phone.trim(), address: m.address.trim(), notes: m.notes.trim() });
      showToast('Cliente registrado');
    }
    closeModal();
  },
  custOpenDetail(el) { openModal({ type: 'customerDetail', id: el.dataset.id }); },

  // -- selector de cliente para ligar a una cuenta/mesa ------------------
  custPickOpen(el) { openModal({ type: 'custPicker', accountId: el.dataset.id, search: '', qName: '', qPhone: '' }); },
  custPickSearch(el) { if (ui.modal) ui.modal.search = el.value; requestRender(); },
  async custPickChoose(el) {
    const m = ui.modal;
    await assignAccountCustomer(m.accountId, el.dataset.cid);
    showToast('Cliente vinculado a la cuenta');
    closeModal();
  },
  async custPickClear() {
    const m = ui.modal;
    await assignAccountCustomer(m.accountId, null);
    showToast('Cliente desvinculado');
    closeModal();
  },
  custPickNewField(el) { if (ui.modal) ui.modal[el.dataset.f] = el.value; },
  async custPickCreateAssign() {
    const m = ui.modal;
    if (!m.qName || !m.qName.trim()) { showToast('Escribe un nombre', 'danger'); return; }
    const id = await createCustomer({ name: m.qName.trim(), phone: (m.qPhone || '').trim() });
    await assignAccountCustomer(m.accountId, id);
    showToast('Cliente creado y vinculado');
    closeModal();
  },
});

registerModal('customerForm', (m) => ({
  title: m.id ? 'Editar cliente' : 'Nuevo cliente',
  body: `
    <label class="field">Nombre<input class="input" value="${escapeHtml(m.name)}" data-oninput="custFormField" data-f="name" data-onenter="custFormSubmit"></label>
    <label class="field">Teléfono<input class="input" value="${escapeHtml(m.phone)}" data-oninput="custFormField" data-f="phone"></label>
    <label class="field">Dirección<input class="input" value="${escapeHtml(m.address)}" data-oninput="custFormField" data-f="address"></label>
    <label class="field">Notas<textarea class="input" data-oninput="custFormField" data-f="notes">${escapeHtml(m.notes)}</textarea></label>
  `,
  foot: `<button class="btn ghost" data-action="closeModal">Cancelar</button><button class="btn primary" data-action="custFormSubmit">Guardar</button>`,
}));

registerModal('customerDetail', (m) => {
  const c = store.get('customers', m.id);
  if (!c) return { title: 'Cliente', body: '' };
  const stats = customerStats(c.id);
  return {
    wide: true,
    title: `${c.name} ${c.registrationNumber ? `· <span class="muted" style="font-weight:500;font-size:14px">${escapeHtml(c.registrationNumber)}</span>` : ''}`,
    body: `
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="kpi"><div class="kpi-label">Consumo total</div><div class="kpi-value num" style="font-size:19px">${money(stats.totalConsumed)}</div></div>
        <div class="kpi"><div class="kpi-label">Abonado</div><div class="kpi-value num" style="font-size:19px">${money(stats.totalPaid)}</div></div>
        <div class="kpi"><div class="kpi-label">Saldo pendiente</div><div class="kpi-value num" style="font-size:19px;color:${stats.balance>0?'var(--danger)':'inherit'}">${money(stats.balance)}</div></div>
      </div>
      <div class="small muted col" style="gap:2px">
        <div>${escapeHtml(c.phone || 'Sin teléfono registrado')}</div>
        <div>${c.address ? escapeHtml(c.address) : 'Sin dirección registrada'}</div>
        ${c.notes ? `<div>${escapeHtml(c.notes)}</div>` : ''}
      </div>
      <div class="section-title mt-12">Historial de cuentas</div>
      ${stats.accounts.length ? tableWrap(`
        <thead><tr><th>Fecha</th><th>Total</th><th>Saldo</th><th>Estado</th><th></th></tr></thead>
        <tbody>${stats.accounts.sort((a,b)=>new Date(b.openedAt)-new Date(a.openedAt)).map(a => `<tr>
          <td class="small">${fmtDateTime(a.openedAt)}</td>
          <td class="num">${money(a.total)}</td>
          <td class="num" style="color:${a.balance>0?'var(--danger)':'inherit'}">${money(a.balance)}</td>
          <td>${a.status}</td>
          <td><button class="btn sm" data-action="accOpenDetail" data-id="${a.id}">Ver</button></td>
        </tr>`).join('')}</tbody>
      `) : `<div class="small muted">Sin cuentas todavía</div>`}
      <div class="section-title mt-12">Abonos y pagos</div>
      ${stats.payments.length ? tableWrap(`
        <thead><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Mesa/Cuenta</th></tr></thead>
        <tbody>${stats.payments.map(p => `<tr>
          <td class="small">${fmtDateTime(p.date)}</td>
          <td class="num">${money(p.amount)}</td>
          <td class="small">${escapeHtml(PAYMENT_LABEL[p.method] || p.method)}</td>
          <td class="small muted">${escapeHtml(p.tableLabel || '—')}</td>
        </tr>`).join('')}</tbody>
      `) : `<div class="small muted">Sin abonos registrados todavía</div>`}
    `,
    foot: `<button class="btn ghost" data-action="closeModal">Cerrar</button><button class="btn" data-action="custEditOpen" data-id="${c.id}">${icon('edit','ic')} Editar ficha</button>`,
  };
});

registerModal('custPicker', (m) => {
  const account = store.get('accounts', m.accountId);
  const search = (m.search || '').trim().toLowerCase();
  const matches = search
    ? store.data.customers.filter(c =>
        c.name.toLowerCase().includes(search) ||
        (c.phone || '').toLowerCase().includes(search) ||
        (c.registrationNumber || '').toLowerCase().includes(search))
      .slice(0, 12)
    : [];
  return {
    title: 'Vincular cliente a la cuenta',
    body: `
      ${account && account.customerId ? `
        <div class="card card-pad flex between" style="align-items:center">
          <div><div class="bold small">${escapeHtml(store.get('customers', account.customerId)?.name || account.customerName)}</div><div class="small muted">Cliente vinculado actualmente</div></div>
          <button class="btn sm danger" data-action="custPickClear">Quitar vínculo</button>
        </div>` : ''}
      <label class="field">Buscar cliente (nombre, teléfono o folio)
        <input class="input" placeholder="Ej. José, 555…, C-00001" value="${escapeHtml(m.search || '')}" data-oninput="custPickSearch" autofocus>
      </label>
      ${search ? (matches.length ? tableWrap(`
        <thead><tr><th>Cliente</th><th>Folio</th><th>Teléfono</th><th></th></tr></thead>
        <tbody>${matches.map(c => `<tr>
          <td class="bold small">${escapeHtml(c.name)}</td>
          <td class="small muted">${escapeHtml(c.registrationNumber || '—')}</td>
          <td class="small muted">${escapeHtml(c.phone || '—')}</td>
          <td><button class="btn sm primary" data-action="custPickChoose" data-cid="${c.id}">Elegir</button></td>
        </tr>`).join('')}</tbody>
      `) : `<div class="small muted">Sin coincidencias.</div>`) : ''}
      <hr class="sep">
      <div class="small bold">O registra uno nuevo</div>
      <div class="field-row">
        <input class="input" placeholder="Nombre" value="${escapeHtml(m.qName || '')}" data-oninput="custPickNewField" data-f="qName">
        <input class="input" placeholder="Teléfono" value="${escapeHtml(m.qPhone || '')}" data-oninput="custPickNewField" data-f="qPhone">
        <button class="btn" data-action="custPickCreateAssign">Crear y vincular</button>
      </div>
    `,
    foot: `<button class="btn ghost" data-action="closeModal">Cerrar</button>`,
  };
});
