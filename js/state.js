// ============================================================================
// state.js — sesión, estado de UI y lógica de negocio sobre el store.
// Todas las operaciones que escriben datos (vender, comprar, conciliar,
// abrir/cerrar caja, etc.) viven aquí para que las vistas sólo llamen
// funciones con nombre de negocio, nunca toquen `store` directamente para
// escribir.
// ============================================================================

import { store } from './db.js';
import {
  uid, ticketNumber, customerFolio, sum, toBaseUnits, ADJUSTMENT_REASONS, LEGACY_CATEGORY_IDS, migrateCategoryId,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------
export const session = { currentUser: null };

export function login(user) { session.currentUser = user; }
export function logout() {
  session.currentUser = null;
  ui.route = 'login';
  // Limpia estado transitorio de pantalla para que el siguiente usuario que
  // entre a este mismo dispositivo no herede una mesa o carrito ajeno.
  ui.pos.cart = []; ui.pos.accountId = null; ui.pos.lastSale = null;
  ui.orders.view = 'mesas'; ui.orders.accountId = null; ui.orders.cart = [];
  ui.orders.category = 'cerveza'; ui.orders.search = '';
  ui.checkout = null;
}
export function currentUserCan(roleSet) {
  return !!session.currentUser && roleSet.has(session.currentUser.role);
}

// ---------------------------------------------------------------------------
// Estado de UI (transitorio, no persiste)
// ---------------------------------------------------------------------------
export const ui = {
  route: 'login',
  modal: null,        // { type, ...props }
  toast: null,         // { text, tone }
  sidebarOpen: false,
  login: { pickedId: null, pin: '' },
  pos: {
    category: 'cerveza',
    search: '',
    cart: [],           // [{kind,refId,name,qty,unitPrice,discount,cortesia,note}]
    accountId: null,     // si se está cargando a una cuenta
    paymentMethod: 'efectivo',
    lastSale: null,      // items de la última venta de este cajero (repetir)
    lineEditIndex: null,
  },
  orders: {
    view: 'mesas',        // 'mesas' (grid) | 'summary' (itemizado+total) | 'add' (agregar productos)
    accountId: null,
    category: 'cerveza',
    search: '',
    cart: [],           // pedido en curso, se envía con addItemsToAccount
  },
  // Pantalla de cobro (una sola cuenta / dividir / cada quien lo suyo)
  checkout: null,       // { accountId, step, mode, ... }
};

let toastTimer = null;
export function showToast(text, tone = 'default') {
  ui.toast = { text, tone };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast = null; requestRender(); }, 2600);
  requestRender();
}

let _render = () => {};
export function bindRenderer(fn) { _render = fn; }
export function requestRender() { _render(); }

export function openModal(modal) { ui.modal = modal; requestRender(); }
export function closeModal() { ui.modal = null; requestRender(); }

// Pide autorización (PIN de un rol con permiso) antes de ejecutar `onAuthorized`.
// Si el usuario actual ya tiene permiso, ejecuta directo.
export function withAuthorization({ roles, reason, onAuthorized }) {
  if (currentUserCan(roles)) { onAuthorized(session.currentUser); return; }
  openModal({
    type: 'authorize',
    reason,
    roles,
    onAuthorized: (authUser) => { closeModal(); onAuthorized(authUser); },
  });
}

// ---------------------------------------------------------------------------
// Auditoría
// ---------------------------------------------------------------------------
export function logAudit(action, details, entity, entityId) {
  const u = session.currentUser;
  return store.add('auditLogs', {
    date: new Date().toISOString(),
    userId: u?.id || null,
    userName: u?.name || 'Sistema',
    action, details, entity: entity || null, entityId: entityId || null,
  });
}

