// ============================================================================
// views/checkout.js — pantalla de cobro: el mesero (o cajero) cobra la mesa
// ahí mismo, sin pasar por una caja aparte. Tres modalidades: una sola
// cuenta, dividir en partes, o que cada quien pague lo que consumió.
// Se monta como una sub-vista de "orders" (ui.orders.view === 'checkout' | 'paid').
// ============================================================================
import { store } from '../db.js';
import {
  ui, requestRender, showToast, closeModal,
  addPaymentToAccount, setAccountSplit, assignAccountItem, accountSplitByPerson,
  splitAmountsFor, setSplitAmounts,
} from '../state.js';
import { registerActions } from '../actions.js';
import { icon } from '../icons.js';
import { pill } from '../ui.js';
import { money, escapeHtml, PAYMENT_METHODS } from '../helpers.js';

function ensureCheckoutState(account) {
  if (!ui.checkout) ui.checkout = { mode: null, method: 'efectivo', amount: String(account.balance.toFixed(2)), newPersonName: '', partMethod: {}, personMethod: {} };
  return ui.checkout;
}

export function renderCheckout(account) {
  const c = ensureCheckoutState(account);
  if (!c.mode) return renderChoose(account, c);
  if (c.mode === 'una') return renderUna(account, c);
  if (c.mode === 'dividir') return renderDividir(account, c);
  if (c.mode === 'cadaquien') return renderCadaQuien(account, c);
  return renderChoose(account, c);
}

function checkoutShell(inner, { back } = {}) {
  return `
    <div class="order-main order-wrap">
      <div class="order-table-head">
        <button class="link-btn flex" style="gap:4px" data-action="${back || 'coBack'}">${icon('chevronLeft','ic')} Atrás</button>
      </div>
      <div class="checkout-wrap">${inner}</div>
    </div>`;
}

function renderChoose(account) {
  return checkoutShell(`
    <div class="checkout-total-label">Total</div>
    <div class="checkout-total-value num">${money(account.balance)}</div>
    <div class="small muted mb-16">¿Cómo desean pagar?</div>
    <button class="checkout-choice" data-action="coChooseMode" data-mode="una">
      <span>${icon('banknote','ic')} Una sola cuenta</span>${icon('chevronRight','ic')}
    </button>
    <button class="checkout-choice" data-action="coChooseMode" data-mode="dividir">
      <span>${icon('split','ic')} Dividir cuenta</span>${icon('chevronRight','ic')}
    </button>
    <button class="checkout-choice" data-action="coChooseMode" data-mode="cadaquien">
      <span>${icon('users','ic')} Cada persona paga lo suyo</span>${icon('chevronRight','ic')}
    </button>
  `, { back: 'ordBackToSummary' });
}

function renderUna(account, c) {
  const amount = Number(c.amount) || 0;
  const isPartial = amount > 0 && amount < account.balance - 0.01;
  return checkoutShell(`
    <div class="checkout-total-label">Total de la cuenta</div>
    <div class="checkout-total-value num" style="font-size:40px">${money(account.balance)}</div>
    <label class="field" style="text-align:left">Monto a cobrar
      <input class="input" type="number" min="0" step="0.5" value="${c.amount}" data-oninput="coAmountInput">
    </label>
    ${isPartial ? `<div class="small muted mt-8">Saldo después de este pago: <b class="num">${money(account.balance - amount)}</b> · quedará como <b>pago parcial</b></div>` : ''}
    <div class="checkout-methods">
      ${PAYMENT_METHODS.map(m => `<button class="checkout-method-btn ${c.method===m.id?'active':''}" data-action="coSetMethod" data-method="${m.id}">${m.label}</button>`).join('')}
    </div>
    <button class="btn primary xl block mt-8" data-action="coConfirmUna" ${amount<=0?'disabled':''}>${icon('check','ic')} Confirmar cobro</button>
  `);
}

