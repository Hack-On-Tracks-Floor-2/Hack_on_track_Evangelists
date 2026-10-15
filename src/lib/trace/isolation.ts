// Deterministic Isolation Forest for unsupervised transaction anomaly scoring.
// No labels are used at any point. Seeded RNG => reproducible training runs.

export interface ForestOptions {
  trees: number;
  sample: number;
  seed: number;
  maxDepth?: number;
}

interface INode {
  feature: number;
  split: number;
  left: number; // index into nodes, -1 = leaf
  right: number;
  size: number;
}

export interface Forest {
  nodes: INode[];
  roots: number[];
  sample: number;
  seed: number;
  dim: number;
  norm: number; // c(psi) normalization
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cFactor(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
}

export function trainForest(X: number[][], opts: ForestOptions): Forest {
  const rnd = mulberry32(opts.seed);
  const n = X.length;
  const dim = X[0]?.length ?? 0;
  const psi = Math.max(2, Math.min(opts.sample, n));
  const maxDepth = opts.maxDepth ?? Math.ceil(Math.log2(psi)) + 1;
  const nodes: INode[] = [];
  const roots: number[] = [];

  function build(idx: number[], depth: number): number {
    const at = nodes.length;
    nodes.push({ feature: -1, split: 0, left: -1, right: -1, size: idx.length });
    if (idx.length <= 1 || depth >= maxDepth || dim === 0) return at;
    // find a feature with spread (try a few)
    let f = -1;
    let mn = 0;
    let mx = 0;
    const start = Math.floor(rnd() * dim);
    for (let k = 0; k < dim; k++) {
      const ff = (start + k) % dim;
      mn = Infinity;
      mx = -Infinity;
      for (const i of idx) {
        const v = X[i][ff];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      if (mx > mn) { f = ff; break; }
    }
    if (f < 0) return at; // constant subspace => leaf
    const split = mn + rnd() * (mx - mn);
    const L: number[] = [];
    const R: number[] = [];
    for (const i of idx) {
      if (X[i][f] < split) L.push(i);
      else R.push(i);
    }
    if (L.length === 0 || R.length === 0) return at; // degenerate => leaf
    const node = nodes[at];
    node.feature = f;
    node.split = split;
    node.left = build(L, depth + 1);
    node.right = build(R, depth + 1);
    return at;
  }

  for (let t = 0; t < opts.trees; t++) {
    // sample psi distinct indices
    const pool = new Set<number>();
    while (pool.size < psi) pool.add(Math.floor(rnd() * n));
    roots.push(build([...pool], 0));
  }

  return { nodes, roots, sample: psi, seed: opts.seed, dim, norm: cFactor(psi) || 1 };
}

function pathLength(nodes: INode[], root: number, x: number[]): number {
  let depth = 0;
  let cur = root;
  for (;;) {
    const nd = nodes[cur];
    if (nd.left < 0 || nd.feature < 0) return depth + cFactor(nd.size);
    cur = x[nd.feature] < nd.split ? nd.left : nd.right;
    depth++;
    if (depth > 64) return depth;
  }
}

export function scoreForest(F: Forest, X: number[][]): number[] {
  const m = F.roots.length || 1;
  return X.map((x) => {
    let total = 0;
    for (const r of F.roots) total += pathLength(F.nodes, r, x);
    return Math.pow(2, -(total / m) / F.norm);
  });
}