// ---------------------------------------------------------------------------
// Inventario — movimientos
// ---------------------------------------------------------------------------
export async function recordMovement({ productId, qty, type, refType, refId, reason, eventId }) {
  const product = store.get('products', productId);
  if (!product) return;
  const newStock = (product.stock || 0) + qty;
  await store.update('products', productId, { stock: newStock });
  await store.add('movements', {
    date: new Date().toISOString(),
    productId, productName: product.name, qty, type,
    refType: refType || null, refId: refId || null,
    reason: reason || null, eventId: eventId || null,
    user: session.currentUser?.name || 'Sistema',
  });
}

// Descuenta insumos de una receta al venderse `qty` unidades de ella.
async function consumeRecipe(recipe, qty, ctx) {
  for (const ing of recipe.ingredients || []) {
    await recordMovement({
      productId: ing.productId,
      qty: -(ing.qty * qty),
      type: 'venta',
      refType: 'order', refId: ctx.refId,
      eventId: ctx.eventId,
    });
  }
}

// ---------------------------------------------------------------------------
// Catálogo — productos y recetas
// ---------------------------------------------------------------------------
export async function createProduct(data) {
  const id = await store.add('products', {
    name: data.name, category: data.category, saleUnit: data.saleUnit,
    price: Number(data.price) || 0, costPerBaseUnit: Number(data.costPerBaseUnit) || 0,
    stock: Number(data.stock) || 0, lowStockThreshold: data.lowStockThreshold != null ? Number(data.lowStockThreshold) : null,
    bottleSizeMl: data.bottleSizeMl ? Number(data.bottleSizeMl) : null,
    caseSize: data.caseSize ? Number(data.caseSize) : null,
    favorite: !!data.favorite, sellable: data.sellable !== false, active: true,
  });
  await logAudit('Producto creado', data.name, 'product', id);
  return id;
}
export async function updateProduct(id, patch) {
  await store.update('products', id, patch);
  await logAudit('Producto modificado', Object.keys(patch).join(', '), 'product', id);
}
export async function setProductActive(id, active) {
  await store.update('products', id, { active });
  await logAudit(active ? 'Producto reactivado' : 'Producto desactivado', store.get('products', id)?.name, 'product', id);
}

export async function createRecipe(data) {
  const id = await store.add('recipes', {
    name: data.name, category: data.category, price: Number(data.price) || 0,
    ingredients: data.ingredients || [], favorite: !!data.favorite, active: true,
  });
  await logAudit('Receta creada', data.name, 'recipe', id);
  return id;
}
export async function updateRecipe(id, patch) {
  await store.update('recipes', id, patch);
  await logAudit('Receta modificada', Object.keys(patch).join(', '), 'recipe', id);
}

// Migra catálogos viejos: "Cervezas" → "Cerveza", y "Destilados" se reparte en
// tequila/ron/whisky/vodka/mezcal según el nombre del producto. Es idempotente
// — una vez migrado un producto ya no vuelve a coincidir con LEGACY_CATEGORY_IDS.
let _migrating = false;
export async function migrateLegacyCategories() {
  if (_migrating) return;
  _migrating = true;
  try {
    for (const p of store.data.products) {
      if (LEGACY_CATEGORY_IDS.has(p.category)) {
        await store.update('products', p.id, { category: migrateCategoryId(p.category, p.name) });
      }
    }
    for (const r of store.data.recipes) {
      if (LEGACY_CATEGORY_IDS.has(r.category)) {
        await store.update('recipes', r.id, { category: migrateCategoryId(r.category, r.name) });
      }
    }
  } finally {
    _migrating = false;
  }
}

