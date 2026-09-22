// ============================================================================
// ui.js — layout shell, componentes reutilizables (kpi, pill, tabla, modal,
// toast) y el shell de navegación.
// ============================================================================
import { icon } from './icons.js';
import { session, ui, logout } from './state.js';
import { initials, avatarColor, ROLE_LABEL, escapeHtml } from './helpers.js';

export const NAV_ITEMS = [
  { route: 'dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['admin','gerente','supervisor'] },
  { route: 'orders',    label: 'Mis mesas', icon: 'table', roles: ['admin','gerente','supervisor','cajero','mesero'] },
  { route: 'accounts',  label: 'Cuentas', icon: 'accounts', roles: ['admin','gerente','supervisor','cajero'] },
  { route: 'customers', label: 'Clientes', icon: 'customers', roles: ['admin','gerente','supervisor','cajero'] },
  { route: 'inventory', label: 'Inventario', icon: 'inventory', roles: ['admin','gerente','supervisor'] },
  { route: 'recipes',   label: 'Recetas', icon: 'recipes', roles: ['admin','gerente'] },
  { route: 'reports',   label: 'Reportes', icon: 'reports', roles: ['admin','gerente'] },
  { route: 'audit',     label: 'Auditoría', icon: 'audit', roles: ['admin','gerente'] },
  { route: 'settings',  label: 'Configuración', icon: 'settings', roles: ['admin'] },
];

export function allowedNav() {
  const role = session.currentUser?.role;
  return NAV_ITEMS.filter(n => n.roles.includes(role));
}

export function routeAllowed(route) {
  const item = NAV_ITEMS.find(n => n.route === route);
  if (!item) return true;
  return item.roles.includes(session.currentUser?.role);
}

function avatar(name, size = 30) {
  return `<div class="avatar" style="width:${size}px;height:${size}px;background:${avatarColor(name)}">${initials(name)}</div>`;
}
export { avatar };

export function layout(content, { title = '', sub = '', actions = '', fullBleed = false } = {}) {
  const nav = allowedNav();
  const u = session.currentUser;
  return `
  <div class="shell">
    <div class="sidebar-scrim ${ui.sidebarOpen ? 'show' : ''}" data-action="closeSidebar"></div>
    <aside class="sidebar ${ui.sidebarOpen ? 'open' : ''}">
      <div class="sidebar-brand">
        <div class="sidebar-brand-mark">C</div>
        <div>
          <div class="sidebar-brand-text">Champions</div>
          <div class="sidebar-brand-sub">Control de barra</div>
        </div>
      </div>
      <nav class="col" style="gap:2px">
        ${nav.map(n => `
          <button class="nav-item ${ui.route === n.route ? 'active' : ''}" data-action="go" data-route="${n.route}">
            ${icon(n.icon)}<span>${n.label}</span>
          </button>`).join('')}
      </nav>
      <div class="sidebar-foot">
        <div class="user-chip" data-action="openUserMenu">
          ${avatar(u?.name)}
          <div class="user-chip-meta">
            <div class="user-chip-name">${escapeHtml(u?.name || '')}</div>
            <div class="user-chip-role">${ROLE_LABEL[u?.role] || ''}</div>
          </div>
          <button class="icon-btn" style="margin-left:auto" data-action="logout" title="Cerrar sesión">${icon('logout')}</button>
        </div>
      </div>
    </aside>
    <div class="main">
      <div class="topbar">
        <button class="hamburger" data-action="toggleSidebar">${icon('menu')}</button>
        <div class="topbar-title">${title}</div>
      </div>
      ${fullBleed ? content : `<div class="page">
        ${title ? `<div class="page-head">
          <div>
            <div class="page-title">${title}</div>
            ${sub ? `<div class="page-sub">${sub}</div>` : ''}
          </div>
          ${actions ? `<div class="page-actions">${actions}</div>` : ''}
        </div>` : ''}
        ${content}
      </div>`}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// componentes
// ---------------------------------------------------------------------------
export function kpi({ label, value, sub = '', delta = null }) {
  let deltaHtml = '';
  if (delta !== null && delta !== undefined && Number.isFinite(delta)) {
    const tone = delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'flat';
    const arrow = tone === 'up' ? '↑' : tone === 'down' ? '↓' : '·';
    deltaHtml = `<span class="delta ${tone}">${arrow} ${Math.abs(delta).toFixed(0)}%</span>`;
  }
  return `<div class="kpi">
    <div class="kpi-label">${label}</div>
    <div class="kpi-value num">${value}</div>
    <div class="kpi-sub">${deltaHtml} <span>${sub}</span></div>
  </div>`;
}

export function pill(text, tone = 'neutral') {
  return `<span class="pill ${tone}"><span class="dot"></span>${text}</span>`;
}

export function emptyState(iconName, title, sub = '') {
  return `<div class="empty">${icon(iconName, 'ic')}<div style="font-weight:700;color:var(--text)">${title}</div>${sub ? `<div class="small">${sub}</div>` : ''}</div>`;
}

export function tableWrap(inner) { return `<div class="table-wrap"><table class="tbl">${inner}</table></div>`; }

export function toastHtml() {
  if (!ui.toast) return '';
  return `<div class="toast ${ui.toast.tone === 'danger' ? 'danger' : ''}">${icon(ui.toast.tone === 'danger' ? 'alert' : 'check')}${escapeHtml(ui.toast.text)}</div>`;
}
