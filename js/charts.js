// ============================================================================
// charts.js — SVG minimalista, consciente del tema (usa var(--...)).
// Sin librerías: suficiente para tendencias y comparativas de un POS.
// ============================================================================
import { money, num } from './helpers.js';

export function lineChart(points, { width = 640, height = 160, fmt = money, pad = 28 } = {}) {
  if (!points.length) return `<div class="empty small">Sin datos suficientes</div>`;
  const max = Math.max(1, ...points.map(p => p.total));
  const stepX = (width - pad * 2) / Math.max(1, points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = height - pad - (p.total / max) * (height - pad * 2 - 10);
    return { x, y, ...p };
  });
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${height - pad} L${coords[0].x.toFixed(1)},${height - pad} Z`;
  const last = coords[coords.length - 1];
  const gridY = [0.25, 0.5, 0.75, 1].map(f => height - pad - f * (height - pad * 2 - 10));
  const showLabels = points.length <= 16;
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet">
    ${gridY.map(y => `<line x1="${pad}" y1="${y.toFixed(1)}" x2="${width - pad}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`).join('')}
    <path d="${area}" fill="var(--accent)" opacity="0.12" stroke="none"/>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>
    ${coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2" fill="var(--accent)" opacity="0.55"/>`).join('')}
    <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="4" fill="var(--accent)"/>
    <text x="${last.x.toFixed(1)}" y="${(last.y - 10).toFixed(1)}" text-anchor="end" font-size="11" font-weight="700" fill="var(--text)">${fmt(last.total)}</text>
    ${showLabels ? coords.filter((_, i) => i % Math.ceil(coords.length / 7 || 1) === 0).map(c => `<text x="${c.x.toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="10">${c.date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</text>`).join('') : ''}
  </svg>`;
}

export function barChart(rows, { width = 640, height = 180, fmt = money, pad = 30, color = 'var(--accent)' } = {}) {
  if (!rows.length) return `<div class="empty small">Sin datos suficientes</div>`;
  const max = Math.max(1, ...rows.map(r => r.value));
  const gap = 10;
  const barW = (width - pad * 2 - gap * (rows.length - 1)) / rows.length;
  const gridY = [0.25, 0.5, 0.75, 1].map(f => height - pad - f * (height - pad * 2 - 14));
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet">
    ${gridY.map(y => `<line x1="${pad}" y1="${y.toFixed(1)}" x2="${width - pad}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`).join('')}
    ${rows.map((r, i) => {
      const x = pad + i * (barW + gap);
      const h = (r.value / max) * (height - pad * 2 - 14);
      const y = height - pad - h;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1,h).toFixed(1)}" rx="4" fill="${r.color || color}" opacity="${r.dim ? 0.35 : 1}"/>
      <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--text)">${fmt(r.value)}</text>
      <text x="${(x + barW / 2).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="10.5">${r.label}</text>`;
    }).join('')}
  </svg>`;
}

export function miniBars(values, { width = 120, height = 32, color = 'var(--accent)' } = {}) {
  if (!values.length) return '';
  const max = Math.max(1, ...values);
  const gap = 2;
  const barW = (width - gap * (values.length - 1)) / values.length;
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    ${values.map((v, i) => {
      const h = Math.max(1, (v / max) * height);
      return `<rect x="${(i * (barW + gap)).toFixed(1)}" y="${(height - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${color}" opacity="${i === values.length - 1 ? 1 : 0.4}"/>`;
    }).join('')}
  </svg>`;
}