// ---------------------------------------------------------------------------
// Compras
// ---------------------------------------------------------------------------
export async function registerPurchase({ supplier, items, eventId }) {
  let total = 0;
  const lineItems = [];
  for (const it of items) {
    const product = store.get('products', it.productId);
    if (!product) continue;
    const baseQty = toBaseUnits(Number(it.qty), it.purchaseUnit, product);
    const totalCost = Number(it.unitCost) * Number(it.qty);
    total += totalCost;
    lineItems.push({
      productId: it.productId, name: product.name, qty: Number(it.qty),
      purchaseUnit: it.purchaseUnit, baseQty, unitCost: Number(it.unitCost), totalCost,
    });
    const newCost = baseQty > 0 ? totalCost / baseQty : product.costPerBaseUnit;
    await store.update('products', it.productId, { costPerBaseUnit: newCost });
    await recordMovement({
      productId: it.productId, qty: baseQty, type: 'compra',
      refType: 'purchase', refId: null, eventId,
    });
  }
  const id = await store.add('purchases', {
    date: new Date().toISOString(), supplier: supplier || 'Sin especificar',
    items: lineItems, total, registeredBy: session.currentUser?.name || 'Sistema', eventId: eventId || null,
  });
  await logAudit('Compra registrada', `${supplier || 'Proveedor'} · ${money2(total)}`, 'purchase', id);
  return id;
}
function money2(n) { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n); }

// ---------------------------------------------------------------------------
// Conciliación de inventario
// ---------------------------------------------------------------------------
export async function reconcileProduct({ productId, physical, reason, note, eventId }) {
  const product = store.get('products', productId);
  if (!product) return;
  const theoretical = product.stock || 0;
  const difference = physical - theoretical;
  const value = Math.abs(difference) * (product.costPerBaseUnit || 0);
  const id = await store.add('adjustments', {
    date: new Date().toISOString(), productId, productName: product.name,
    theoretical, physical, difference, valueDifference: value,
    reason: reason || 'Sin explicación', note: note || '', eventId: eventId || null,
    user: session.currentUser?.name || 'Sistema',
  });
  await store.update('products', productId, { stock: physical });
  await store.add('movements', {
    date: new Date().toISOString(), productId, productName: product.name,
    qty: difference, type: 'ajuste', refType: 'adjustment', refId: id,
    reason, eventId: eventId || null, user: session.currentUser?.name || 'Sistema',
  });
  await logAudit('Ajuste de inventario', `${product.name} · ${difference >= 0 ? '+' : ''}${difference} · ${reason}`, 'product', productId);
  return id;
}

// ---------------------------------------------------------------------------
// Ventas / ticket
// ---------------------------------------------------------------------------
export function cartLineTotal(line) {
  if (line.cortesia) return 0;
  const base = line.unitPrice * line.qty;
  return Math.max(0, base - (line.discount || 0));
}
export function cartTotals(cart) {
  const subtotal = sum(cart, l => l.unitPrice * l.qty);
  const discountTotal = sum(cart, l => (l.cortesia ? l.unitPrice * l.qty : (l.discount || 0)));
  const total = sum(cart, cartLineTotal);
  return { subtotal, discountTotal, total };
}

export async function cancelOrderItem(orderId, itemIndex, reason) {
  const order = store.get('orders', orderId);
  if (!order) return;
  const items = [...order.items];
  const [removed] = items.splice(itemIndex, 1);
  if (!removed) return;
  const totals = cartTotals(items);
  await store.update('orders', orderId, { items, ...totals });
  // revertir inventario
  if (removed.kind === 'product') {
    await recordMovement({ productId: removed.refId, qty: removed.qty, type: 'ajuste', refType: 'order_cancel', refId: orderId, reason });
  } else if (removed.kind === 'recipe') {
    const recipe = store.get('recipes', removed.refId);
    if (recipe) for (const ing of recipe.ingredients || []) {
      await recordMovement({ productId: ing.productId, qty: ing.qty * removed.qty, type: 'ajuste', refType: 'order_cancel', refId: orderId, reason });
    }
  }
  await logAudit('Producto cancelado de ticket', `${order.number} · ${removed.name} · ${reason || 'sin motivo'}`, 'order', orderId);
}