function renderDividir(account, c) {
  const amounts = splitAmountsFor(account);
  const assigned = amounts.reduce((a, n) => a + (Number(n) || 0), 0);
  const mismatch = Math.abs(assigned - account.total) > 0.01;
  const quick = [2, 3, 4, 5];
  const isCustom = !quick.includes(account.splitParts);
  return checkoutShell(`
    <div class="checkout-total-label">Total a dividir</div>
    <div class="checkout-total-value num" style="font-size:40px">${money(account.total)}</div>
    <div class="split-parts-row">
      ${quick.map(n => `<button class="split-part-btn ${account.splitParts===n?'active':''}" data-action="coSetParts" data-parts="${n}">${n}</button>`).join('')}
      <button class="split-part-btn ${isCustom?'active':''}" data-action="coSetParts" data-parts="custom">···</button>
    </div>
    ${isCustom ? `<label class="field" style="max-width:160px;margin:0 auto 10px">Personalizado (personas)
      <input class="input" type="number" min="2" value="${account.splitParts||2}" data-oninput="coCustomParts">
    </label>` : ''}
    ${mismatch ? `<div class="small" style="color:var(--danger)">Ajusta los montos: asignado ${money(assigned)} de ${money(account.total)}</div>` : ''}
    <div class="col mt-16" style="text-align:left">
      ${amounts.map((amt, idx) => {
        const paid = !!(c.paidParts && c.paidParts[idx]);
        const method = (c.partMethod && c.partMethod[idx]) || 'efectivo';
        return `
        <div class="card card-pad mb-8">
          <div class="flex between mb-8"><span class="bold">Persona ${idx+1}</span>${paid ? pill('Pagado','good') : ''}</div>
          <div class="field-row">
            <input id="splitAmt-${idx}" class="input" type="number" min="0" step="0.5" value="${amt}" data-idx="${idx}" data-oninput="coPartAmount" ${paid?'disabled':''}>
            <select class="input" data-idx="${idx}" data-onchange="coPartMethod" ${paid?'disabled':''}>
              ${PAYMENT_METHODS.map(m => `<option value="${m.id}" ${method===m.id?'selected':''}>${m.label}</option>`).join('')}
            </select>
          </div>
          <button class="btn primary block mt-8" data-action="coPayPart" data-idx="${idx}" ${paid||mismatch?'disabled':''}>${paid?'Cobrado':'Cobrar'}</button>
        </div>`;
      }).join('')}
    </div>
  `);
}

function renderCadaQuien(account, c) {
  const people = account.splitPeople || [];
  const { rows, unassigned } = accountSplitByPerson(account);
  return checkoutShell(`
    <div class="checkout-total-label">Total de la cuenta</div>
    <div class="checkout-total-value num" style="font-size:40px">${money(account.total)}</div>
    <div class="field-row" style="text-align:left">
      <input class="input" placeholder="Nombre de la persona" value="${escapeHtml(c.newPersonName||'')}" data-oninput="coAddPersonName" data-onenter="coAddPerson">
      <button class="btn" data-action="coAddPerson">Agregar</button>
    </div>
    ${people.length ? `<div class="flex wrap mt-8" style="gap:6px">
      ${people.map(p => `<span class="pill neutral">${escapeHtml(p)} <a data-action="coRemovePerson" data-name="${escapeHtml(p)}" style="cursor:pointer;margin-left:4px">✕</a></span>`).join('')}
    </div>` : `<div class="small muted mt-8">Agrega a las personas de la mesa.</div>`}
    ${account.items.length && people.length ? `
    <div class="col mt-16" style="gap:6px;text-align:left">
      ${account.items.map(i => `
        <div class="flex between small" style="gap:8px">
          <span>${i.qty}× ${escapeHtml(i.name)}</span>
          <select class="input" style="width:auto;padding:4px 8px" data-onchange="coAssignItem" data-item="${i.id}">
            <option value="">Sin asignar</option>
            ${people.map(p => `<option value="${escapeHtml(p)}" ${i.assignedTo===p?'selected':''}>${escapeHtml(p)}</option>`).join('')}
          </select>
        </div>`).join('')}
    </div>` : ''}
    ${unassigned > 0.01 ? `<div class="small mt-12" style="color:var(--danger)">Falta asignar ${money(unassigned)} en productos antes de poder cobrar.</div>` : ''}
    <div class="col mt-16" style="text-align:left">
      ${rows.map(r => {
        const paid = !!(c.paidPeople && c.paidPeople[r.name]);
        const method = (c.personMethod && c.personMethod[r.name]) || 'efectivo';
        return `
        <div class="card card-pad mb-8">
          <div class="flex between mb-8"><span class="bold">${escapeHtml(r.name)}</span><span class="num bold">${money(r.total)}</span>${paid ? pill('Pagado','good') : ''}</div>
          <select class="input" data-name="${escapeHtml(r.name)}" data-onchange="coPersonMethod" ${paid?'disabled':''}>
            ${PAYMENT_METHODS.map(m => `<option value="${m.id}" ${method===m.id?'selected':''}>${m.label}</option>`).join('')}
          </select>
          <button class="btn primary block mt-8" data-action="coPayPerson" data-name="${escapeHtml(r.name)}" ${paid||unassigned>0.01||r.total<=0?'disabled':''}>${paid?'Cobrado':`Cobrar ${money(r.total)}`}</button>
        </div>`;
      }).join('')}
    </div>
  `);
}

