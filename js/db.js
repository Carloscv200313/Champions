// ============================================================================
// db.js — capa de datos. Envuelve la capability `db` de Claude (Firestore-like)
// y expone colecciones en caché local + helpers CRUD sencillos.
//
// Diseño: al iniciar, nos suscribimos UNA vez a cada colección relevante.
// Cada snapshot actualiza store.data[coleccion] y dispara onChange().
// Los módulos de vista sólo leen store.data.* — nunca hablan con `db` directo,
// salvo las acciones de escritura que pasan por store.add/set/update/remove.
// ============================================================================

import { uid } from './helpers.js';

export const COLLECTIONS = [
  'products', 'recipes', 'purchases', 'movements', 'orders', 'accounts',
  'customers', 'users', 'auditLogs', 'adjustments',
  'tables',
];

class Store {
  constructor() {
    this.db = null;
    this.ready = false;
    this.online = false; // true cuando hay capability db real conectada
    this.data = Object.fromEntries(COLLECTIONS.map(c => [c, []]));
    this._listeners = new Set();
    this._unsubs = [];
    this._pending = false;
  }

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  _emit() {
    if (this._pending) return;
    this._pending = true;
    queueMicrotask(() => {
      this._pending = false;
      for (const fn of this._listeners) fn();
    });
  }

  async init() {
    let dbCap = null;
    try {
      if (window.claude && typeof window.claude.use === 'function') {
        dbCap = await window.claude.use('db');
      }
    } catch (e) { /* sin capability disponible */ }

    if (!dbCap) {
      this.online = false;
      this.ready = true;
      this._emit();
      return;
    }

    this.db = dbCap;
    this.online = true;
    for (const col of COLLECTIONS) {
      const unsub = this.db.collection(col).onSnapshot(
        (snap) => {
          this.data[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          this.ready = true;
          this._emit();
        },
        (err) => {
          console.warn('db error', col, err);
        }
      );
      this._unsubs.push(unsub);
    }
    // Si en 3s no ha llegado nada (colecciones vacías nunca disparan onSnapshot
    // con docs, pero sí disparan con size 0) igual marcamos ready por si acaso.
    setTimeout(() => { this.ready = true; this._emit(); }, 1500);
  }

  // -- escritura ---------------------------------------------------------
  async add(col, data) {
    const id = uid(col.slice(0, 3));
    const body = { ...data, createdAt: data.createdAt || new Date().toISOString() };
    if (this.online) {
      await this.db.collection(col).doc(id).set(body);
    } else {
      this.data[col] = [...this.data[col], { id, ...body }];
      this._emit();
    }
    return id;
  }

  async set(col, id, data) {
    if (this.online) {
      await this.db.collection(col).doc(id).set(data);
    } else {
      const idx = this.data[col].findIndex(d => d.id === id);
      const row = { id, ...data };
      if (idx >= 0) this.data[col][idx] = row; else this.data[col].push(row);
      this.data[col] = [...this.data[col]];
      this._emit();
    }
  }

  async update(col, id, patch) {
    if (this.online) {
      await this.db.collection(col).doc(id).update(patch);
    } else {
      const idx = this.data[col].findIndex(d => d.id === id);
      if (idx >= 0) {
        this.data[col][idx] = deepMerge(this.data[col][idx], patch);
        this.data[col] = [...this.data[col]];
        this._emit();
      }
    }
  }

  async remove(col, id) {
    if (this.online) {
      await this.db.collection(col).doc(id).delete();
    } else {
      this.data[col] = this.data[col].filter(d => d.id !== id);
      this._emit();
    }
  }

  get(col, id) { return this.data[col].find(d => d.id === id); }
}

function deepMerge(base, patch) {
  const out = { ...base };
  for (const k in patch) {
    if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], patch[k]);
    } else {
      out[k] = patch[k];
    }
  }
  return out;
}

export const store = new Store();