// ---------------------------------------------------------------------------
// Cuentas abiertas
// ---------------------------------------------------------------------------
export async function openAccount({ customerId, customerName, eventId, tableId }) {
  const id = await store.add('accounts', {
    customerId: customerId || null, customerName: customerName || 'Cliente',
    items: [], payments: [], subtotal: 0, discountTotal: 0, total: 0, paid: 0, balance: 0,
    status: 'abierta', openedAt: new Date().toISOString(), closedAt: null,
    eventId: eventId || null, tableId: tableId || null,
    cashierId: session.currentUser?.id || null, cashierName: session.currentUser?.name || null,
    paymentRequested: false,
    splitType: 'none', splitParts: null, splitPeople: [],
  });
  await logAudit('Cuenta abierta', customerName, 'account', id);
  return id;
}

// ---------------------------------------------------------------------------
// Mesas — roster fijo de mesas numeradas que el mesero abre/cierra. Cada mesa
// está "Libre" (accountId nulo) u ocupada (ligada a una cuenta abierta).
// ---------------------------------------------------------------------------
let _tablesSeeding = false;
export async function ensureTables(count = 12) {
  if (_tablesSeeding || store.data.tables.length) return;
  _tablesSeeding = true;
  try {
    for (let i = 1; i <= count; i++) {
      await store.add('tables', { number: i, label: `Mesa ${String(i).padStart(2, '0')}`, accountId: null });
    }
  } finally {
    _tablesSeeding = false;
  }
}

export async function addTable() {
  const maxNumber = store.data.tables.reduce((m, t) => Math.max(m, t.number || 0), 0);
  const number = maxNumber + 1;
  return store.add('tables', { number, label: `Mesa ${String(number).padStart(2, '0')}`, accountId: null });
}

export async function removeTable(tableId) {
  const table = store.get('tables', tableId);
  if (!table || table.accountId) return; // no se puede quitar una mesa ocupada
  await store.remove('tables', tableId);
}

// Abre (o retoma) la cuenta ligada a una mesa. Devuelve el id de la cuenta.
export async function openTable(tableId) {
  const table = store.get('tables', tableId);
  if (!table) return null;
  if (table.accountId && store.get('accounts', table.accountId)) return table.accountId;
  const accountId = await openAccount({ customerName: table.label, tableId });
  await store.update('tables', tableId, { accountId });
  return accountId;
}

async function releaseTableForAccount(accountId) {
  const table = store.data.tables.find(t => t.accountId === accountId);
  if (table) await store.update('tables', table.id, { accountId: null });
}

// División de cuenta: el mesero (o caja) define si se cobra entera, en partes
// iguales, o por lo que consumió cada quien.
export async function setAccountSplit(accountId, patch) {
  const account = store.get('accounts', accountId);
  if (!account) return;
  const next = {
    splitType: patch.splitType !== undefined ? patch.splitType : (account.splitType || 'none'),
    splitParts: patch.splitParts !== undefined ? patch.splitParts : (account.splitParts || null),
    splitPeople: patch.splitPeople !== undefined ? patch.splitPeople : (account.splitPeople || []),
  };
  if (patch.splitAmounts !== undefined) next.splitAmounts = patch.splitAmounts;
  await store.update('accounts', accountId, next);
}

// Montos editables para "dividir cuenta en partes": por default se reparte
// parejo, pero el mesero puede ajustar cada importe (deben seguir sumando el
// total de la cuenta para poder cobrar).
export function splitAmountsFor(account) {
  const parts = account.splitParts || 2;
  if (Array.isArray(account.splitAmounts) && account.splitAmounts.length === parts) return account.splitAmounts;
  const base = Math.floor((account.total / parts) * 100) / 100;
  const amounts = Array.from({ length: parts }, () => base);
  const rounding = Math.round((account.total - base * parts) * 100) / 100;
  amounts[amounts.length - 1] = Math.round((amounts[amounts.length - 1] + rounding) * 100) / 100;
  return amounts;
}
export async function setSplitAmounts(accountId, amounts) {
  await store.update('accounts', accountId, { splitAmounts: amounts });
}

