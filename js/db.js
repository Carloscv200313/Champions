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
      this.seedDemoData();
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

  seedDemoData() {
    const now = new Date().toISOString();
    if (!this.data.users.length) {
      this.data.users = [
        { id: 'u_admin', name: 'Francisco', pin: '1234', role: 'admin', active: true, createdAt: now },
        { id: 'u_gerente', name: 'Ana', pin: '1234', role: 'gerente', active: true, createdAt: now },
        { id: 'u_super', name: 'Marta', pin: '1234', role: 'supervisor', active: true, createdAt: now },
        { id: 'u_cajero', name: 'Luis', pin: '1234', role: 'cajero', active: true, createdAt: now },
        { id: 'u_mesero', name: 'Pepe', pin: '1234', role: 'mesero', active: true, createdAt: now },
      ];
    }
    if (!this.data.products.length) {
      this.data.products = [
        { id: 'p_corona', name: 'Corona', category: 'cerveza', saleUnit: 'pieza', price: 45, costPerBaseUnit: 20, stock: 120, lowStockThreshold: 24, favorite: true, sellable: true, active: true, createdAt: now },
        { id: 'p_indio', name: 'Indio', category: 'cerveza', saleUnit: 'pieza', price: 40, costPerBaseUnit: 15, stock: 8, lowStockThreshold: 24, favorite: false, sellable: true, active: true, createdAt: now },
        { id: 'p_tequila', name: 'Tequila Jose Cuervo', category: 'tequila', saleUnit: 'ml', price: 0, costPerBaseUnit: 0.56, stock: 7500, lowStockThreshold: 750, bottleSizeMl: 750, favorite: false, sellable: false, active: true, createdAt: now },
        { id: 'p_whisky', name: "Whisky Buchanan's", category: 'whisky', saleUnit: 'ml', price: 0, costPerBaseUnit: 1.1, stock: 700, lowStockThreshold: 700, bottleSizeMl: 700, favorite: false, sellable: false, active: true, createdAt: now },
        { id: 'p_vodka', name: 'Vodka Absolut', category: 'vodka', saleUnit: 'ml', price: 0, costPerBaseUnit: 0.5, stock: 750, lowStockThreshold: 700, bottleSizeMl: 750, favorite: false, sellable: false, active: true, createdAt: now },
        { id: 'p_refresco_lata', name: 'Refresco de toronja (lata)', category: 'refrescos', saleUnit: 'pieza', price: 30, costPerBaseUnit: 10, stock: 60, lowStockThreshold: 12, favorite: false, sellable: true, active: true, createdAt: now },
        { id: 'p_refresco_garrafa', name: 'Refresco de toronja (garrafa)', category: 'refrescos', saleUnit: 'ml', price: 0, costPerBaseUnit: 0.04, stock: 6000, lowStockThreshold: 1000, bottleSizeMl: 3000, favorite: false, sellable: false, active: true, createdAt: now },
        { id: 'p_agua', name: 'Agua mineral', category: 'agua', saleUnit: 'pieza', price: 25, costPerBaseUnit: 8, stock: 40, lowStockThreshold: 12, favorite: false, sellable: true, active: true, createdAt: now },
        { id: 'p_limon', name: 'Limon', category: 'otros', saleUnit: 'pieza', price: 0, costPerBaseUnit: 2, stock: 200, lowStockThreshold: 20, favorite: false, sellable: false, active: true, createdAt: now },
        { id: 'p_hielo', name: 'Hielo (porcion)', category: 'otros', saleUnit: 'pieza', price: 0, costPerBaseUnit: 3, stock: 300, lowStockThreshold: 30, favorite: false, sellable: false, active: true, createdAt: now },
      ];
    }
    if (!this.data.recipes.length) {
      this.data.recipes = [
        { id: 'r_paloma', name: 'Paloma', category: 'tequila', price: 70, favorite: true, active: true, createdAt: now, ingredients: [{ productId: 'p_tequila', qty: 50 }, { productId: 'p_refresco_garrafa', qty: 150 }, { productId: 'p_limon', qty: 1 }, { productId: 'p_hielo', qty: 1 }] },
        { id: 'r_margarita', name: 'Margarita', category: 'tequila', price: 90, favorite: true, active: true, createdAt: now, ingredients: [{ productId: 'p_tequila', qty: 60 }, { productId: 'p_limon', qty: 2 }, { productId: 'p_hielo', qty: 1 }] },
        { id: 'r_shot_tequila', name: 'Shot de tequila', category: 'tequila', price: 55, favorite: true, active: true, createdAt: now, ingredients: [{ productId: 'p_tequila', qty: 30 }] },
      ];
    }
  }
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
