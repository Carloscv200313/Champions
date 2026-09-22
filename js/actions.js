// Registro central de acciones (data-action="nombre") — cada vista añade las
// suyas con registerActions(). main.js despacha por nombre.
export const ACTIONS = {};
export function registerActions(obj) { Object.assign(ACTIONS, obj); }
