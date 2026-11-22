// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area;
// the renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** One map tile, in pixels. The level is 32 by 18 tiles. */
export const TILE = 40;

export const PLAYER = {
  radius: 11,
  speed: 200,
  sneakSpeed: 115,
};

export const GUARD = {
  radius: 12,
  patrolSpeed: 85,
  investigateSpeed: 150,
  chaseSpeed: 235,
  /** Vision cone reach, in pixels. */
  sightRange: 230,
  /** Half the cone's angle, in radians. */
  sightHalfAngle: 0.58,
  /** How long a chasing guard needs to lose sight before it gives up, in seconds. */
  loseSightTime: 2.5,
  /** How long a suspicious guard looks around the last seen spot, in seconds. */
  lookTime: 2,
  /** Pause at each patrol waypoint, in seconds: the turn is the readable window to cross. */
  pauseTime: 1.2,
  /** Step-pulse interval while a guard walks, in seconds (silent while it stands still). */
  stepPulse: 0.45,
  /** Distance at which a guard touching the player catches them. */
  catchDistance: 26,
  /** A bush hides the player unless the guard is this close. */
  bushRevealDistance: 70,
  /** A player seen closer than this fills the meter twice as fast: a near miss raises the alarm. */
  nearMissDistance: 90,
};

export const DETECTION = {
  /** Base fill rate per second while the player is seen (scaled by distance). */
  fill: 0.9,
  /** Fill rate while sneaking. */
  fillSneak: 0.45,
  /** Drain rate per second while hidden. */
  drain: 0.45,
  /** The meter holds this long after line of sight breaks before it starts draining. */
  drainDelay: 0.8,
};

export const LEDGERS_TOTAL = 3;

export const PALETTE = {
  backdrop: '#0d1020',
  floor: '#1c2138',
  floorAlt: '#202642',
  floorLine: '#262c4a',
  wall: '#3a4266',
  wallTop: '#4a5380',
  crate: '#6b5233',
  crateTop: '#8a6a42',
  bush: '#14382a',
  bushLeaf: '#1d5c3f',
  exit: '#37d67a',
  exitLocked: '#5a6b62',
  ledger: '#f2c94c',
  player: '#7fd4ff',
  playerSneak: '#5aa8d6',
  guard: '#e5534b',
  guardSuspicious: '#f2c94c',
  conePatrol: 'rgba(242, 201, 76, 0.20)',
  coneSuspicious: 'rgba(242, 201, 76, 0.34)',
  coneAlert: 'rgba(229, 83, 75, 0.38)',
  panel: '#171b2e',
  text: '#eef1f5',
  muted: '#9aa3b8',
  danger: '#ff6b61',
  safe: '#7fd4ff',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best (fastest) win time is kept between visits (this browser only). */
export const BEST_KEY = 'night-archive.best-ms';
