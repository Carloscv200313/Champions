// ============================================================================
// views/orders.js — "Mis mesas": pantalla del mesero (y también accesible
// para cajero/admin) para levantar pedidos y cobrar directo desde el
// celular. Escribe sobre las mismas "cuentas abiertas" que el módulo de
// Cuentas, ligadas 1 a 1 con un roster fijo de mesas numeradas.
// ============================================================================
import { store } from '../db.js';
import {
  ui, session, requestRender, showToast, openModal, closeModal, cartTotals,
  addItemsToAccount, requestAccountPayment, openTable, addTable, removeTable,
} from '../state.js';
import { registerActions } from '../actions.js';
import { registerRoute } from '../routes.js';
import { registerModal } from '../modals.js';
import { layout, pill, emptyState } from '../ui.js';
import { icon } from '../icons.js';
import {
  money, CATEGORIES, isOutOfStock, escapeHtml, sum, AUTH_ROLES,
} from '../helpers.js';
import { renderCheckout, renderPaid } from './checkout.js';

const CAT_ICON = {
  cerveza: 'cup', tequila: 'bottle', ron: 'bottle', whisky: 'bottle', vodka: 'bottle', mezcal: 'bottle',
  preparados: 'glass', cocteles: 'glass', shots: 'shot', refrescos: 'soda', agua: 'droplet',
  alimentos: 'food', otros: 'dots',
};

function sellableItems() {
  const products = store.data.products.filter(p => p.active !== false && p.sellable !== false).map(p => ({
    kind: 'product', id: p.id, name: p.name, category: p.category, price: p.price,
    favorite: !!p.favorite, out: isOutOfStock(p),
  }));
  const recipes = store.data.recipes.filter(r => r.active !== false).map(r => {
    const out = (r.ingredients || []).some(ing => {
      const p = store.data.products.find(pp => pp.id === ing.productId);
      return !p || (p.stock || 0) < ing.qty;
    });
    return { kind: 'recipe', id: r.id, name: r.name, category: r.category, price: r.price, favorite: !!r.favorite, out };
  });
  return [...products, ...recipes];
}

function statusPill(s) {
  if (s === 'abierta') return pill('Abierta', 'info');
  if (s === 'pendiente') return pill('Con pago parcial', 'warn');
  return pill(s, 'neutral');
}

function render() {
  const account = ui.orders.accountId ? store.get('accounts', ui.orders.accountId) : null;
  if (account && ui.orders.view === 'paid') return layout(renderPaid(account), { title: '', fullBleed: true });
  if (account && ui.orders.view === 'checkout') return layout(renderCheckout(account), { title: '', fullBleed: true });
  if (account && ui.orders.view === 'add') return layout(renderAdd(account), { title: '', fullBleed: true });
  if (account && ui.orders.view === 'summary') return layout(renderSummary(account), { title: '', fullBleed: true });
  return renderMesas();
}

function renderMesas() {
  const tables = [...store.data.tables].sort((a, b) => (a.number||0) - (b.number||0));
  const canManage = AUTH_ROLES.has(session.currentUser?.role);
  const content = `
    <div class="order-wrap">
      ${tables.length ? `<div class="mesas-grid">
        ${tables.map(t => {
          const account = t.accountId ? store.get('accounts', t.accountId) : null;
          const occupied = account && account.status !== 'cerrada';
          return `
          <button class="mesa-card ${occupied ? 'occupied' : ''}" data-action="ordOpenMesa" data-id="${t.id}">
            <div class="mesa-card-name">${escapeHtml(t.label)}</div>
            ${occupied
              ? `<div class="mesa-card-total num">${money(account.total)}</div><div class="mesa-card-status">${sum(account.items,i=>i.qty)} producto${sum(account.items,i=>i.qty)===1?'':'s'}${account.paymentRequested ? ' · ' + pill('Pidió la cuenta','danger') : ''}</div>`
              : `<div class="mesa-card-libre">Libre</div>`}
          </button>`;
        }).join('')}
        ${canManage ? `<button class="mesa-card" style="align-items:center;justify-content:center;color:var(--text-muted)" data-action="ordAddTable">${icon('plus','ic')} Agregar mesa</button>` : ''}
      </div>` : emptyState('table', 'Todavía no hay mesas configuradas', canManage ? 'Toca "Agregar mesa" para crear la primera.' : 'Pide a un administrador que configure las mesas.')}
    </div>
  `;
  return layout(content, { title: 'Mesas', sub: 'Toca una mesa para levantar el pedido o cobrar' });
}

