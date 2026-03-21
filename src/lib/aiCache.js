// Persistent AI response cache — survives page refreshes, invalidates daily
const TODAY = new Date().toISOString().slice(0, 10);
const LS_PREFIX = `ai-cache-${TODAY}-`;

// Clean up old days on load
try {
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith('ai-cache-') && !k.startsWith(LS_PREFIX)) {
      localStorage.removeItem(k);
    }
  });
} catch (e) { /* storage unavailable */ }

export function getCached(namespace, key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + namespace + '-' + key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function setCache(namespace, key, value) {
  try {
    localStorage.setItem(LS_PREFIX + namespace + '-' + key, JSON.stringify(value));
  } catch (e) { /* quota */ }
}
