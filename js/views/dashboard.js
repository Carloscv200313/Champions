// ============================================================================
// views/dashboard.js — panel del propietario. Responde en segundos:
// cuánto vendí, cuánto gané, qué se vendió, cómo va el inventario,
// cuánto hay en caja, quién vendió y quién debe.
// ============================================================================
import { store } from '../db.js';
import { registerRoute } from '../routes.js';
import { layout, kpi, pill, emptyState } from '../ui.js';
import {
  money, num, fmtTime, isLowStock, isOutOfStock, stockLabel, sum,
} from '../helpers.js';
import {
  inRange, salesSummary, comparePeriods, topProducts, salesByDay,
  cashierSummary, inventoryValue, estimatedCost,
} from '../analytics.js';
import { lineChart, barChart } from '../charts.js';
import {
  startOfDay, daysAgo, startOfWeek, startOfMonth,
} from '../helpers.js';

function render() {
  const { orders, products, recipes, accounts, tables, adjustments } = store.data;
  const productsById = new Map(products.map(p => [p.id, p]));
  const recipesById = new Map(recipes.map(r => [r.id, r]));

  const today0 = startOfDay();
  const yesterday0 = daysAgo(1);
  const tomorrow0 = daysAgo(-1);

  const todayOrders = inRange(orders, today0, tomorrow0);
  const yestOrders = inRange(orders, yesterday0, today0);
  const todaySum = salesSummary(todayOrders);
  const yestSum = salesSummary(yestOrders);

  const weekCmp = comparePeriods(orders, startOfWeek(), tomorrow0, daysAgo(7 + (new Date().getDay() + 6) % 7), startOfWeek());
  const monthCmp = comparePeriods(orders, startOfMonth(), tomorrow0, (() => { const d = startOfMonth(); d.setMonth(d.getMonth() - 1); return d; })(), startOfMonth());

  const todayCost = estimatedCost(todayOrders, productsById, recipesById);
  const estProfit = todaySum.total - todayCost;
  const yestCost = estimatedCost(yestOrders, productsById, recipesById);
  const yestProfit = yestSum.total - yestCost;
  const profitDelta = yestProfit ? ((estProfit - yestProfit) / Math.abs(yestProfit)) * 100 : (estProfit ? 100 : 0);

  const lowStock = products.filter(p => p.active !== false && isLowStock(p));
  const outStock = products.filter(p => p.active !== false && isOutOfStock(p));
  const invValue = inventoryValue(products.filter(p => p.active !== false));
  const recentAdjustments = [...adjustments].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);

  const openAccounts = accounts.filter(a => a.status === 'abierta');
  const pendingAccounts = accounts.filter(a => a.status === 'pendiente');
  const pendingTotal = sum(pendingAccounts, a => a.balance);
  const occupiedTables = (tables || []).filter(t => t.accountId);
  const askingToPay = accounts.filter(a => a.paymentRequested && a.status !== 'cerrada');

  const trend = salesByDay(orders, 14);
  const top = topProducts(todayOrders.length ? todayOrders : orders, 6);
  const cashiers = cashierSummary(todayOrders);

  const alerts = [];
  if (outStock.length) alerts.push({ tone: 'danger', text: `${outStock.length} producto${outStock.length > 1 ? 's' : ''} agotado${outStock.length > 1 ? 's' : ''}` });
  if (lowStock.length) alerts.push({ tone: 'warn', text: `${lowStock.length} con inventario bajo` });
  if (pendingAccounts.length) alerts.push({ tone: 'warn', text: `${pendingAccounts.length} cuenta${pendingAccounts.length > 1 ? 's' : ''} pendiente${pendingAccounts.length > 1 ? 's' : ''} · ${money(pendingTotal)}` });
  if (askingToPay.length) alerts.push({ tone: 'danger', text: `${askingToPay.length} mesa${askingToPay.length > 1 ? 's' : ''} pidiendo la cuenta` });
  const bigDiffs = recentAdjustments.filter(a => Math.abs(a.difference) > 0 && a.valueDifference > 0);
  if (bigDiffs.length) alerts.push({ tone: 'info', text: `${bigDiffs.length} diferencia${bigDiffs.length > 1 ? 's' : ''} de inventario reciente${bigDiffs.length > 1 ? 's' : ''}` });

  const content = `
    ${alerts.length ? `<div class="flex wrap mb-16">${alerts.map(a => pill(a.text, a.tone)).join('')}</div>` : ''}

    <div class="section-head"><div class="section-title">Ventas de hoy</div></div>
    <div class="kpi-grid mb-16">
      ${kpi({ label: 'Ventas totales', value: money(todaySum.total), sub: 'vs. ayer', delta: pctSafe(todaySum.total, yestSum.total) })}
      ${kpi({ label: 'Tickets', value: num(todaySum.tickets), sub: 'vs. ayer', delta: pctSafe(todaySum.tickets, yestSum.tickets) })}
      ${kpi({ label: 'Ticket promedio', value: money(todaySum.avg), sub: 'por venta' })}
      ${kpi({ label: 'Utilidad estimada', value: money(estProfit), sub: 'vs. ayer', delta: profitDelta })}
    </div>

    <div class="grid" style="grid-template-columns: 2fr 1fr; align-items:stretch">
      <div class="card card-pad">
        <div class="section-head"><div class="section-title">Tendencia · últimos 14 días</div><div class="small muted">${money(sum(trend, t => t.total))} en el periodo</div></div>
        ${lineChart(trend)}
      </div>
      <div class="card card-pad col" style="gap:16px">
        <div>
          <div class="tiny muted bold" style="text-transform:uppercase;letter-spacing:.05em">Esta semana vs. anterior</div>
          <div class="flex between mt-8"><span class="display" style="font-size:19px">${money(weekCmp.curr.total)}</span>${deltaPill(weekCmp.deltaTotal)}</div>
        </div>
        <hr class="sep" style="margin:2px 0">
        <div>
          <div class="tiny muted bold" style="text-transform:uppercase;letter-spacing:.05em">Este mes vs. anterior</div>
          <div class="flex between mt-8"><span class="display" style="font-size:19px">${money(monthCmp.curr.total)}</span>${deltaPill(monthCmp.deltaTotal)}</div>
        </div>
        <hr class="sep" style="margin:2px 0">
        <div>
          <div class="tiny muted bold" style="text-transform:uppercase;letter-spacing:.05em">Métodos de pago hoy</div>
          <div class="col mt-8" style="gap:7px">
            ${Object.entries(todaySum.byPayment).filter(([,v]) => v > 0).map(([k, v]) => paymentRow(k, v, todaySum.total)).join('') || '<div class="small muted">Sin ventas todavía</div>'}
          </div>
        </div>
      </div>
    </div>

    <div class="grid mt-16" style="grid-template-columns: 1fr 1fr">
      <div class="card card-pad">
        <div class="section-head"><div class="section-title">Inventario</div><a class="link-btn" data-action="go" data-route="inventory">Ver inventario →</a></div>
        <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr)">
          ${kpi({ label: 'Valor de inventario', value: money(invValue) })}
          ${kpi({ label: 'Inventario bajo', value: num(lowStock.length) })}
          ${kpi({ label: 'Agotados', value: num(outStock.length) })}
          ${kpi({ label: 'Diferencias recientes', value: num(recentAdjustments.length) })}
        </div>
      </div>
      <div class="card card-pad">
        <div class="section-head"><div class="section-title">Operación</div></div>
        <div class="col" style="gap:10px">
          <div class="flex between small"><span class="muted">Cuentas abiertas</span><span class="bold num">${num(openAccounts.length)}</span></div>
          <div class="flex between small"><span class="muted">Cuentas pendientes</span><span class="bold num">${num(pendingAccounts.length)} · ${money(pendingTotal)}</span></div>
          <div class="flex between small"><span class="muted">Mesas ocupadas</span><span class="bold num">${num(occupiedTables.length)} / ${num((tables||[]).length)}</span></div>
          <div class="flex between small"><span class="muted">Mesas pidiendo la cuenta</span><span class="bold num" style="color:${askingToPay.length?'var(--danger)':'inherit'}">${num(askingToPay.length)}</span></div>
        </div>
      </div>
    </div>

    <div class="grid mt-16" style="grid-template-columns: 1.1fr .9fr">
      <div class="card card-pad">
        <div class="section-head"><div class="section-title">Productos más vendidos ${todayOrders.length ? '· hoy' : ''}</div></div>
        ${top.length ? barChart(top.map(t => ({ label: t.name.length > 10 ? t.name.slice(0,9)+'…' : t.name, value: t.revenue })), { fmt: money, height: 190 }) : emptyState('reports', 'Aún no hay ventas registradas')}
      </div>
      <div class="card card-pad">
        <div class="section-head"><div class="section-title">Quién vendió hoy</div></div>
        ${cashiers.length ? `<div class="col" style="gap:10px">${cashiers.map(c => `
          <div>
            <div class="flex between small"><span class="bold">${c.name}</span><span class="num">${money(c.total)}</span></div>
            <div class="bar-track mt-4"><div class="bar-fill" style="width:${Math.min(100, (c.total / (cashiers[0].total||1))*100)}%"></div></div>
            <div class="tiny muted mt-4">${num(c.tickets)} tickets${c.discounts ? ` · ${money(c.discounts)} en descuentos` : ''}</div>
          </div>`).join('')}</div>` : emptyState('customers', 'Nadie ha vendido todavía hoy')}
      </div>
    </div>
  `;
  return layout(content, { title: 'Dashboard', sub: `Hoy · ${fmtTime(new Date())}` });
}

function pctSafe(curr, prev) {
  if (!prev) return curr ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}
function deltaPill(d) {
  const tone = d > 0.5 ? 'up' : d < -0.5 ? 'down' : 'flat';
  const arrow = tone === 'up' ? '↑' : tone === 'down' ? '↓' : '·';
  return `<span class="delta ${tone}">${arrow} ${Math.abs(d).toFixed(0)}%</span>`;
}
function paymentRow(method, value, total) {
  const label = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', otro: 'Otro' }[method] || method;
  const pct = total ? (value / total) * 100 : 0;
  return `<div>
    <div class="flex between tiny"><span>${label}</span><span class="num bold">${money(value)}</span></div>
    <div class="bar-track mt-4"><div class="bar-fill" style="width:${pct}%"></div></div>
  </div>`;
}

registerRoute('dashboard', render);