function renderSummary(account) {
  const count = sum(account.items, i => i.qty);
  const rows = account.items.length ? account.items.map(i => `
    <div class="mesa-summary-row">
      <span><span class="qty">${i.qty}×</span>${escapeHtml(i.name)}${i.cortesia ? ` ${pill('Cortesía','good')}` : ''}</span>
      <span class="num">${money(i.cortesia ? 0 : i.unitPrice * i.qty - (i.discount || 0))}</span>
    </div>`).join('') : `<div class="small muted" style="padding:20px 0;text-align:center">Todavía no se ha agregado nada a esta mesa.</div>`;

  const content = `
    <div class="order-main order-wrap">
      <div class="order-table-head">
        <button class="link-btn flex" style="gap:4px" data-action="ordBackToMesas">${icon('chevronLeft','ic')} Volver a mesas</button>
        <div class="flex between wrap mt-8" style="gap:10px">
          <div class="page-title" style="font-size:22px">${escapeHtml(account.customerName)}</div>
          ${statusPill(account.status)}
        </div>
        <button class="link-btn flex mt-8" style="gap:4px" data-action="custPickOpen" data-id="${account.id}">
          ${icon('customers','ic')} ${account.customerId ? escapeHtml(store.get('customers', account.customerId)?.name || 'Cliente vinculado') : 'Vincular a un cliente de la base'}
        </button>
      </div>
      <div class="card card-pad mt-16">
        <div class="mesa-summary-list">${rows}</div>
      </div>
      <div class="mesa-summary-total">
        <div class="mesa-summary-total-label">Total</div>
        <div class="mesa-summary-total-value num">${money(account.total)}</div>
      </div>
      <div class="mesa-summary-actions">
        <button class="btn lg block" data-action="ordGoAdd">${icon('plus','ic')} Agregar productos</button>
        <button class="btn primary lg block" data-action="ordGoCheckout" ${!count || account.balance<=0?'disabled':''}>${icon('banknote','ic')} Cobrar</button>
      </div>
      ${account.balance > 0 ? `
      <button class="link-btn mt-16" data-action="ordRequestPayment" ${account.paymentRequested ? 'disabled' : ''}>
        ${account.paymentRequested ? 'Ya avisaste a caja · esperando cobro' : 'Prefiero avisar a caja en vez de cobrar yo'}
      </button>` : ''}
      <div style="height:24px"></div>
    </div>
  `;
  return content;
}