export async function assignAccountItem(accountId, itemId, personName) {
  const account = store.get('accounts', accountId);
  if (!account) return;
  const items = account.items.map(i => (i.id === itemId ? { ...i, assignedTo: personName || null } : i));
  await store.update('accounts', accountId, { items });
}

export function accountItemTotal(i) {
  return i.cortesia ? 0 : (i.unitPrice * i.qty) - (i.discount || 0);
}

// Desglosa el total de la cuenta por persona, según lo que se le asignó a
// cada quien en el modo "por consumo". Lo que no se asignó cae en `unassigned`.
export function accountSplitByPerson(account) {
  const people = account.splitPeople || [];
  const totals = new Map(people.map(p => [p, 0]));
  let unassigned = 0;
  for (const i of account.items) {
    const t = accountItemTotal(i);
    if (i.assignedTo && totals.has(i.assignedTo)) totals.set(i.assignedTo, totals.get(i.assignedTo) + t);
    else unassigned += t;
  }
  return { rows: people.map(p => ({ name: p, total: totals.get(p) })), unassigned };
}

// El mesero marca que una mesa pidió la cuenta, para que caja la note.
export async function requestAccountPayment(accountId) {
  const account = store.get('accounts', accountId);
  if (!account) return;
  await store.update('accounts', accountId, { paymentRequested: true, paymentRequestedAt: new Date().toISOString() });
  await logAudit('Mesa pidió la cuenta', account.customerName, 'account', accountId);
}

export async function addItemsToAccount(accountId, newLines) {
  const account = store.get('accounts', accountId);
  if (!account) return;
  const now = new Date().toISOString();
  const linesWithId = newLines.map(l => ({
    ...l, id: l.id || uid('item'),
    addedBy: session.currentUser?.name || null, addedAt: now,
  }));
  const items = [...account.items, ...linesWithId];
  const totals = cartTotals(items);
  const paid = sum(account.payments || [], p => p.amount);
  await store.update('accounts', accountId, { items, ...totals, balance: totals.total - paid });
  for (const line of newLines) {
    if (line.kind === 'product') {
      await recordMovement({ productId: line.refId, qty: -line.qty, type: 'venta', refType: 'account', refId: accountId, eventId: account.eventId });
    } else if (line.kind === 'recipe') {
      const recipe = store.get('recipes', line.refId);
      if (recipe) await consumeRecipe(recipe, line.qty, { refId: accountId, eventId: account.eventId });
    }
  }
  await logAudit('Productos agregados a cuenta', account.customerName, 'account', accountId);
}

// Cuando una cuenta queda saldada (balance 0) se genera un registro en
// "orders" con el resumen de la venta — es lo que alimenta el Dashboard,
// Reportes y "quién vendió", que hasta ahora sólo leían ventas hechas
// directo desde el POS. Sin esto, las cuentas cobradas desde "Mis mesas"
// nunca aparecerían en las ventas del negocio.
async function createOrderFromAccount(account, payments) {
  const methods = [...new Set(payments.map(p => p.method))];
  const paymentMethod = methods.length === 1 ? methods[0] : 'mixto';
  const seq = store.data.orders.length + 1;
  const id = await store.add('orders', {
    number: ticketNumber(seq), date: new Date().toISOString(),
    cashierId: account.cashierId || null, cashierName: account.cashierName || session.currentUser?.name || 'Sistema',
    items: account.items, subtotal: account.subtotal, discountTotal: account.discountTotal, total: account.total,
    paymentMethod, payments, eventId: account.eventId || null, accountId: account.id,
    tableId: account.tableId || null, status: 'completado',
  });
  await logAudit('Venta registrada', `${ticketNumber(seq)} · ${money2(account.total)}`, 'order', id);
  return id;
}

