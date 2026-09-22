// ============================================================================
// views/recipes.js — recetas de bebidas preparadas: ingredientes y descuento
// automático de insumos al vender.
// ============================================================================
import { store } from '../db.js';
import { ui, requestRender, openModal, closeModal, showToast, createRecipe, updateRecipe } from '../state.js';
import { registerActions } from '../actions.js';
import { registerRoute } from '../routes.js';
import { registerModal } from '../modals.js';
import { layout, tableWrap, pill, emptyState } from '../ui.js';
import { icon } from '../icons.js';
import { money, escapeHtml, CATEGORIES, CATEGORY_LABEL, uid, sum } from '../helpers.js';

function recipeCost(r) {
  return sum(r.ingredients || [], ing => {
    const p = store.get('products', ing.productId);
    return (p?.costPerBaseUnit || 0) * ing.qty;
  });
}

function render() {
  const recipes = [...store.data.recipes].sort((a,b)=>a.name.localeCompare(b.name));
  const content = recipes.length ? tableWrap(`
    <thead><tr><th>Receta</th><th>Categoría</th><th>Ingredientes</th><th>Costo est.</th><th>Precio</th><th>Margen</th><th></th></tr></thead>
    <tbody>
      ${recipes.map(r => {
        const cost = recipeCost(r);
        const margin = r.price ? ((r.price - cost) / r.price) * 100 : 0;
        return `<tr class="${r.active===false?'faint':''}">
          <td class="bold">${escapeHtml(r.name)} ${r.favorite ? icon('starFilled','ic') : ''}</td>
          <td class="small muted">${CATEGORY_LABEL[r.category]||r.category}</td>
          <td class="small muted">${(r.ingredients||[]).map(i=>i && store.get('products',i.productId)?.name).filter(Boolean).join(', ')||'—'}</td>
          <td class="num small">${money(cost)}</td>
          <td class="num small">${money(r.price)}</td>
          <td class="num small" style="color:${margin>50?'var(--good)':margin>20?'var(--warn)':'var(--danger)'}">${margin.toFixed(0)}%</td>
          <td><button class="icon-btn" data-action="recEditOpen" data-id="${r.id}">${icon('edit','ic')}</button></td>
        </tr>`;
      }).join('')}
    </tbody>
  `) : emptyState('recipes', 'Aún no hay recetas', 'Crea recetas como Paloma, Margarita o Mojito y el sistema descontará los insumos automáticamente al venderse.');

  return layout(content, {
    title: 'Recetas', sub: 'Ingredientes por bebida y descuento automático de insumos',
    actions: `<button class="btn primary" data-action="recNewOpen">${icon('plus','ic')} Nueva receta</button>`,
  });
}
registerRoute('recipes', render);

function emptyIngredient() { return { id: uid('ing'), productId: store.data.products[0]?.id || '', qty: '' }; }

registerActions({
  recNewOpen() { openModal({ type: 'recipeForm', mode:'new', data: { name:'', category:'cocteles', price:'', favorite:false, active:true }, ingredients: [emptyIngredient()] }); },
  recEditOpen(el) {
    const r = store.get('recipes', el.dataset.id);
    openModal({ type: 'recipeForm', mode:'edit', id:r.id, data: { name:r.name, category:r.category, price:r.price, favorite:!!r.favorite, active:r.active!==false }, ingredients: (r.ingredients||[]).map(i=>({ id: uid('ing'), ...i })) });
  },
  recField(el) { const m = ui.modal; if (!m) return; m.data[el.dataset.f] = el.type==='checkbox' ? el.checked : el.value; },
  recAddIngredient() { ui.modal.ingredients.push(emptyIngredient()); requestRender(); },
  recRemoveIngredient(el) { ui.modal.ingredients = ui.modal.ingredients.filter(i=>i.id!==el.dataset.id); requestRender(); },
  recIngField(el) {
    const row = ui.modal.ingredients.find(i=>i.id===el.dataset.id);
    if (!row) return;
    row[el.dataset.f] = el.value;
    if (el.dataset.f === 'productId') requestRender();
  },
  async recSubmit() {
    const m = ui.modal;
    if (!m.data.name.trim()) { showToast('Escribe un nombre', 'danger'); return; }
    const ingredients = m.ingredients.filter(i=>i.productId && Number(i.qty) > 0).map(i=>({ productId: i.productId, qty: Number(i.qty) }));
    if (!ingredients.length) { showToast('Agrega al menos un ingrediente', 'danger'); return; }
    const payload = { name: m.data.name.trim(), category: m.data.category, price: Number(m.data.price)||0, favorite: !!m.data.favorite, ingredients };
    if (m.mode === 'new') await createRecipe(payload);
    else await updateRecipe(m.id, { ...payload, active: m.data.active !== false });
    showToast('Receta guardada');
    closeModal();
  },
  async recToggleActive() {
    const m = ui.modal;
    const newActive = !(m.data.active !== false);
    await updateRecipe(m.id, { active: newActive });
    closeModal();
  },
});

