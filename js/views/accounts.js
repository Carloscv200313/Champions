// ============================================================================
// views/accounts.js — cuentas abiertas de clientes: agregar consumo, cerrar,
// pagos parciales / división de cuenta.
// ============================================================================
import { store } from '../db.js';
import {
  ui, requestRender, openModal, closeModal, showToast, openAccount, addPaymentToAccount, closeAccount,
  accountSplitByPerson,
} from '../state.js';
import { registerActions } from '../actions.js';
import { registerRoute } from '../routes.js';
import { registerModal } from '../modals.js';
import { layout, tableWrap, pill, emptyState } from '../ui.js';
import { icon } from '../icons.js';
import { money, escapeHtml, fmtDateTime, PAYMENT_METHODS, sum } from '../helpers.js';

if (!ui.accountsTab) ui.accountsTab = 'abierta';

function statusPill(s) {
  if (s === 'abierta') return pill('Abierta', 'info');
  if (s === 'pendiente') return pill('Pendiente', 'warn');
  return pill('Cerrada', 'good');
}

function tableLabelFor(a) {
  if (!a.tableId) return null;
  const t = store.get('tables', a.tableId);
  return t ? t.label : null;
}

function splitBadge(a) {
  if (a.splitType === 'equal') return pill(`${a.splitParts || 2} partes`, 'info');
  if (a.splitType === 'items') return pill('Por consumo', 'info');
  return '';
}

function splitSection(a) {
  if (!a.splitType || a.splitType === 'none') return '';
  if (a.splitType === 'equal') {
    const per = a.total / (a.splitParts || 2);
    return `
      <div class="card card-pad">
        <div class="flex between"><span class="bold small">${icon('split','ic')} Dividida en ${a.splitParts || 2} partes iguales</span></div>
        <div class="flex between mt-8"><span class="small muted">Monto por persona</span><span class="num bold">${money(per)}</span></div>
        <button class="btn sm mt-8" data-action="accSplitFill" data-amount="${per}">Prellenar 1 parte</button>
      </div>`;
  }
  const { rows, unassigned } = accountSplitByPerson(a);
  return `
    <div class="card card-pad">
      <div class="flex between"><span class="bold small">${icon('split','ic')} Por consumo</span></div>
      <div class="col mt-8" style="gap:6px">
        ${rows.map(r => `
          <div class="flex between small">
            <span>${escapeHtml(r.name)}</span>
            <span class="flex" style="gap:8px"><span class="num bold">${money(r.total)}</span><button class="btn sm" data-action="accSplitFill" data-amount="${r.total}">Cobrar</button></span>
          </div>`).join('') || '<div class="small muted">Sin personas asignadas todavía.</div>'}
        ${unassigned > 0.01 ? `<div class="flex between small muted"><span>Sin asignar</span><span class="num">${money(unassigned)}</span></div>` : ''}
      </div>
    </div>`;
}