export async function addPaymentToAccount(accountId, { amount, method }) {
  const account = store.get('accounts', accountId);
  if (!account) return;
  const payments = [...(account.payments || []), {
    id: uid('pay'), amount: Number(amount), method, date: new Date().toISOString(),
    cashierId: session.currentUser?.id || null,
  }];
  const paid = sum(payments, p => p.amount);
  const balance = account.total - paid;
  const status = balance <= 0.001 ? 'cerrada' : 'pendiente';
  await store.update('accounts', accountId, {
    payments, paid, balance: Math.max(0, balance), status,
    closedAt: status === 'cerrada' ? new Date().toISOString() : null,
    paymentRequested: false,
  });
  if (status === 'cerrada') {
    await releaseTableForAccount(accountId);
    await createOrderFromAccount(account, payments);
  }
  await logAudit('Pago registrado', `${account.customerName} · ${money2(amount)} · ${method}`, 'account', accountId);
}

export async function closeAccount(accountId, { method }) {
  const account = store.get('accounts', accountId);
  if (!account) return;
  const remaining = account.balance;
  if (remaining > 0.001) {
    await addPaymentToAccount(accountId, { amount: remaining, method });
  } else {
    await store.update('accounts', accountId, { status: 'cerrada', closedAt: new Date().toISOString(), paymentRequested: false });
    await releaseTableForAccount(accountId);
  }
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------
export async function createCustomer({ name, phone, address, notes }) {
  const seq = store.data.customers.length + 1;
  const registrationNumber = customerFolio(seq);
  const id = await store.add('customers', {
    name, phone: phone || '', address: address || '', notes: notes || '', registrationNumber,
  });
  await logAudit('Cliente registrado', `${name} · ${registrationNumber}`, 'customer', id);
  return id;
}

export async function updateCustomer(id, { name, phone, address, notes }) {
  const customer = store.get('customers', id);
  if (!customer) return;
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (phone !== undefined) patch.phone = phone;
  if (address !== undefined) patch.address = address;
  if (notes !== undefined) patch.notes = notes;
  await store.update('customers', id, patch);
  // Si el cliente tiene cuentas abiertas, refleja el nombre nuevo ahí también.
  if (name !== undefined && name !== customer.name) {
    for (const a of store.data.accounts.filter(a => a.customerId === id && a.status !== 'cerrada')) {
      await store.update('accounts', a.id, { customerName: name });
    }
  }
  await logAudit('Cliente actualizado', name || customer.name, 'customer', id);
}

// Liga (o quita) un cliente de la base a una cuenta/mesa abierta, para que su
// consumo y pagos queden en el historial del cliente.
export async function assignAccountCustomer(accountId, customerId) {
  const account = store.get('accounts', accountId);
  if (!account) return;
  const customer = customerId ? store.get('customers', customerId) : null;
  await store.update('accounts', accountId, {
    customerId: customer ? customer.id : null,
    customerName: customer ? customer.name : (account.tableId ? (store.get('tables', account.tableId)?.label || account.customerName) : account.customerName),
  });
  await logAudit(customer ? 'Cliente ligado a cuenta' : 'Cliente desligado de cuenta', customer ? customer.name : account.customerName, 'account', accountId);
}

export function customerStats(customerId) {
  const accounts = store.data.accounts.filter(a => a.customerId === customerId);
  const totalConsumed = sum(accounts, a => a.total);
  const balance = sum(accounts, a => a.balance || 0);
  const totalPaid = sum(accounts, a => a.paid || 0);
  const payments = accounts
    .flatMap(a => (a.payments || []).map(p => ({ ...p, accountId: a.id, tableLabel: a.tableId ? (store.get('tables', a.tableId)?.label || null) : null })))
    .sort((x, y) => new Date(y.date) - new Date(x.date));
  return { totalConsumed, balance, totalPaid, accountsCount: accounts.length, accounts, payments };
}

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------
export async function createUser({ name, pin, role }) {
  const id = await store.add('users', { name, pin, role, active: true });
  await logAudit('Usuario creado', `${name} (${role})`, 'user', id);
  return id;
}
export async function updateUser(id, patch) {
  await store.update('users', id, patch);
}
