// The Night Archive's one level: a night museum archive, drawn as an ASCII map.
// Legend: '#' wall, 'C' crate (cover that blocks sight), 'B' bush (a dark hiding zone),
// 'L' ledger to recover, 'E' exit, 'P' where the player starts, '.' open floor.
// Every row must be 32 tiles wide; the map is 18 rows tall (32x18x40 = 1280x720).
import { LEDGERS_TOTAL, TILE } from './config.js';

export const MAP = [
  '################################',
  '#......#.......#.......#.......#',
  '#.L....#...B...#...C...#...L...#',
  '#......#.......#.......#.......#',
  '#..###......####....###.....#..#',
  '#..#.............#.........#...#',
  '#..#..C....B....#...L.....#....#',
  '#..#.............#.........#...#',
  '####..####...####...####..####.#',
  '#......#.......#.......#.......#',
  '#.B....#...C...#...B...#.......#',
  '#......#.......#.......#.......#',
  '#..###......####....###.....#..#',
  '#..#.............#.........#...#',
  '#..#..C....B....#.........#....#',
  '#..#.............#.........#...#',
  '#P.....#........#........#..E..#',
  '################################',
];

// Patrol loops, as tile coordinates: each guard walks its loop, pausing at each corner.
export const GUARD_PATROLS = [
  // North-west gallery, watching the first ledger.
  [[2, 1], [6, 1], [6, 3], [2, 3]],
  // North-east vault, watching the second ledger.
  [[25, 1], [30, 1], [30, 3], [25, 3]],
  // South reading room, watching the approach to the exit.
  [[9, 13], [14, 13], [14, 15], [9, 15]],
  // Middle gallery, watching the third ledger.
  [[18, 5], [24, 5], [24, 7], [18, 7]],
];

export const TILE_WALL = '#';
export const TILE_CRATE = 'C';
export const TILE_BUSH = 'B';
export const TILE_LEDGER = 'L';
export const TILE_EXIT = 'E';
export const TILE_PLAYER = 'P';

/** A tile's centre, in pixels. */
export function tileCentre(col, row) {
  return { x: (col + 0.5) * TILE, y: (row + 0.5) * TILE };
}

/** Parse the map into the pieces the world and the renderer need. */
export function parseLevel() {
  const rows = MAP.length;
  const cols = MAP[0].length;
  for (const row of MAP) {
    if (row.length !== cols) throw new Error('level map rows must all be the same width');
  }
  const walls = [];
  const crates = [];
  const bushes = [];
  const ledgers = [];
  let exit = null;
  let exitCount = 0;
  let playerStart = null;
  let playerCount = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const ch = MAP[row][col];
      const x = col * TILE;
      const y = row * TILE;
      if (ch === TILE_WALL) walls.push({ x, y, width: TILE, height: TILE });
      else if (ch === TILE_CRATE) crates.push({ x, y, width: TILE, height: TILE });
      else if (ch === TILE_BUSH) bushes.push({ x, y, width: TILE, height: TILE });
      else if (ch === TILE_LEDGER) ledgers.push({ x: x + TILE / 2, y: y + TILE / 2, taken: false });
      else if (ch === TILE_EXIT) { exit = { x: x + TILE / 2, y: y + TILE / 2 }; exitCount += 1; }
      else if (ch === TILE_PLAYER) { playerStart = { x: x + TILE / 2, y: y + TILE / 2 }; playerCount += 1; }
    }
  }
  if (exitCount !== 1) throw new Error(`level needs exactly one exit, found ${exitCount}`);
  if (playerCount !== 1) throw new Error(`level needs exactly one player start, found ${playerCount}`);
  if (ledgers.length !== LEDGERS_TOTAL) {
    throw new Error(`level needs ${LEDGERS_TOTAL} ledgers, found ${ledgers.length}`);
  }
  return { rows, cols, walls, crates, bushes, ledgers, exit, playerStart };
}
