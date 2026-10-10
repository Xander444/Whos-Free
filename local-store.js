(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WhosFreeStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function createStore(adapters) {
    let backend = "checking";
    const stamp = record => Date.parse(record?.savedAt || record?.meta?.importedAt || "") || 0;
    return {
      get backend() { return backend; },
      async read() {
        let primary = null, fallback = null, primaryOk = false;
        try { primary = await adapters.readPrimary(); primaryOk = true; } catch { /* fallback below */ }
        try { fallback = await adapters.readFallback(); } catch { /* best effort */ }
        if (fallback && (!primary || stamp(fallback) > stamp(primary))) {
          backend = "localstorage";
          try {
            await adapters.writePrimary(fallback);
            backend = "indexeddb";
            await adapters.deleteFallback();
          } catch { /* the fallback remains authoritative */ }
          return fallback;
        }
        backend = primaryOk ? "indexeddb" : "memory";
        return primary;
      },
      async save(record) {
        const saved = { ...record, savedAt: new Date().toISOString() };
        try {
          await adapters.writePrimary(saved);
          backend = "indexeddb";
          try { await adapters.deleteFallback(); } catch { /* older fallback is harmless */ }
          return saved;
        } catch { /* fallback below */ }
        try { await adapters.writeFallback(saved); backend = "localstorage"; return saved; }
        catch { backend = "memory"; throw new Error("Could not save on this device. Keep a downloaded backup; changes currently last only until this page closes."); }
      },
      async remove() {
        let primaryError, fallbackError;
        try { await adapters.deletePrimary(); } catch (error) { primaryError = error; }
        try { await adapters.deleteFallback(); } catch (error) { fallbackError = error; }
        // A failed delete is safe only when that storage has no readable record.
        if (primaryError) { try { if (await adapters.readPrimary()) throw primaryError; } catch { throw new Error("Could not remove the IndexedDB copy. Try again before closing the app."); } }
        if (fallbackError) { try { if (await adapters.readFallback()) throw fallbackError; } catch { throw new Error("Could not remove the backup copy. Try again before closing the app."); } }
      },
    };
  }
  return { createStore };
});
