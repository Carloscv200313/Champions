// ============================================================================
// mockdb.js — SOLO para pruebas locales con Playwright. Simula la capability
// `db` (subconjunto usado por la app) en memoria, para poder recorrer los
// flujos de negocio sin publicar el artifact. No se publica con la app real.
// ============================================================================
(function () {
  const collections = {}; // path -> { docs: Map(id -> obj), listeners: Set(fn) }

  function col(path) {
    if (!collections[path]) collections[path] = { docs: new Map(), listeners: new Set() };
    return collections[path];
  }

  function snapshotFor(path) {
    const c = col(path);
    const docs = [...c.docs.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([id, data]) => ({ id, exists: true, data: () => data, metadata: { fromCache: false, hasPendingWrites: false } }));
    return { docs, size: docs.length, empty: docs.length === 0, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
  }

  function notify(path) {
    const c = col(path);
    const snap = snapshotFor(path);
    for (const fn of c.listeners) {
      try { fn(snap); } catch (e) { console.error(e); }
    }
  }

  function deepMerge(base, patch) {
    const out = { ...base };
    for (const k in patch) {
      if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        out[k] = deepMerge(base[k], patch[k]);
      } else out[k] = patch[k];
    }
    return out;
  }

  function docRef(path, id) {
    return {
      id, path: `${path}/${id}`,
      get: async () => {
        const c = col(path);
        const data = c.docs.get(id);
        return { id, exists: !!data, data: () => data, metadata: { fromCache: false, hasPendingWrites: false } };
      },
      set: async (data) => { col(path).docs.set(id, { ...data }); queueMicrotask(() => notify(path)); },
      update: async (patch) => {
        const c = col(path);
        const curr = c.docs.get(id) || {};
        c.docs.set(id, deepMerge(curr, patch));
        queueMicrotask(() => notify(path));
      },
      delete: async () => { col(path).docs.delete(id); queueMicrotask(() => notify(path)); },
      onSnapshot: (next) => { const wrap = (snap) => { const d = snap.docs.find(x => x.id === id); next(d || { id, exists: false, data: () => undefined }); }; col(path).listeners.add(wrap); wrap(snapshotFor(path)); return () => col(path).listeners.delete(wrap); },
      collection: (sub) => collectionRef(`${path}/${id}/${sub}`),
    };
  }

  function collectionRef(path) {
    return {
      path,
      doc: (id) => docRef(path, id || Math.random().toString(36).slice(2)),
      add: async (data) => { const id = Math.random().toString(36).slice(2); await docRef(path, id).set(data); return docRef(path, id); },
      where() { return this; }, orderBy() { return this; }, limit() { return this; },
      get: async () => snapshotFor(path),
      onSnapshot: (next, err) => { col(path).listeners.add(next); next(snapshotFor(path)); return () => col(path).listeners.delete(next); },
    };
  }

  const db = { doc: (p) => { const parts = p.split('/'); const id = parts.pop(); return docRef(parts.join('/'), id); }, collection: (p) => collectionRef(p) };

  window.__mockDb = db;
  window.claude = { use: async (name) => (name === 'db' ? db : null) };
})();