function render() {
  const all = store.data.accounts;
  const tab = ui.accountsTab || 'abierta';
  const rows = all.filter(a => a.status === tab)
    .sort((a, b) => (b.paymentRequested?1:0) - (a.paymentRequested?1:0) || new Date(b.openedAt) - new Date(a.openedAt));
  const counts = { abierta: all.filter(a=>a.status==='abierta').length, pendiente: all.filter(a=>a.status==='pendiente').length, cerrada: all.filter(a=>a.status==='cerrada').length };

  const content = `
    <div class="tabs">
      <div class="tab ${tab==='abierta'?'active':''}" data-action="accSetTab" data-tab="abierta">Abiertas (${counts.abierta})</div>
      <div class="tab ${tab==='pendiente'?'active':''}" data-action="accSetTab" data-tab="pendiente">Pendientes (${counts.pendiente})</div>
      <div class="tab ${tab==='cerrada'?'active':''}" data-action="accSetTab" data-tab="cerrada">Cerradas (${counts.cerrada})</div>
    </div>
    ${rows.length ? tableWrap(`
      <thead><tr><th>Cliente</th><th>Mesa</th><th>Mesero</th><th>Productos</th><th>Total</th><th>Saldo</th><th>Estado</th><th>Abierta</th></tr></thead>
      <tbody>
        ${rows.map(a => `
          <tr class="clickable" data-action="accOpenDetail" data-id="${a.id}">
            <td class="bold">${escapeHtml(a.customerName)}</td>
            <td class="muted small">${escapeHtml(tableLabelFor(a) || '—')}</td>
            <td class="muted small">${escapeHtml(a.cashierName || '—')}</td>
            <td class="muted small">${sum(a.items,i=>i.qty)} artículos</td>
            <td class="num">${money(a.total)}</td>
            <td class="num ${a.balance>0?'':''}" style="color:${a.balance>0?'var(--danger)':'inherit'}">${money(a.balance)}</td>
            <td class="flex wrap" style="gap:5px">${statusPill(a.status)}${a.paymentRequested ? pill('Pidió la cuenta','danger') : ''}${splitBadge(a)}</td>
            <td class="muted small">${fmtDateTime(a.openedAt)}</td>
          </tr>`).join('')}
      </tbody>
    `) : emptyState('accounts', `Sin cuentas ${tab === 'abierta' ? 'abiertas' : tab === 'pendiente' ? 'pendientes' : 'cerradas'}`)}
  `;
  return layout(content, {
    title: 'Cuentas', sub: 'Cuentas de clientes, consumo y pagos',
    actions: `<button class="btn primary" data-action="accNewOpen">${icon('plus','ic')} Nueva cuenta</button>`,
  });
}
registerRoute('accounts', render);

registerActions({
  accSetTab(el) { ui.accountsTab = el.dataset.tab; requestRender(); },
  accNewOpen() { openModal({ type: 'newAccount', name: '' }); },
  accNewName(el) { if (ui.modal) ui.modal.name = el.value; },
  async accNewSubmit() {
    const m = ui.modal;
    if (!m.name.trim()) { showToast('Escribe un nombre', 'danger'); return; }
    const id = await openAccount({ customerName: m.name.trim() });
    closeModal();
    showToast('Cuenta abierta');
    ui.orders.accountId = id;
    ui.orders.cart = [];
    ui.orders.view = 'add';
    ui.route = 'orders';
    requestRender();
  },
  accOpenDetail(el) { openModal({ type: 'accountDetail', id: el.dataset.id, payMethod: 'efectivo', payAmount: '' }); },
  accAddItems(el) {
    ui.orders.accountId = el.dataset.id;
    ui.orders.cart = [];
    ui.orders.view = 'add';
    closeModal();
    ui.route = 'orders';
    requestRender();
  },
  accPayMethod(el) { if (ui.modal) ui.modal.payMethod = el.dataset.method; requestRender(); },
  accPayAmount(el) { if (ui.modal) ui.modal.payAmount = el.value; },
  async accPayPartial() {
    const m = ui.modal;
    const account = store.get('accounts', m.id);
    const amount = Number(m.payAmount) || 0;
    if (amount <= 0 || amount > account.balance + 0.01) { showToast('Monto inválido', 'danger'); return; }
    await addPaymentToAccount(m.id, { amount, method: m.payMethod });
    showToast('Pago registrado');
    requestRender();
  },
  async accCloseFull() {
    const m = ui.modal;
    await closeAccount(m.id, { method: m.payMethod });
    showToast('Cuenta cerrada');
    closeModal();
  },
  accSplitFill(el) {
    if (ui.modal) ui.modal.payAmount = el.dataset.amount;
    requestRender();
  },
});

registerModal('newAccount', (m) => ({
  title: 'Nueva cuenta',
  body: `<label class="field">Nombre del cliente
    <input id="newAccountName" class="input" placeholder="Ej. José, Mesa 4…" value="${escapeHtml(m.name)}" data-oninput="accNewName" data-onenter="accNewSubmit">
  </label>`,
  foot: `<button class="btn ghost" data-action="closeModal">Cancelar</button><button class="btn primary" data-action="accNewSubmit">Abrir e ir a Pedidos</button>`,
}));

