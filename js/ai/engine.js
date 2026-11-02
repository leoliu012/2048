// 2048 AI engine: expectimax search over a compact board encoding.
//
// A board is four 16-bit rows. Each row holds four 4-bit "ranks", where a
// rank r means the tile 2^r (0 = empty). Row y, column x lives in bits 4x..4x+3
// of rows[y]. Every possible row (65,536 of them) is pre-solved once, so a
// move is just four table lookups.
//
// The heuristic is the well-known one from nneonneo's 2048-ai: reward empty
// cells and adjacent equal tiles, penalise rows/columns that are not
// monotonic, and penalise large scattered tiles.

export const DIRECTIONS = ["up", "right", "down", "left"]; // matches game indices 0–3

const ROWS = 65536;
const rowLeft = new Uint16Array(ROWS);
const rowRight = new Uint16Array(ROWS);
const rowScore = new Uint32Array(ROWS); // points gained when the row slides
const rowHeur = new Float64Array(ROWS);

const LOST_PENALTY = 200000;
const MONO_POWER = 4;
const MONO_WEIGHT = 47;
const SUM_POWER = 3.5;
const SUM_WEIGHT = 11;
const MERGES_WEIGHT = 700;
const EMPTY_WEIGHT = 270;

const reverseRow = (row) =>
  ((row & 0xf) << 12) | ((row & 0xf0) << 4) | ((row >> 4) & 0xf0) | ((row >> 12) & 0xf);

(function buildTables() {
  const line = [0, 0, 0, 0];
  for (let row = 0; row < ROWS; row++) {
    for (let i = 0; i < 4; i++) line[i] = (row >> (4 * i)) & 0xf;

    // Heuristic
    let sum = 0, empty = 0, merges = 0, prev = 0, counter = 0;
    for (const rank of line) {
      sum += rank ** SUM_POWER;
      if (rank === 0) {
        empty++;
      } else {
        if (prev === rank) counter++;
        else if (counter > 0) { merges += 1 + counter; counter = 0; }
        prev = rank;
      }
    }
    if (counter > 0) merges += 1 + counter;
    let monoLeft = 0, monoRight = 0;
    for (let i = 1; i < 4; i++) {
      if (line[i - 1] > line[i]) monoLeft += line[i - 1] ** MONO_POWER - line[i] ** MONO_POWER;
      else monoRight += line[i] ** MONO_POWER - line[i - 1] ** MONO_POWER;
    }
    rowHeur[row] = LOST_PENALTY + EMPTY_WEIGHT * empty + MERGES_WEIGHT * merges
      - MONO_WEIGHT * Math.min(monoLeft, monoRight) - SUM_WEIGHT * sum;

    // Slide left
    const out = [];
    let score = 0;
    let lastMerged = false; // a freshly merged tile can't merge again this move
    for (const rank of line) {
      if (rank === 0) continue;
      if (out.length && out[out.length - 1] === rank && !lastMerged) {
        const merged = rank === 15 ? 15 : rank + 1;
        out[out.length - 1] = merged;
        score += 2 ** merged;
        lastMerged = true;
      } else {
        out.push(rank);
        lastMerged = false;
      }
    }
    let result = 0;
    out.forEach((rank, i) => { result |= rank << (4 * i); });
    rowLeft[row] = result;
    rowScore[row] = score;
  }
  for (let row = 0; row < ROWS; row++) {
    rowRight[row] = reverseRow(rowLeft[reverseRow(row)]);
  }
})();

// ---------------------------------------------------------------------------
// Board helpers

export function transpose(rows) {
  const t = [0, 0, 0, 0];
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      t[x] |= ((rows[y] >> (4 * x)) & 0xf) << (4 * y);
    }
  }
  return t;
}

/** Slide a board. Returns { rows, score } — rows is the same array when nothing moved. */
export function slide(rows, dir) {
  let out, score = 0;
  if (dir === 1 || dir === 3) {
    const table = dir === 3 ? rowLeft : rowRight;
    out = rows.map((r) => { score += rowScore[dir === 3 ? r : reverseRow(r)]; return table[r]; });
  } else {
    const cols = transpose(rows);
    const table = dir === 0 ? rowLeft : rowRight;
    const moved = cols.map((c) => { score += rowScore[dir === 0 ? c : reverseRow(c)]; return table[c]; });
    out = transpose(moved);
  }
  const changed = out.some((r, i) => r !== rows[i]);
  return { rows: changed ? out : rows, score, changed };
}

