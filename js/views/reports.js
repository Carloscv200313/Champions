// ============================================================================
// views/reports.js — reportes de ventas, productos, cajeros e inventario,
// con comparativas simples entre periodos.
// ============================================================================
import { store } from '../db.js';
import { ui, requestRender } from '../state.js';
import { registerActions } from '../actions.js';
import { registerRoute } from '../routes.js';
import { layout, tableWrap, emptyState } from '../ui.js';
import {
  money, num, escapeHtml, CATEGORY_LABEL, sum, daysAgo, startOfDay, startOfMonth,
} from '../helpers.js';
import {
  inRange, salesSummary, topProducts, salesByDay, cashierSummary, salesByCategory, estimatedCost,
} from '../analytics.js';
import { lineChart, barChart } from '../charts.js';

if (!ui.reportsTab) ui.reportsTab = 'ventas';
if (!ui.reportsRange) ui.reportsRange = 30;

function rangeBounds() {
  const end = daysAgo(-1);
  const start = ui.reportsRange === 0 ? startOfDay() : daysAgo(ui.reportsRange);
  return { start, end };
}

function render() {
  const tab = ui.reportsTab;
  const rangePicker = `
    <div class="flex" style="gap:6px">
      ${[[0,'Hoy'],[7,'7 días'],[30,'30 días'],[90,'Trimestre']].map(([v,l]) => `<button class="btn sm ${ui.reportsRange===v?'primary':''}" data-action="repSetRange" data-range="${v}">${l}</button>`).join('')}
    </div>`;

  const content = `
    <div class="tabs">
      ${['ventas','productos','cajeros','inventario'].map(t => `<div class="tab ${tab===t?'active':''}" data-action="repSetTab" data-tab="${t}">${t[0].toUpperCase()+t.slice(1)}</div>`).join('')}
    </div>
    ${tab !== 'inventario' ? `<div class="mb-16">${rangePicker}</div>` : ''}
    ${tab==='ventas' ? ventasTab() : tab==='productos' ? productosTab() : tab==='cajeros' ? cajerosTab() : inventarioTab()}
  `;
  return layout(content, { title: 'Reportes', sub: 'Ventas, productos, cajeros e inventario' });
}
registerRoute('reports', render);

registerActions({
  repSetTab(el) { ui.reportsTab = el.dataset.tab; requestRender(); },
  repSetRange(el) { ui.reportsRange = Number(el.dataset.range); requestRender(); },
});

function ventasTab() {
  const { start, end } = rangeBounds();
  const orders = inRange(store.data.orders, start, end);
  const s = salesSummary(orders);
  const trend = salesByDay(store.data.orders, Math.max(ui.reportsRange, 1));
  return `
    <div class="kpi-grid mb-16">
      <div class="kpi"><div class="kpi-label">Ventas</div><div class="kpi-value num" style="font-size:22px">${money(s.total)}</div></div>
      <div class="kpi"><div class="kpi-label">Tickets</div><div class="kpi-value num" style="font-size:22px">${num(s.tickets)}</div></div>
      <div class="kpi"><div class="kpi-label">Ticket promedio</div><div class="kpi-value num" style="font-size:22px">${money(s.avg)}</div></div>
      <div class="kpi"><div class="kpi-label">Artículos vendidos</div><div class="kpi-value num" style="font-size:22px">${num(s.items)}</div></div>
    </div>
    <div class="card card-pad mb-16">${lineChart(trend)}</div>
    <div class="section-head"><div class="section-title">Métodos de pago</div></div>
    ${tableWrap(`<thead><tr><th>Método</th><th>Total</th><th>% del periodo</th></tr></thead><tbody>
      ${Object.entries(s.byPayment).filter(([,v])=>v>0).map(([k,v])=>`<tr><td class="bold">${{efectivo:'Efectivo',tarjeta:'Tarjeta',transferencia:'Transferencia',otro:'Otro'}[k]}</td><td class="num">${money(v)}</td><td class="num">${s.total? ((v/s.total)*100).toFixed(0):0}%</td></tr>`).join('') || '<tr><td colspan="3" class="tbl-empty">Sin ventas en el periodo</td></tr>'}
    </tbody>`)}
  `;
}