registerModal('accountDetail', (m) => {
  const a = store.get('accounts', m.id);
  if (!a) return { title: 'Cuenta', body: '' };
  return {
    wide: true,
    title: `${a.customerName}`,
    body: `
      <div class="flex between wrap" style="gap:10px">
        <div class="flex wrap" style="gap:6px">${statusPill(a.status)}${a.paymentRequested ? pill('Pidió la cuenta','danger') : ''}${splitBadge(a)}</div>
        <span class="small muted">Abierta ${fmtDateTime(a.openedAt)}${a.closedAt ? ` · Cerrada ${fmtDateTime(a.closedAt)}` : ''}</span>
      </div>
      <div class="small muted">${tableLabelFor(a) ? `Mesa: <b>${escapeHtml(tableLabelFor(a))}</b> · ` : ''}Mesero: <b>${escapeHtml(a.cashierName || '—')}</b></div>
      <div class="card card-pad flex between" style="align-items:center">
        <div>
          <div class="small muted">Cliente</div>
          <div class="bold small">${a.customerId ? escapeHtml(store.get('customers', a.customerId)?.name || a.customerName) : 'Sin cliente vinculado'}</div>
        </div>
        <button class="btn sm" data-action="custPickOpen" data-id="${a.id}">${a.customerId ? 'Cambiar' : 'Vincular cliente'}</button>
      </div>
      ${tableWrap(`
        <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead>
        <tbody>
          ${a.items.map(i => `<tr><td>${escapeHtml(i.name)}${i.cortesia?' · <span class="pill good">Cortesía</span>':''}</td><td class="num">${i.qty}</td><td class="num">${money(i.unitPrice)}</td><td class="num">${money(i.cortesia?0:i.unitPrice*i.qty-(i.discount||0))}</td></tr>`).join('') || '<tr><td colspan="4" class="tbl-empty">Sin productos todavía</td></tr>'}
        </tbody>
      `)}
      <div class="col" style="gap:4px">
        <div class="totals-row"><span>Subtotal</span><span class="num">${money(a.subtotal)}</span></div>
        ${a.discountTotal ? `<div class="totals-row"><span>Descuentos</span><span class="num">-${money(a.discountTotal)}</span></div>` : ''}
        <div class="totals-row"><span>Pagado</span><span class="num">${money(a.paid||0)}</span></div>
        <div class="totals-row total"><span>Saldo</span><span class="num">${money(a.balance)}</span></div>
      </div>
      ${a.payments && a.payments.length ? `<div class="small"><b>Pagos:</b> ${a.payments.map(p=>`${money(p.amount)} (${p.method})`).join(', ')}</div>` : ''}
      ${splitSection(a)}
      ${a.status !== 'cerrada' ? `
      <hr class="sep">
      <div class="col" style="gap:10px">
        <div class="flex wrap" style="gap:6px">
          ${PAYMENT_METHODS.map(pm => `<button class="btn sm ${m.payMethod===pm.id?'primary':''}" data-action="accPayMethod" data-method="${pm.id}">${pm.label}</button>`).join('')}
        </div>
        <div class="field-row">
          <input class="input" type="number" placeholder="Monto de pago parcial" value="${m.payAmount}" data-oninput="accPayAmount">
          <button class="btn" data-action="accPayPartial">Registrar pago</button>
        </div>
      </div>` : ''}
    `,
    foot: a.status !== 'cerrada' ? `
      <button class="btn ghost" data-action="closeModal">Cerrar</button>
      <button class="btn" data-action="accAddItems" data-id="${a.id}">${icon('pos','ic')} Agregar productos</button>
      <button class="btn primary" data-action="accCloseFull">${icon('check','ic')} Cerrar cuenta (${money(a.balance)})</button>
    ` : `<button class="btn ghost" data-action="closeModal">Cerrar</button>`,
  };
});