function renderAdd(account) {
  const items = sellableItems();
  const search = ui.orders.search.trim().toLowerCase();
  const showFav = ui.orders.category === 'favoritos';
  let visible;
  if (search) visible = items.filter(i => i.name.toLowerCase().includes(search));
  else if (showFav) visible = items.filter(i => i.favorite);
  else visible = items.filter(i => i.category === ui.orders.category);
  const hasFavorites = items.some(i => i.favorite);

  const cart = ui.orders.cart;
  const totals = cartTotals(cart);

  const catTabs = `
    <div class="pos-cats">
      ${hasFavorites ? `<button class="pos-cat-btn ${showFav ? 'active' : ''}" data-action="ordSetCategory" data-cat="favoritos">${icon('star','ic')} Favoritos</button>` : ''}
      ${CATEGORIES.map(c => `<button class="pos-cat-btn ${!showFav && ui.orders.category === c.id ? 'active' : ''}" data-action="ordSetCategory" data-cat="${c.id}">${c.label}</button>`).join('')}
    </div>`;

  const grid = `
    <div class="pos-grid">
      ${visible.map(i => `
        <button class="pos-item order-item ${i.out ? 'out' : ''}" data-action="ordPickItem" data-kind="${i.kind}" data-id="${i.id}" ${i.out ? 'title="Sin existencia suficiente"' : ''}>
          ${i.favorite ? `<span class="pos-item-star">${icon('starFilled','ic')}</span>` : ''}
          ${icon(CAT_ICON[i.category] || 'dots', 'ic')}
          <div>
            <div class="pos-item-name">${escapeHtml(i.name)}</div>
            <div class="pos-item-price num">${money(i.price)}</div>
          </div>
        </button>`).join('')}
      ${!visible.length ? `<div class="empty" style="grid-column:1/-1;padding:40px 10px">${icon('orders')}<div>No hay productos aquí</div></div>` : ''}
    </div>`;

  const cartList = cart.length ? `
    <div class="section-title mt-16 mb-8">Este pedido</div>
    <div class="col" style="gap:2px">
      ${cart.map((l, idx) => `
        <div class="cart-line">
          <div class="cart-line-main">
            <div class="cart-line-name">${escapeHtml(l.name)}</div>
            <div class="cart-line-price num">${money(l.unitPrice)} c/u</div>
          </div>
          <div class="qty-stepper">
            <button class="qty-btn" data-action="ordQtyDec" data-idx="${idx}">${icon('minus','ic')}</button>
            <span class="qty-val num">${l.qty}</span>
            <button class="qty-btn" data-action="ordQtyInc" data-idx="${idx}">${icon('plus','ic')}</button>
          </div>
        </div>`).join('')}
    </div>` : '';

  const content = `
    <div class="order-main order-wrap">
      <div class="order-table-head">
        <button class="link-btn flex" style="gap:4px" data-action="ordBackToSummaryDiscard">${icon('chevronLeft','ic')} ${escapeHtml(account.customerName)}</button>
        <div class="search-wrap mt-16">
          ${icon('search')}
          <input id="ordSearch" class="input" placeholder="Buscar producto…" value="${escapeHtml(ui.orders.search)}" data-oninput="ordSearch">
        </div>
      </div>
      ${catTabs}
      ${grid}
      ${cartList}
      <div style="height:90px"></div>
    </div>
  `;

  const sendbar = `
    <div class="order-sendbar">
      <div class="order-sendbar-inner">
        <div class="col" style="gap:0">
          <span class="tiny muted">Total de la mesa</span>
          <span class="bold num" style="font-size:19px">${money(account.total + totals.total)}</span>
          ${cart.length ? `<span class="tiny muted">+ ${money(totals.total)} nuevo · ${sum(cart,i=>i.qty)} artículos por enviar</span>` : ''}
        </div>
        <button class="btn primary lg" data-action="ordSend" ${!cart.length ? 'disabled' : ''}>${icon('check','ic')} Enviar pedido</button>
      </div>
    </div>`;

  return content + sendbar;
}

registerRoute('orders', render);

function findAddedLine(kind, id) {
  return ui.orders.cart.find(l => l.kind === kind && l.refId === id);
}