function productosTab() {
  const { start, end } = rangeBounds();
  const orders = inRange(store.data.orders, start, end);
  const top = topProducts(orders, 10);
  const bottomCandidates = topProducts(orders, 999).slice(-8).reverse();
  const catOf = (it) => {
    const prod = store.data.products.find(p=>p.name===it.name);
    const rec = store.data.recipes.find(r=>r.name===it.name);
    return prod?.category || rec?.category;
  };
  const byCat = salesByCategory(orders, catOf);
  return `
    <div class="grid" style="grid-template-columns:1fr 1fr">
      <div class="card card-pad">
        <div class="section-head"><div class="section-title">Más vendidos</div></div>
        ${top.length ? barChart(top.slice(0,6).map(t=>({label:t.name.length>9?t.name.slice(0,8)+'…':t.name, value:t.revenue})), {height:190}) : emptyState('reports','Sin datos')}
      </div>
      <div class="card card-pad">
        <div class="section-head"><div class="section-title">Ventas por categoría</div></div>
        ${byCat.size ? barChart([...byCat.entries()].map(([k,v])=>({label:CATEGORY_LABEL[k]||k, value:v})), {height:190}) : emptyState('reports','Sin datos')}
      </div>
    </div>
    <div class="section-head mt-16"><div class="section-title">Detalle de productos</div></div>
    ${top.length ? tableWrap(`<thead><tr><th>Producto</th><th>Cantidad</th><th>Ingresos</th></tr></thead><tbody>
      ${top.map(t=>`<tr><td class="bold">${escapeHtml(t.name)}</td><td class="num">${num(t.qty)}</td><td class="num">${money(t.revenue)}</td></tr>`).join('')}
    </tbody>`) : emptyState('reports','Sin ventas en el periodo')}
  `;
}

function cajerosTab() {
  const { start, end } = rangeBounds();
  const orders = inRange(store.data.orders, start, end);
  const rows = cashierSummary(orders);
  return rows.length ? tableWrap(`
    <thead><tr><th>Cajero</th><th>Tickets</th><th>Ventas</th><th>Descuentos/cortesías</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td class="bold">${escapeHtml(r.name)}</td><td class="num">${num(r.tickets)}</td><td class="num">${money(r.total)}</td><td class="num">${money(r.discounts)}</td></tr>`).join('')}</tbody>
  `) : emptyState('customers','Sin ventas en el periodo');
}

function inventarioTab() {
  const products = store.data.products.filter(p=>p.active!==false);
  const totalValue = sum(products, p => (p.stock||0)*(p.costPerBaseUnit||0));
  const movs = store.data.movements;
  const entradas = sum(movs.filter(m=>m.qty>0), m=>m.qty);
  const adjustments = store.data.adjustments;
  return `
    <div class="kpi-grid mb-16">
      <div class="kpi"><div class="kpi-label">Valor total</div><div class="kpi-value num" style="font-size:22px">${money(totalValue)}</div></div>
      <div class="kpi"><div class="kpi-label">Productos activos</div><div class="kpi-value num" style="font-size:22px">${num(products.length)}</div></div>
      <div class="kpi"><div class="kpi-label">Movimientos registrados</div><div class="kpi-value num" style="font-size:22px">${num(movs.length)}</div></div>
      <div class="kpi"><div class="kpi-label">Ajustes registrados</div><div class="kpi-value num" style="font-size:22px">${num(adjustments.length)}</div></div>
    </div>
    ${tableWrap(`<thead><tr><th>Producto</th><th>Existencia</th><th>Costo unit.</th><th>Valor</th></tr></thead><tbody>
      ${products.sort((a,b)=>((b.stock||0)*(b.costPerBaseUnit||0))-((a.stock||0)*(a.costPerBaseUnit||0))).map(p=>`<tr><td class="bold">${escapeHtml(p.name)}</td><td class="num">${num(p.stock||0)}</td><td class="num">${money(p.costPerBaseUnit||0)}</td><td class="num">${money((p.stock||0)*(p.costPerBaseUnit||0))}</td></tr>`).join('') || '<tr><td colspan="4" class="tbl-empty">Sin productos</td></tr>'}
    </tbody>`)}
  `;
}