export function renderPaid(account) {
  const methods = [...new Set((account.payments||[]).map(p => p.method))];
  const methodLabel = methods.length === 1
    ? (PAYMENT_METHODS.find(m=>m.id===methods[0])||{}).label || methods[0]
    : (methods.length ? 'Varios métodos' : '—');
  const printTicket = `
    <div class="print-ticket">
      <div style="text-align:center;font-weight:800;font-size:15px">Champions</div>
      <div style="text-align:center;font-size:11px" class="muted">${new Date(account.closedAt||Date.now()).toLocaleString('es-MX')}</div>
      <hr class="sep">
      <div class="ticket-lines">
        ${account.items.map(i => `<div class="flex between"><span>${i.qty}× ${escapeHtml(i.name)}</span><span>${money(i.cortesia?0:i.unitPrice*i.qty-(i.discount||0))}</span></div>`).join('')}
      </div>
      <hr class="sep">
      <div class="flex between bold"><span>TOTAL</span><span>${money(account.total)}</span></div>
      <div class="small mt-8">Método: ${escapeHtml(methodLabel)}</div>
      <div class="tiny muted mt-16" style="text-align:center">¡Gracias por su visita!</div>
    </div>`;
  return `
    <div class="order-main order-wrap">
      <div class="paid-screen">
        <div class="paid-check">${icon('check')}</div>
        <div class="paid-title">CUENTA PAGADA</div>
        <div class="checkout-total-value num" style="font-size:36px;margin:6px 0">${money(account.total)}</div>
        <div class="small muted">Método: ${escapeHtml(methodLabel)}</div>
        <div class="col mt-24" style="width:100%;max-width:320px;gap:10px">
          <button class="btn primary lg block" data-action="coPrint">${icon('print','ic')} Imprimir ticket</button>
          <button class="btn block" data-action="ordBackToMesas">Volver a mesas</button>
        </div>
      </div>
      ${printTicket}
    </div>`;
}