registerModal('recipeForm', (m) => {
  const d = m.data;
  const cost = sum(m.ingredients, i => (store.get('products', i.productId)?.costPerBaseUnit || 0) * (Number(i.qty)||0));
  return {
    wide: true,
    title: m.mode === 'new' ? 'Nueva receta' : 'Editar receta',
    body: `
      <div class="field-row">
        <label class="field">Nombre<input class="input" value="${escapeHtml(d.name)}" data-oninput="recField" data-f="name" placeholder="Ej. Paloma"></label>
        <label class="field">Categoría
          <select class="input" data-onchange="recField" data-f="category">
            ${CATEGORIES.filter(c=>['preparados','cocteles','shots','otros'].includes(c.id)).map(c => `<option value="${c.id}" ${c.id===d.category?'selected':''}>${c.label}</option>`).join('')}
          </select>
        </label>
        <label class="field">Precio de venta<input class="input" type="number" min="0" value="${d.price}" data-oninput="recField" data-f="price"></label>
      </div>
      <div class="section-title">Ingredientes</div>
      <div class="col" style="gap:8px">
        ${m.ingredients.map(i => {
          const p = store.get('products', i.productId);
          return `<div class="field-row" style="align-items:flex-end">
            <label class="field" style="flex:2">Insumo
              <select class="input" data-onchange="recIngField" data-id="${i.id}" data-f="productId">
                ${store.data.products.filter(x=>x.active!==false).map(x => `<option value="${x.id}" ${x.id===i.productId?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}
              </select>
            </label>
            <label class="field">Cantidad (${p?.saleUnit==='ml'?'ml':'pzas'})<input class="input" type="number" min="0" value="${i.qty}" data-oninput="recIngField" data-id="${i.id}" data-f="qty"></label>
            <button class="icon-btn" data-action="recRemoveIngredient" data-id="${i.id}">${icon('trash','ic')}</button>
          </div>`;
        }).join('')}
      </div>
      <button class="btn sm" data-action="recAddIngredient">${icon('plus','ic')} Agregar ingrediente</button>
      <div class="flex between">
        <label class="checkbox-row"><input type="checkbox" ${d.favorite?'checked':''} data-onchange="recField" data-f="favorite"> Favorito en el POS</label>
        <div class="small muted">Costo estimado: <b class="num">${money(cost)}</b>${d.price ? ` · margen ${(((Number(d.price)-cost)/Number(d.price))*100).toFixed(0)}%` : ''}</div>
      </div>
    `,
    foot: m.mode === 'edit'
      ? `<button class="btn danger" data-action="recToggleActive">${d.active!==false?'Desactivar':'Reactivar'}</button><button class="btn primary" data-action="recSubmit">Guardar</button>`
      : `<button class="btn ghost" data-action="closeModal">Cancelar</button><button class="btn primary" data-action="recSubmit">Crear receta</button>`,
  };
});
