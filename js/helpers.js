// ============================================================================
// helpers.js — constantes de negocio, formato y utilidades puras
// Sin dependencias de DOM ni de la capability db.
// ============================================================================

export const CATEGORIES = [
  { id: 'cerveza',    label: 'Cerveza',    unit: 'pieza' },
  { id: 'tequila',    label: 'Tequila',    unit: 'ml' },
  { id: 'ron',        label: 'Ron',        unit: 'ml' },
  { id: 'whisky',     label: 'Whisky',     unit: 'ml' },
  { id: 'vodka',      label: 'Vodka',      unit: 'ml' },
  { id: 'mezcal',     label: 'Mezcal',     unit: 'ml' },
  { id: 'preparados', label: 'Preparados', unit: 'pieza' },
  { id: 'cocteles',   label: 'Cócteles',   unit: 'pieza' },
  { id: 'shots',      label: 'Shots',      unit: 'pieza' },
  { id: 'refrescos',  label: 'Refrescos',  unit: 'pieza' },
  { id: 'agua',       label: 'Agua',       unit: 'pieza' },
  { id: 'alimentos',  label: 'Alimentos',  unit: 'pieza' },
  { id: 'otros',      label: 'Otros',      unit: 'pieza' },
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.id, c.label]));

// Categorías que existían antes de separar "Destilados" en tequila/ron/whisky/
// vodka/mezcal — se usan para migrar catálogos viejos al abrir la app.
export const LEGACY_CATEGORY_IDS = new Set(['cervezas', 'destilados']);
export function migrateCategoryId(oldId, name) {
  if (oldId === 'cervezas') return 'cerveza';
  if (oldId === 'destilados') {
    const n = String(name || '').toLowerCase();
    if (n.includes('tequila')) return 'tequila';
    if (n.includes('ron')) return 'ron';
    if (n.includes('whisky') || n.includes('whiskey')) return 'whisky';
    if (n.includes('vodka')) return 'vodka';
    if (n.includes('mezcal')) return 'mezcal';
    return 'otros';
  }
  return oldId;
}

export const PAYMENT_METHODS = [
  { id: 'efectivo',     label: 'Efectivo' },
  { id: 'tarjeta',      label: 'Tarjeta' },
  { id: 'transferencia',label: 'Transferencia' },
  { id: 'otro',         label: 'Otro' },
];
export const PAYMENT_LABEL = Object.fromEntries(PAYMENT_METHODS.map(p => [p.id, p.label]));

export const ROLES = [
  { id: 'admin',      label: 'Administrador' },
  { id: 'gerente',    label: 'Gerente' },
  { id: 'supervisor', label: 'Supervisor' },
  { id: 'cajero',     label: 'Cajero' },
  { id: 'mesero',     label: 'Mesero' },
];
export const ROLE_LABEL = Object.fromEntries(ROLES.map(r => [r.id, r.label]));

// Roles con permiso para autorizar descuentos / cortesías / cancelaciones
export const AUTH_ROLES = new Set(['admin', 'gerente', 'supervisor']);
// Roles con acceso a reportes, inventario y ajustes
export const BACKOFFICE_ROLES = new Set(['admin', 'gerente']);

export const ADJUSTMENT_REASONS = [
  'Merma',
  'Derrame',
  'Sobre servido',
  'Cortesía',
  'Consumo interno',
  'Producto dañado',
  'Error de captura',
  'Error de inventario',
  'Venta no registrada',
  'Robo',
  'Otro',
];

export const MOVEMENT_LABEL = {
  compra: 'Compra',
  venta: 'Venta',
  merma: 'Merma',
  cortesia: 'Cortesía',
  consumo_interno: 'Consumo interno',
  danado: 'Producto dañado',
  ajuste: 'Ajuste',
};

export const PURCHASE_UNITS = [
  { id: 'pieza',      label: 'Pieza',          factor: 1 },
  { id: 'caja',       label: 'Caja / paquete', factor: null }, // factor lo da el usuario
  { id: 'botella',    label: 'Botella',        factor: null },
  { id: 'litro',      label: 'Litro',          factor: 1000 },
  { id: 'ml',         label: 'Mililitro',      factor: 1 },
  { id: 'kilogramo',  label: 'Kilogramo',      factor: null },
  { id: 'bolsa',      label: 'Bolsa',          factor: null },
];

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------
const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const NUM = new Intl.NumberFormat('es-MX');

export function money(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return MXN.format(0);
  return MXN.format(n);
}
export function moneySigned(n) {
  const s = n < 0 ? '-' : n > 0 ? '+' : '';
  return s + MXN.format(Math.abs(n));
}
export function num(n) { return NUM.format(n || 0); }

export function fmtDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtDateTime(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) + ' · ' +
    date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}
export function fmtTime(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}
export function todayKey(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 10);
}
export function isSameDay(a, b) { return todayKey(a) === todayKey(b); }
export function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
export function daysAgo(n) { const x = startOfDay(); x.setDate(x.getDate() - n); return x; }
export function startOfWeek(d = new Date()) {
  const x = startOfDay(d); const day = (x.getDay() + 6) % 7; // lunes=0
  x.setDate(x.getDate() - day); return x;
}
export function startOfMonth(d = new Date()) { const x = startOfDay(d); x.setDate(1); return x; }

// ---------------------------------------------------------------------------
// Unidades / inventario
// ---------------------------------------------------------------------------
// Convierte una cantidad de compra a unidad base del producto (ml o pieza)
export function toBaseUnits(qty, purchaseUnit, product) {
  if (product.saleUnit === 'ml') {
    if (purchaseUnit === 'ml') return qty;
    if (purchaseUnit === 'litro') return qty * 1000;
    if (purchaseUnit === 'botella') return qty * (product.bottleSizeMl || 750);
    if (purchaseUnit === 'caja') return qty * (product.caseSize || 1) * (product.bottleSizeMl || 750);
    return qty;
  }
  // pieza
  if (purchaseUnit === 'caja') return qty * (product.caseSize || 1);
  return qty;
}

export function stockLabel(product) {
  if (product.saleUnit === 'ml') {
    const ml = product.stock || 0;
    const size = product.bottleSizeMl || 750;
    return `${num(Math.round(ml))} ml (~${(ml / size).toFixed(1)} botellas)`;
  }
  return `${num(product.stock || 0)} pzas`;
}

export function isLowStock(product) {
  const threshold = product.lowStockThreshold ?? (product.saleUnit === 'ml' ? (product.bottleSizeMl || 750) : 10);
  return (product.stock || 0) > 0 && (product.stock || 0) <= threshold;
}
export function isOutOfStock(product) { return (product.stock || 0) <= 0; }

// ---------------------------------------------------------------------------
// Varios
// ---------------------------------------------------------------------------
export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function ticketNumber(seq) {
  return '#' + String(seq).padStart(6, '0');
}

export function customerFolio(seq) {
  return 'C-' + String(seq).padStart(5, '0');
}

export function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

export function sum(arr, fn) { return arr.reduce((a, x) => a + (fn ? fn(x) : x), 0); }

export function groupBy(arr, fn) {
  const out = {};
  for (const item of arr) {
    const k = fn(item);
    (out[k] = out[k] || []).push(item);
  }
  return out;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
}

const AVATAR_HUES = [12, 28, 44, 160, 200, 260, 320];
export function avatarColor(seed) {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) % 360;
  const hue = AVATAR_HUES[h % AVATAR_HUES.length];
  return `hsl(${hue} 45% 42%)`;
}

export function pctChange(curr, prev) {
  if (!prev) return curr ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}
