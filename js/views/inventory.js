// ============================================================================
// views/inventory.js — catálogo, compras, conciliación teórico vs. físico y
// bitácora de movimientos. El módulo más importante del sistema.
// ============================================================================
import { store } from '../db.js';
import {
  ui, requestRender, openModal, closeModal, showToast,
  createProduct, updateProduct, setProductActive, registerPurchase, reconcileProduct,
} from '../state.js';
import { registerActions } from '../actions.js';
import { registerRoute } from '../routes.js';
import { registerModal } from '../modals.js';
import { layout, tableWrap, pill, emptyState } from '../ui.js';
import { icon } from '../icons.js';
import {
  money, num, escapeHtml, fmtDateTime, CATEGORIES, CATEGORY_LABEL, PURCHASE_UNITS,
  ADJUSTMENT_REASONS, MOVEMENT_LABEL, stockLabel, isLowStock, isOutOfStock, uid,
} from '../helpers.js';

if (!ui.inventoryTab) ui.inventoryTab = 'catalogo';
if (!ui.reconcileDraft) ui.reconcileDraft = {};

function statusPillFor(p) {
  if (isOutOfStock(p)) return pill('Agotado', 'danger');
  if (isLowStock(p)) return pill('Bajo', 'warn');
  return pill('OK', 'good');
}

function render() {
  const tab = ui.inventoryTab;
  const content = `
    <div class="tabs">
      <div class="tab ${tab==='catalogo'?'active':''}" data-action="invSetTab" data-tab="catalogo">Catálogo</div>
      <div class="tab ${tab==='compras'?'active':''}" data-action="invSetTab" data-tab="compras">Compras</div>
      <div class="tab ${tab==='conciliacion'?'active':''}" data-action="invSetTab" data-tab="conciliacion">Conciliación</div>
      <div class="tab ${tab==='movimientos'?'active':''}" data-action="invSetTab" data-tab="movimientos">Movimientos</div>
    </div>
    ${tab==='catalogo' ? catalogoTab() : tab==='compras' ? comprasTab() : tab==='conciliacion' ? conciliacionTab() : movimientosTab()}
  `;
  const actions = tab === 'catalogo' ? `<button class="btn primary" data-action="prodNewOpen">${icon('plus','ic')} Nuevo producto</button>`
    : tab === 'compras' ? `<button class="btn primary" data-action="purchNewOpen">${icon('plus','ic')} Registrar compra</button>` : '';
  return layout(content, { title: 'Inventario', sub: 'Catálogo, compras, conciliación y movimientos', actions });
}
registerRoute('inventory', render);