export function heuristic(rows) {
  const cols = transpose(rows);
  let h = 0;
  for (let i = 0; i < 4; i++) h += rowHeur[rows[i]] + rowHeur[cols[i]];
  return h;
}

export const rankAt = (rows, x, y) => (rows[y] >> (4 * x)) & 0xf;

function countEmpty(rows) {
  let n = 0;
  for (const r of rows) for (let x = 0; x < 4; x++) if (((r >> (4 * x)) & 0xf) === 0) n++;
  return n;
}

function distinctTiles(rows) {
  let mask = 0;
  for (const r of rows) for (let x = 0; x < 4; x++) mask |= 1 << ((r >> (4 * x)) & 0xf);
  mask >>= 1;
  let n = 0;
  while (mask) { n += mask & 1; mask >>= 1; }
  return n;
}

/** Convert the game's cells[x][y] grid of values (or null) into rows. */
export function fromCells(cells) {
  const rows = [0, 0, 0, 0];
  for (let x = 0; x < 4; x++) {
    for (let y = 0; y < 4; y++) {
      const v = cells[x][y];
      if (v) rows[y] |= Math.min(15, Math.log2(v)) << (4 * x);
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Expectimax

const PROB_CUTOFF = 0.0001;

class Search {
  constructor(depthLimit) {
    this.depthLimit = depthLimit;
    this.cache = new Map();
    this.nodes = 0;
  }

  key(rows) {
    // Two 32-bit halves → one string key (64-bit boards don't fit a JS number).
    return ((rows[0] << 16) | rows[1]) + ":" + ((rows[2] << 16) | rows[3]);
  }

  chance(rows, cprob, depth) {
    if (cprob < PROB_CUTOFF || depth >= this.depthLimit) {
      return heuristic(rows);
    }
    const k = this.key(rows);
    const hit = this.cache.get(k);
    if (hit && hit.depth <= depth) return hit.value;

    const empty = countEmpty(rows);
    const p = cprob / empty;
    let total = 0;
    for (let y = 0; y < 4; y++) {
      const r = rows[y];
      for (let x = 0; x < 4; x++) {
        if (((r >> (4 * x)) & 0xf) !== 0) continue;
        const with2 = rows.slice(); with2[y] = r | (1 << (4 * x));
        const with4 = rows.slice(); with4[y] = r | (2 << (4 * x));
        total += this.max(with2, p * 0.9, depth) * 0.9;
        total += this.max(with4, p * 0.1, depth) * 0.1;
      }
    }
    const value = total / empty;
    this.cache.set(k, { depth, value });
    return value;
  }

  max(rows, cprob, depth) {
    this.nodes++;
    let best = 0;
    for (let dir = 0; dir < 4; dir++) {
      const { rows: next, changed } = slide(rows, dir);
      if (!changed) continue;
      const v = this.chance(next, cprob, depth + 1);
      if (v > best) best = v;
    }
    return best;
  }
}

/**
 * Evaluate all four moves.
 * Returns [{ dir, legal, value, gained }] in direction order.
 */
export function evaluate(rows, { maxDepth = 6, minDepth = 2 } = {}) {
  const depthLimit = Math.max(minDepth, Math.min(maxDepth, distinctTiles(rows) - 2));
  const search = new Search(depthLimit);
  const results = [];
  for (let dir = 0; dir < 4; dir++) {
    const { rows: next, changed, score } = slide(rows, dir);
    results.push({
      dir,
      legal: changed,
      gained: score,
      value: changed ? search.chance(next, 1, 0) + 1e-6 : 0,
    });
  }
  return { results, depth: depthLimit, nodes: search.nodes };
}

// ---------------------------------------------------------------------------
// Turning numbers into advice a person can use

const CORNERS = [[0, 0], [3, 0], [0, 3], [3, 3]];

function maxTile(rows) {
  let best = { rank: 0, x: 0, y: 0 };
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const rank = rankAt(rows, x, y);
      // Prefer a corner when there are ties for the biggest tile
      const inCorner = CORNERS.some(([cx, cy]) => cx === x && cy === y);
      if (rank > best.rank || (rank === best.rank && rank > 0 && inCorner)) best = { rank, x, y };
    }
  }
  return { ...best, value: 2 ** best.rank, corner: CORNERS.some(([cx, cy]) => cx === best.x && cy === best.y) };
}

/** Values merged by a single slide, biggest first, e.g. [64, 8] meaning two 32s → 64, two 4s → 8. */
function mergesFor(rows, dir) {
  const lines = dir === 1 || dir === 3 ? rows : transpose(rows);
  const towardStart = dir === 3 || dir === 0;
  const made = [];
  for (const line of lines) {
    const ranks = [0, 1, 2, 3].map((i) => (line >> (4 * i)) & 0xf);
    const ordered = (towardStart ? ranks : ranks.reverse()).filter(Boolean);
    for (let i = 0; i < ordered.length - 1; i++) {
      if (ordered[i] === ordered[i + 1]) { made.push(2 ** (ordered[i] + 1)); i++; }
    }
  }
  return made.sort((a, b) => b - a);
}

function readyPairs(rows) {
  // Adjacent equal tiles: merges available on the next turn.
  let n = 0;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const r = rankAt(rows, x, y);
      if (!r) continue;
      if (x < 3 && rankAt(rows, x + 1, y) === r) n++;
      if (y < 3 && rankAt(rows, x, y + 1) === r) n++;
    }
  }
  return n;
}

