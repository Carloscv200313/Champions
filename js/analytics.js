// ============================================================================
// analytics.js — agregaciones puras reutilizadas por dashboard y reportes.
// Todas reciben arreglos ya cargados desde el store; no tocan la red.
// ============================================================================
import { sum, groupBy, startOfDay, daysAgo, pctChange } from './helpers.js';

export function inRange(orders, start, end) {
  return orders.filter(o => o.status !== 'cancelado' && new Date(o.date) >= start && new Date(o.date) < end);
}

export function salesSummary(orders) {
  const total = sum(orders, o => o.total);
  const tickets = orders.length;
  const avg = tickets ? total / tickets : 0;
  const items = sum(orders, o => sum(o.items || [], i => i.qty));
  const byPayment = { efectivo: 0, tarjeta: 0, transferencia: 0, otro: 0 };
  for (const o of orders) byPayment[o.paymentMethod] = (byPayment[o.paymentMethod] || 0) + o.total;
  return { total, tickets, avg, items, byPayment };
}

export function comparePeriods(orders, currStart, currEnd, prevStart, prevEnd) {
  const curr = salesSummary(inRange(orders, currStart, currEnd));
  const prev = salesSummary(inRange(orders, prevStart, prevEnd));
  return { curr, prev, deltaTotal: pctChange(curr.total, prev.total), deltaTickets: pctChange(curr.tickets, prev.tickets) };
}

export function topProducts(orders, limit = 8) {
  const map = new Map();
  for (const o of orders) {
    for (const it of o.items || []) {
      const k = it.name;
      const row = map.get(k) || { name: k, qty: 0, revenue: 0 };
      row.qty += it.qty;
      row.revenue += it.cortesia ? 0 : Math.max(0, it.unitPrice * it.qty - (it.discount || 0));
      map.set(k, row);
    }
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
}

export function salesByCategory(orders, catOf) {
  const map = new Map();
  for (const o of orders) {
    for (const it of o.items || []) {
      const cat = catOf(it) || 'otros';
      map.set(cat, (map.get(cat) || 0) + (it.cortesia ? 0 : Math.max(0, it.unitPrice * it.qty - (it.discount || 0))));
    }
  }
  return map;
}

export function salesByDay(orders, days = 14) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = daysAgo(i);
    const next = daysAgo(i - 1);
    const rows = inRange(orders, day, next);
    out.push({ date: day, total: sum(rows, o => o.total), tickets: rows.length });
  }
  return out;
}

export function cashierSummary(orders) {
  const g = groupBy(orders, o => o.cashierName || 'Sin asignar');
  return Object.entries(g).map(([name, rows]) => ({
    name, total: sum(rows, o => o.total), tickets: rows.length,
    discounts: sum(rows, o => o.discountTotal || 0),
  })).sort((a, b) => b.total - a.total);
}

export function inventoryValue(products) {
  return sum(products, p => (p.stock || 0) * (p.costPerBaseUnit || 0));
}

// Costo estimado (aprox. contable, no exacto) de lo vendido en un rango de
// órdenes, usando el costo por unidad base registrado en cada producto.
export function estimatedCost(orders, productsById, recipesById) {
  let cost = 0;
  for (const o of orders) {
    for (const it of o.items || []) {
      if (it.cortesia) continue;
      if (it.kind === 'product') {
        const p = productsById.get(it.refId);
        if (p) cost += (p.costPerBaseUnit || 0) * it.qty;
      } else if (it.kind === 'recipe') {
        const r = recipesById.get(it.refId);
        if (r) for (const ing of r.ingredients || []) {
          const p = productsById.get(ing.productId);
          if (p) cost += (p.costPerBaseUnit || 0) * ing.qty * it.qty;
        }
      }
    }
  }
  return cost;
}
