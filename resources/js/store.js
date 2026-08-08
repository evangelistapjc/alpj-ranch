// ===========================================================================
// store.js — the persistence primitive, and nothing else.
//
// Split out of state.js so sync.js can reach storage without importing state
// (state imports sync, and a cycle between them would leave one of the two
// half-initialised at module-evaluation time).
//
// Never throws: Safari private mode and a full quota both make localStorage
// raise on write, so every path falls back to an in-memory object. `persists`
// is false in that case, which is what triggers the "preview mode" toast.
// ===========================================================================
export const Store = (() => {
  let mem = {}, ok = false;
  try { const k='__alpj__'; localStorage.setItem(k,'1'); localStorage.removeItem(k); ok = true; } catch (e) {}
  return {
    get(k){ try { return ok ? JSON.parse(localStorage.getItem(k) || 'null') : (mem[k] ?? null); } catch (e) { return mem[k] ?? null; } },
    set(k,v){ try { ok ? localStorage.setItem(k, JSON.stringify(v)) : (mem[k]=v); } catch (e) { mem[k]=v; } },
    del(k){ try { ok ? localStorage.removeItem(k) : (delete mem[k]); } catch (e) { delete mem[k]; } },
    persists: ok
  };
})();