const listMerges = (merges) => {
  const parts = merges.slice(0, 2).map((v) => `two ${v / 2}s`);
  return parts.join(" and ");
};

/**
 * Full hint for a board: ranked moves, a verdict per move, and a short
 * explanation of the best one (plus a warning about a tempting bad move).
 */
export function analyse(rows, options) {
  const { results, depth, nodes } = evaluate(rows, options);
  const legal = results.filter((r) => r.legal);
  if (!legal.length) return { best: null, moves: results, depth, nodes, reason: "No moves left.", warning: null };

  const bestValue = Math.max(...legal.map((r) => r.value));
  const before = maxTile(rows);
  const emptyBefore = countEmpty(rows);

  const moves = results.map((r) => {
    if (!r.legal) return { ...r, verdict: "blocked", strength: 0 };
    const gap = (bestValue - r.value) / bestValue;
    const verdict = gap === 0 ? "best" : gap < 0.01 ? "good" : gap < 0.05 ? "okay" : gap < 0.15 ? "risky" : "avoid";
    const next = slide(rows, r.dir).rows;
    return {
      ...r,
      gap,
      verdict,
      strength: Math.max(0.04, 1 - gap / 0.2),
      merges: mergesFor(rows, r.dir),
      after: maxTile(next),
      emptyAfter: countEmpty(next),
      pairsAfter: readyPairs(next),
    };
  });

  const best = moves.filter((m) => m.legal).sort((a, b) => b.value - a.value)[0];
  const runnerUp = moves.filter((m) => m.legal && m !== best).sort((a, b) => b.value - a.value)[0];

  // Why the best move is best
  const bits = [];
  if (best.merges.length) bits.push(`merges ${listMerges(best.merges)}`);
  if (before.rank >= 5) {
    if (best.after.corner && !before.corner) bits.push(`tucks your ${best.after.value} into a corner`);
    else if (best.after.corner && best.after.x === before.x && best.after.y === before.y) bits.push(`keeps your ${before.value} anchored in its corner`);
  }
  if (!best.merges.length) {
    if (best.pairsAfter > readyPairs(rows)) bits.push("lines tiles up for a merge next turn");
    else if (best.emptyAfter > emptyBefore) bits.push("frees up space");
    else bits.push("keeps your rows in order without breaking anything");
  }
  let reason = `${capital(DIRECTIONS[best.dir])} ${joinBits(bits)}.`;
  if (runnerUp && runnerUp.gap < 0.003) reason += ` ${capital(DIRECTIONS[runnerUp.dir])} is almost as good.`;
  if (legal.length === 1) reason = `${capital(DIRECTIONS[best.dir])} is the only move that works.`;

  // Warn about the worst move if it's a real trap
  let warning = null;
  const worst = moves.filter((m) => m.legal && m !== best).sort((a, b) => a.value - b.value)[0];
  if (worst && worst.verdict === "avoid") {
    let why = "it leaves the board badly tangled";
    if (before.corner && before.rank >= 5 && !worst.after.corner) why = `it pulls your ${before.value} out of the corner`;
    else if (worst.emptyAfter <= 2) why = "it leaves almost no room for new tiles";
    warning = `Avoid ${DIRECTIONS[worst.dir]}: ${why}.`;
  }

  return { best: best.dir, moves, depth, nodes, reason, warning };
}

const capital = (s) => s[0].toUpperCase() + s.slice(1);
const joinBits = (bits) =>
  bits.length <= 1 ? bits.join("") : bits.slice(0, -1).join(", ") + " and " + bits[bits.length - 1];