registerActions({
  ordGoCheckout() {
    const account = store.get('accounts', ui.orders.accountId);
    if (!account) return;
    ui.checkout = { mode: null, method: 'efectivo', amount: String(account.balance.toFixed(2)), newPersonName: '', partMethod: {}, personMethod: {}, paidParts: {}, paidPeople: {} };
    ui.orders.view = 'checkout';
    requestRender();
  },
  ordBackToSummary() {
    ui.orders.view = 'summary';
    ui.checkout = null;
    requestRender();
  },
  ordBackToMesas() {
    ui.orders.view = 'mesas';
    ui.orders.accountId = null;
    ui.orders.cart = [];
    ui.checkout = null;
    requestRender();
  },
  coBack() {
    if (ui.checkout && ui.checkout.mode) { ui.checkout.mode = null; requestRender(); }
    else { ui.orders.view = 'summary'; ui.checkout = null; requestRender(); }
  },
  async coChooseMode(el) {
    const account = store.get('accounts', ui.orders.accountId);
    if (!account) return;
    const mode = el.dataset.mode;
    ui.checkout.mode = mode;
    if (mode === 'dividir' && (!account.splitType || account.splitType !== 'equal')) {
      await setAccountSplit(account.id, { splitType: 'equal', splitParts: account.splitParts || 2 });
    }
    if (mode === 'cadaquien' && account.splitType !== 'items') {
      await setAccountSplit(account.id, { splitType: 'items' });
    }
    requestRender();
  },
  coAmountInput(el) { if (ui.checkout) ui.checkout.amount = el.value; },
  coSetMethod(el) { if (ui.checkout) ui.checkout.method = el.dataset.method; requestRender(); },
  async coConfirmUna() {
    const account = store.get('accounts', ui.orders.accountId);
    if (!account || !ui.checkout) return;
    const amount = Number(ui.checkout.amount) || 0;
    if (amount <= 0 || amount > account.balance + 0.01) { showToast('Monto inválido', 'danger'); return; }
    await addPaymentToAccount(account.id, { amount, method: ui.checkout.method });
    const updated = store.get('accounts', account.id);
    if (updated && updated.balance <= 0.001) { ui.orders.view = 'paid'; showToast('Cuenta pagada'); }
    else { showToast('Pago parcial registrado'); ui.checkout.amount = String((updated?.balance||0).toFixed(2)); }
    requestRender();
  },
  async coSetParts(el) {
    const account = store.get('accounts', ui.orders.accountId);
    if (!account) return;
    if (el.dataset.parts === 'custom') { requestRender(); return; }
    const n = Number(el.dataset.parts);
    await setAccountSplit(account.id, { splitType: 'equal', splitParts: n, splitAmounts: null });
    requestRender();
  },
  async coCustomParts(el) {
    const account = store.get('accounts', ui.orders.accountId);
    if (!account) return;
    const n = Math.max(2, Math.round(Number(el.value)) || 2);
    await setAccountSplit(account.id, { splitType: 'equal', splitParts: n, splitAmounts: null });
    requestRender();
  },
  async coPartAmount(el) {
    const account = store.get('accounts', ui.orders.accountId);
    if (!account) return;
    const idx = +el.dataset.idx;
    const amounts = [...splitAmountsFor(account)];
    amounts[idx] = Number(el.value) || 0;
    await setSplitAmounts(account.id, amounts);
    requestRender();
  },
  coPartMethod(el) {
    if (!ui.checkout) return;
    ui.checkout.partMethod = { ...(ui.checkout.partMethod||{}), [+el.dataset.idx]: el.value };
    requestRender();
  },
  async coPayPart(el) {
    const account = store.get('accounts', ui.orders.accountId);
    if (!account || !ui.checkout) return;
    const idx = +el.dataset.idx;
    const amounts = splitAmountsFor(account);
    const assigned = amounts.reduce((a,n)=>a+(Number(n)||0),0);
    if (Math.abs(assigned - account.total) > 0.01) { showToast('Ajusta los montos antes de cobrar', 'danger'); return; }
    const amount = Number(amounts[idx]) || 0;
    if (amount <= 0) return;
    const method = (ui.checkout.partMethod && ui.checkout.partMethod[idx]) || 'efectivo';
    await addPaymentToAccount(account.id, { amount, method });
    ui.checkout.paidParts = { ...(ui.checkout.paidParts||{}), [idx]: true };
    const updated = store.get('accounts', account.id);
    if (updated && updated.balance <= 0.001) { ui.orders.view = 'paid'; showToast('Cuenta pagada'); }
    requestRender();
  },
  coAddPersonName(el) { if (ui.checkout) ui.checkout.newPersonName = el.value; },
  async coAddPerson() {
    const account = store.get('accounts', ui.orders.accountId);
    if (!account || !ui.checkout) return;
    const name = (ui.checkout.newPersonName || '').trim();
    if (!name) return;
    if ((account.splitPeople||[]).includes(name)) { showToast('Ya agregaste a esa persona', 'danger'); return; }
    await setAccountSplit(account.id, { splitPeople: [...(account.splitPeople||[]), name] });
    ui.checkout.newPersonName = '';
    requestRender();
  },
  async coRemovePerson(el) {
    const account = store.get('accounts', ui.orders.accountId);
    if (!account) return;
    await setAccountSplit(account.id, { splitPeople: (account.splitPeople||[]).filter(p => p !== el.dataset.name) });
    requestRender();
  },
  async coAssignItem(el) {
    const account = store.get('accounts', ui.orders.accountId);
    if (!account) return;
    await assignAccountItem(account.id, el.dataset.item, el.value || null);
    requestRender();
  },
  coPersonMethod(el) {
    if (!ui.checkout) return;
    ui.checkout.personMethod = { ...(ui.checkout.personMethod||{}), [el.dataset.name]: el.value };
    requestRender();
  },
  async coPayPerson(el) {
    const account = store.get('accounts', ui.orders.accountId);
    if (!account || !ui.checkout) return;
    const name = el.dataset.name;
    const { rows, unassigned } = accountSplitByPerson(account);
    if (unassigned > 0.01) { showToast('Asigna todos los productos primero', 'danger'); return; }
    const row = rows.find(r => r.name === name);
    if (!row || row.total <= 0) return;
    const method = (ui.checkout.personMethod && ui.checkout.personMethod[name]) || 'efectivo';
    await addPaymentToAccount(account.id, { amount: row.total, method });
    ui.checkout.paidPeople = { ...(ui.checkout.paidPeople||{}), [name]: true };
    const updated = store.get('accounts', account.id);
    if (updated && updated.balance <= 0.001) { ui.orders.view = 'paid'; showToast('Cuenta pagada'); }
    requestRender();
  },
  coPrint() { window.print(); },
});
