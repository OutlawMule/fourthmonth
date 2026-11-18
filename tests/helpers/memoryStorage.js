// A localStorage stand-in for tests. `failWrites` simulates a full or blocked browser store.
export function memoryStorage({ failWrites = false } = {}) {
  const map = new Map();
  const s = {
    failWrites,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem(k, v) { if (s.failWrites) throw new Error('QuotaExceededError'); map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    dump: () => JSON.stringify([...map.entries()]),
    keys: () => [...map.keys()],
  };
  return s;
}