registerActions({
  async ordOpenMesa(el) {
    const accountId = await openTable(el.dataset.id);
    if (!accountId) return;
    const account = store.get('accounts', accountId);
    ui.orders.accountId = accountId;
    ui.orders.cart = [];
    ui.orders.category = 'cerveza';
    ui.orders.search = '';
    ui.orders.view = (account && account.items.length) ? 'summary' : 'add';
    requestRender();
  },
  async ordAddTable() {
    await addTable();
    showToast('Mesa agregada');
    requestRender();
  },
  async ordRemoveTable(el) {
    await removeTable(el.dataset.id);
    requestRender();
  },
  ordBackToMesas() {
    ui.orders.view = 'mesas';
    ui.orders.accountId = null;
    ui.orders.cart = [];
    ui.checkout = null;
    requestRender();
  },
  ordGoAdd() { ui.orders.view = 'add'; requestRender(); },
  ordBackToSummaryDiscard() {
    if (ui.orders.cart.length && !confirm('Tienes productos sin enviar, ¿salir de todas formas?')) return;
    ui.orders.cart = [];
    ui.orders.view = 'summary';
    requestRender();
  },
  ordSetCategory(el) { ui.orders.category = el.dataset.cat; ui.orders.search = ''; requestRender(); },
  ordSearch(el) { ui.orders.search = el.value; requestRender(); },
  ordPickItem(el) {
    const kind = el.dataset.kind, id = el.dataset.id;
    const item = sellableItems().find(i => i.kind === kind && i.id === id);
    if (!item) return;
    if (item.out) showToast('Existencia insuficiente — se agregará de todas formas', 'danger');
    openModal({ type: 'qtyPick', kind, id, name: item.name, price: item.price, qty: 1 });
  },
  qtyPickInc() { if (ui.modal) { ui.modal.qty += 1; requestRender(); } },
  qtyPickDec() { if (ui.modal && ui.modal.qty > 1) { ui.modal.qty -= 1; requestRender(); } },
  qtyPickAdd() {
    const m = ui.modal;
    if (!m) return;
    const existing = findAddedLine(m.kind, m.id);
    if (existing) existing.qty += m.qty;
    else ui.orders.cart.push({ kind: m.kind, refId: m.id, name: m.name, qty: m.qty, unitPrice: m.price, discount: 0, cortesia: false, note: '' });
    closeModal();
    showToast(`${m.name} agregado`);
    requestRender();
  },
  ordQtyInc(el) { const i = +el.dataset.idx; if (ui.orders.cart[i]) { ui.orders.cart[i].qty += 1; requestRender(); } },
  ordQtyDec(el) {
    const i = +el.dataset.idx;
    if (!ui.orders.cart[i]) return;
    ui.orders.cart[i].qty -= 1;
    if (ui.orders.cart[i].qty <= 0) ui.orders.cart.splice(i, 1);
    requestRender();
  },
  async ordSend() {
    if (!ui.orders.cart.length || !ui.orders.accountId) return;
    const cartSnapshot = ui.orders.cart.map(l => ({ ...l }));
    await addItemsToAccount(ui.orders.accountId, cartSnapshot);
    ui.orders.cart = [];
    ui.orders.view = 'summary';
    showToast('Pedido enviado a la mesa');
    requestRender();
  },
  async ordRequestPayment() {
    if (!ui.orders.accountId) return;
    await requestAccountPayment(ui.orders.accountId);
    showToast('Se avisó a caja que la mesa quiere pagar');
    requestRender();
  },
});

registerModal('qtyPick', (m) => ({
  title: escapeHtml(m.name),
  body: `
    <div class="col" style="align-items:center;gap:14px;padding:10px 0">
      <div class="num muted">${money(m.price)} c/u</div>
      <div class="qty-stepper" style="gap:18px">
        <button class="qty-btn" style="width:44px;height:44px;font-size:20px" data-action="qtyPickDec">${icon('minus','ic')}</button>
        <span class="num bold" style="font-size:26px;min-width:36px;text-align:center">${m.qty}</span>
        <button class="qty-btn" style="width:44px;height:44px;font-size:20px" data-action="qtyPickInc">${icon('plus','ic')}</button>
      </div>
      <div class="num bold" style="font-size:16px">Subtotal: ${money(m.price * m.qty)}</div>
    </div>
  `,
  foot: `<button class="btn ghost" data-action="closeModal">Cancelar</button><button class="btn primary block" data-action="qtyPickAdd">${icon('check','ic')} Agregar</button>`,
}));
