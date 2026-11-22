// Applique une mise à jour multi-chemins façon Realtime Database :
// { 'players/abc/ready': true, 'game': {...} } ; null supprime la clé.
export function applyPatch(obj, patch) {
  const root = structuredClone(obj || {});
  for (const [path, value] of Object.entries(patch)) {
    const parts = path.split('/').filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {};
      node = node[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (value === null || value === undefined) delete node[last];
    else node[last] = structuredClone(value);
  }
  return root;
}