// ---------------------------------------------------------------------------
function catalogoTab() {
  const products = [...store.data.products].sort((a,b)=> a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  if (!products.length) return emptyState('inventory', 'Aún no hay productos en el catálogo');
  return tableWrap(`
    <thead><tr><th>Producto</th><th>Categoría</th><th>Existencia</th><th>Costo unit.</th><th>Precio</th><th>Estado</th><th></th></tr></thead>
    <tbody>
      ${products.map(p => `
        <tr class="${p.active===false?'faint':''}">
          <td class="bold">${escapeHtml(p.name)} ${p.favorite ? icon('starFilled','ic') : ''}</td>
          <td class="small muted">${CATEGORY_LABEL[p.category]||p.category}</td>
          <td class="num small">${stockLabel(p)}</td>
          <td class="num small">${money(p.costPerBaseUnit||0)}</td>
          <td class="num small">${money(p.price||0)}</td>
          <td>${p.active===false ? pill('Inactivo','neutral') : statusPillFor(p)}</td>
          <td><button class="icon-btn" data-action="prodEditOpen" data-id="${p.id}">${icon('edit','ic')}</button></td>
        </tr>`).join('')}
    </tbody>
  `);
}

registerActions({
  invSetTab(el) { ui.inventoryTab = el.dataset.tab; requestRender(); },

  prodNewOpen() { openModal({ type: 'productForm', mode: 'new', data: { name:'', category:'cerveza', saleUnit:'pieza', price:'', costPerBaseUnit:'', stock:'', lowStockThreshold:'', bottleSizeMl:'750', caseSize:'24', favorite:false, sellable:true } }); },
  prodEditOpen(el) {
    const p = store.get('products', el.dataset.id);
    openModal({ type: 'productForm', mode: 'edit', id: p.id, data: { name:p.name, category:p.category, saleUnit:p.saleUnit||'pieza', price:p.price, costPerBaseUnit:p.costPerBaseUnit, stock:p.stock, lowStockThreshold:p.lowStockThreshold??'', bottleSizeMl:p.bottleSizeMl||750, caseSize:p.caseSize||'', favorite:!!p.favorite, sellable:p.sellable!==false, active:p.active!==false } });
  },
  prodField(el) {
    const m = ui.modal; if (!m) return;
    const f = el.dataset.f;
    m.data[f] = el.type === 'checkbox' ? el.checked : el.value;
    if (f === 'category' && m.mode === 'new') {
      // Al crear, sugiere la unidad típica de la categoría — el usuario puede cambiarla
      // (p. ej. un jarabe o refresco a granel que se sirve por ml en una receta).
      m.data.saleUnit = (CATEGORIES.find(c => c.id === m.data.category) || {}).unit || 'pieza';
    }
    if (f === 'category' || f === 'saleUnit') requestRender();
  },
  async prodSubmit() {
    const m = ui.modal;
    const d = m.data;
    if (!d.name.trim()) { showToast('Escribe un nombre', 'danger'); return; }
    const payload = {
      name: d.name.trim(), category: d.category, saleUnit: d.saleUnit,
      price: Number(d.price)||0, costPerBaseUnit: Number(d.costPerBaseUnit)||0,
      stock: Number(d.stock)||0, lowStockThreshold: d.lowStockThreshold!=='' ? Number(d.lowStockThreshold) : null,
      bottleSizeMl: d.saleUnit==='ml' ? Number(d.bottleSizeMl)||750 : null,
      caseSize: d.caseSize ? Number(d.caseSize) : null,
      favorite: !!d.favorite, sellable: d.sellable !== false,
    };
    if (m.mode === 'new') await createProduct(payload);
    else await updateProduct(m.id, { ...payload, active: d.active!==false });
    showToast('Producto guardado');
    closeModal();
  },
  async prodToggleActive() {
    const m = ui.modal;
    await setProductActive(m.id, !(m.data.active !== false));
    m.data.active = !(m.data.active !== false) ? true : false;
    closeModal();
  },
});

registerModal('productForm', (m) => {
  const d = m.data;
  const isMl = d.saleUnit === 'ml';
  return {
    title: m.mode === 'new' ? 'Nuevo producto' : 'Editar producto',
    body: `
      <label class="field">Nombre<input class="input" value="${escapeHtml(d.name)}" data-oninput="prodField" data-f="name"></label>
      <div class="field-row">
        <label class="field">Categoría
          <select class="input" data-onchange="prodField" data-f="category">
            ${CATEGORIES.map(c => `<option value="${c.id}" ${c.id===d.category?'selected':''}>${c.label}</option>`).join('')}
          </select>
        </label>
        <label class="field">Se controla por
          <select class="input" data-onchange="prodField" data-f="saleUnit">
            <option value="pieza" ${!isMl?'selected':''}>Pieza</option>
            <option value="ml" ${isMl?'selected':''}>Mililitros (botella/garrafa)</option>
          </select>
        </label>
      </div>
      <div class="field-row">
        <label class="field">Precio de venta directa
          <input class="input" type="number" min="0" step="0.5" value="${d.price}" data-oninput="prodField" data-f="price">
        </label>
        <label class="field">Costo por ${isMl?'ml':'pieza'}
          <input class="input" type="number" min="0" step="0.01" value="${d.costPerBaseUnit}" data-oninput="prodField" data-f="costPerBaseUnit">
        </label>
      </div>
      <div class="field-row">
        <label class="field">Existencia actual (${isMl?'ml':'piezas'})
          <input class="input" type="number" step="1" value="${d.stock}" data-oninput="prodField" data-f="stock">
        </label>
        <label class="field">Alerta de inventario bajo
          <input class="input" type="number" min="0" placeholder="automático" value="${d.lowStockThreshold}" data-oninput="prodField" data-f="lowStockThreshold">
        </label>
      </div>
      ${isMl ? `<label class="field">Tamaño de botella/garrafa (ml)<input class="input" type="number" value="${d.bottleSizeMl}" data-oninput="prodField" data-f="bottleSizeMl"></label>`
      : `<label class="field">Piezas por caja (opcional)<input class="input" type="number" value="${d.caseSize}" data-oninput="prodField" data-f="caseSize"></label>`}
      <label class="checkbox-row"><input type="checkbox" ${d.favorite?'checked':''} data-onchange="prodField" data-f="favorite"> Marcar como favorito en el POS</label>
      <label class="checkbox-row"><input type="checkbox" ${d.sellable!==false?'checked':''} data-onchange="prodField" data-f="sellable"> Se vende directo en el POS</label>
      <div class="tiny faint">Desmarca "se vende directo" para insumos que sólo se usan dentro de recetas (jarabes, garrafas, guarniciones). Ej. un refresco embotellado que se vende entero se controla por pieza; un jarabe o destilado que se sirve parcial en recetas se controla por ml.</div>
    `,
    foot: m.mode === 'edit'
      ? `<button class="btn danger" data-action="prodToggleActive">${d.active!==false?'Desactivar':'Reactivar'}</button><button class="btn primary" data-action="prodSubmit">Guardar</button>`
      : `<button class="btn ghost" data-action="closeModal">Cancelar</button><button class="btn primary" data-action="prodSubmit">Crear producto</button>`,
  };
});

// ---------------------------------------------------------------------------
function comprasTab() {
  const purchases = [...store.data.purchases].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if (!purchases.length) return emptyState('inventory', 'Aún no hay compras registradas');
  return tableWrap(`
    <thead><tr><th>Fecha</th><th>Proveedor</th><th>Artículos</th><th>Total</th><th>Registró</th></tr></thead>
    <tbody>
      ${purchases.map(p => `<tr><td class="small">${fmtDateTime(p.date)}</td><td class="bold">${escapeHtml(p.supplier)}</td><td class="small muted">${p.items.length}</td><td class="num">${money(p.total)}</td><td class="small muted">${escapeHtml(p.registeredBy)}</td></tr>`).join('')}
    </tbody>
  `);
}

registerActions({
  purchNewOpen() {
    openModal({ type: 'purchaseForm', supplier: '', items: [{ id: uid('ln'), productId: store.data.products[0]?.id||'', qty:'', purchaseUnit:'pieza', unitCost:'' }] });
  },
  purchSupplier(el) { if (ui.modal) ui.modal.supplier = el.value; },
  purchAddRow() { ui.modal.items.push({ id: uid('ln'), productId: store.data.products[0]?.id||'', qty:'', purchaseUnit:'pieza', unitCost:'' }); requestRender(); },
  purchRemoveRow(el) { ui.modal.items = ui.modal.items.filter(r => r.id !== el.dataset.id); requestRender(); },
  purchRowField(el) {
    const row = ui.modal.items.find(r => r.id === el.dataset.id);
    if (!row) return;
    row[el.dataset.f] = el.value;
    if (el.dataset.f === 'productId') requestRender();
  },
  async purchSubmit() {
    const m = ui.modal;
    const items = m.items.filter(r => r.productId && Number(r.qty) > 0 && Number(r.unitCost) >= 0);
    if (!items.length) { showToast('Agrega al menos un artículo válido', 'danger'); return; }
    await registerPurchase({ supplier: m.supplier.trim() || 'Sin especificar', items });
    showToast('Compra registrada e inventario actualizado');
    closeModal();
  },
});

registerModal('purchaseForm', (m) => {
  const rowTotal = (r) => (Number(r.qty)||0) * (Number(r.unitCost)||0);
  const total = m.items.reduce((a,r)=>a+rowTotal(r),0);
  return {
    wide: true,
    title: 'Registrar compra',
    body: `
      <label class="field">Proveedor<input class="input" value="${escapeHtml(m.supplier)}" data-oninput="purchSupplier" placeholder="Ej. Distribuidora del Valle"></label>
      <div class="col" style="gap:10px">
        ${m.items.map(r => {
          const p = store.get('products', r.productId);
          return `<div class="card card-pad" style="padding:12px">
            <div class="field-row">
              <label class="field">Producto
                <select class="input" data-onchange="purchRowField" data-id="${r.id}" data-f="productId">
                  ${store.data.products.filter(x=>x.active!==false).map(x => `<option value="${x.id}" ${x.id===r.productId?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}
                </select>
              </label>
              <button class="icon-btn" style="align-self:flex-end" data-action="purchRemoveRow" data-id="${r.id}">${icon('trash','ic')}</button>
            </div>
            <div class="field-row mt-8">
              <label class="field">Cantidad<input class="input" type="number" min="0" value="${r.qty}" data-oninput="purchRowField" data-id="${r.id}" data-f="qty"></label>
              <label class="field">Unidad de compra
                <select class="input" data-onchange="purchRowField" data-id="${r.id}" data-f="purchaseUnit">
                  ${PURCHASE_UNITS.map(u => `<option value="${u.id}" ${u.id===r.purchaseUnit?'selected':''}>${u.label}</option>`).join('')}
                </select>
              </label>
              <label class="field">Costo por unidad<input class="input" type="number" min="0" step="0.01" value="${r.unitCost}" data-oninput="purchRowField" data-id="${r.id}" data-f="unitCost"></label>
            </div>
            <div class="tiny muted mt-4">${p ? `Existencia actual: ${stockLabel(p)}` : ''} · Subtotal: <b class="num">${money(rowTotal(r))}</b></div>
          </div>`;
        }).join('')}
      </div>
      <button class="btn sm" data-action="purchAddRow">${icon('plus','ic')} Agregar artículo</button>
      <div class="totals-row total"><span>Total de la compra</span><span class="num">${money(total)}</span></div>
    `,
    foot: `<button class="btn ghost" data-action="closeModal">Cancelar</button><button class="btn primary" data-action="purchSubmit">Registrar compra</button>`,
  };
});

// ---------------------------------------------------------------------------
function conciliacionTab() {
  const products = store.data.products.filter(p => p.active !== false).sort((a,b)=>a.name.localeCompare(b.name));
  const recent = [...store.data.adjustments].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0, 12);
  return `
    <div class="section-head"><div class="section-title">Teórico vs. físico</div><div class="small muted">Captura el conteo físico y el motivo de cada diferencia</div></div>
    ${tableWrap(`
      <thead><tr><th>Producto</th><th>Teórico</th><th>Físico</th><th>Motivo</th><th></th></tr></thead>
      <tbody>
        ${products.map(p => {
          const draft = ui.reconcileDraft[p.id] || { physical:'', reason: ADJUSTMENT_REASONS[0], note:'' };
          ui.reconcileDraft[p.id] = draft;
          const diff = draft.physical !== '' ? (Number(draft.physical) - (p.stock||0)) : null;
          return `<tr>
            <td class="bold small">${escapeHtml(p.name)}</td>
            <td class="num small">${stockLabel(p)}</td>
            <td style="min-width:110px"><input class="input" style="height:30px;padding:5px 8px" type="number" placeholder="conteo" value="${draft.physical}" data-oninput="recoField" data-id="${p.id}" data-f="physical"></td>
            <td style="min-width:170px">
              <select class="input" style="height:30px;padding:5px 8px" data-onchange="recoField" data-id="${p.id}" data-f="reason">
                ${ADJUSTMENT_REASONS.map(r => `<option ${r===draft.reason?'selected':''}>${r}</option>`).join('')}
              </select>
            </td>
            <td>
              ${diff !== null ? `<span class="pill ${diff<0?'danger':diff>0?'warn':'good'}" style="margin-right:6px">${diff>0?'+':''}${diff}</span>` : ''}
              <button class="btn sm" data-action="recoSubmit" data-id="${p.id}" ${draft.physical===''?'disabled':''}>Registrar</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    `)}
    <div class="section-head mt-24"><div class="section-title">Ajustes recientes</div></div>
    ${recent.length ? tableWrap(`
      <thead><tr><th>Fecha</th><th>Producto</th><th>Diferencia</th><th>Valor</th><th>Motivo</th><th>Usuario</th></tr></thead>
      <tbody>${recent.map(a => `<tr><td class="small">${fmtDateTime(a.date)}</td><td class="small bold">${escapeHtml(a.productName)}</td><td class="num small" style="color:${a.difference<0?'var(--danger)':'var(--good)'}">${a.difference>0?'+':''}${a.difference}</td><td class="num small">${money(a.valueDifference)}</td><td class="small muted">${escapeHtml(a.reason)}</td><td class="small muted">${escapeHtml(a.user)}</td></tr>`).join('')}</tbody>
    `) : emptyState('audit', 'Sin ajustes registrados todavía')}
  `;
}

registerActions({
  recoField(el) {
    const draft = ui.reconcileDraft[el.dataset.id] || { physical:'', reason: ADJUSTMENT_REASONS[0], note:'' };
    draft[el.dataset.f] = el.value;
    ui.reconcileDraft[el.dataset.id] = draft;
    requestRender();
  },
  async recoSubmit(el) {
    const id = el.dataset.id;
    const draft = ui.reconcileDraft[id];
    if (!draft || draft.physical === '') return;
    await reconcileProduct({ productId: id, physical: Number(draft.physical), reason: draft.reason, note: draft.note });
    delete ui.reconcileDraft[id];
    showToast('Conciliación registrada');
    requestRender();
  },
});

// ---------------------------------------------------------------------------
function movimientosTab() {
  const moves = [...store.data.movements].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0, 150);
  if (!moves.length) return emptyState('inventory', 'Sin movimientos todavía');
  return tableWrap(`
    <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Motivo</th><th>Usuario</th></tr></thead>
    <tbody>
      ${moves.map(m => `<tr>
        <td class="small">${fmtDateTime(m.date)}</td>
        <td class="small bold">${escapeHtml(m.productName)}</td>
        <td>${pill(MOVEMENT_LABEL[m.type]||m.type, m.qty<0?'danger':'good')}</td>
        <td class="num small">${m.qty>0?'+':''}${num(m.qty)}</td>
        <td class="small muted">${escapeHtml(m.reason||'—')}</td>
        <td class="small muted">${escapeHtml(m.user)}</td>
      </tr>`).join('')}
    </tbody>
  `);
}
