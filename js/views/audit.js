// ============================================================================
// views/audit.js — bitácora de auditoría: quién hizo qué y cuándo.
// ============================================================================
import { store } from '../db.js';
import { ui, requestRender } from '../state.js';
import { registerActions } from '../actions.js';
import { registerRoute } from '../routes.js';
import { layout, tableWrap, emptyState } from '../ui.js';
import { escapeHtml, fmtDateTime } from '../helpers.js';

if (!ui.auditFilter) ui.auditFilter = 'todos';

const ENTITY_LABEL = { order:'Venta', account:'Cuenta', product:'Producto', recipe:'Receta', purchase:'Compra', customer:'Cliente', user:'Usuario' };

function render() {
  const filter = ui.auditFilter;
  let logs = [...store.data.auditLogs].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if (filter !== 'todos') logs = logs.filter(l => l.entity === filter);
  logs = logs.slice(0, 300);

  const entities = ['todos', ...new Set(store.data.auditLogs.map(l=>l.entity).filter(Boolean))];

  const content = `
    <div class="flex wrap mb-16" style="gap:6px">
      ${entities.map(e => `<button class="btn sm ${filter===e?'primary':''}" data-action="auditSetFilter" data-f="${e}">${e==='todos'?'Todos':(ENTITY_LABEL[e]||e)}</button>`).join('')}
    </div>
    ${logs.length ? tableWrap(`
      <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
      <tbody>
        ${logs.map(l => `<tr>
          <td class="small muted">${fmtDateTime(l.date)}</td>
          <td class="small bold">${escapeHtml(l.userName)}</td>
          <td class="small">${escapeHtml(l.action)}</td>
          <td class="small muted">${escapeHtml(l.details||'')}</td>
        </tr>`).join('')}
      </tbody>
    `) : emptyState('audit', 'Sin actividad registrada todavía')}
  `;
  return layout(content, { title: 'Auditoría', sub: 'Registro de acciones sensibles para evitar cambios sin rastro' });
}
registerRoute('audit', render);

registerActions({
  auditSetFilter(el) { ui.auditFilter = el.dataset.f; requestRender(); },
});
