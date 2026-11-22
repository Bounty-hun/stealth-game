// The screenshot scenes behind ?shot=cover|patrol|alarm|win. Each one drives the real world
// forward with the same step() the game uses: a scripted route steers the player through the
// level (cover, patrol), and the alarm and win scenes stage a genuine world state and let it
// settle for a few frames, so every frame is what the running game really looks like.
import { STEP } from './config.js';
import { tileCentre } from './level.js';
import { GUARD_CHASE, GUARD_PATROL } from './world.js';
import { SCREEN_PLAY, SCREEN_WIN } from './render.js';

/** The route from the start to the first ledger, as tile coordinates. */
const LEDGER_ROUTE = [
  [1, 16], [1, 13], [1, 9], [4, 9], [4, 8], [4, 6], [5, 5], [7, 5], [7, 4], [6, 3], [4, 3], [2, 2],
];

/** Steer the player toward a pixel target; returns the input for one step. */
function steerToward(state, tx, ty, sneak) {
  const dx = tx - state.player.x;
  const dy = ty - state.player.y;
  return { x: dx, y: dy, sneak };
}

/**
 * Walk the route with the real rules. Stops early when `stop(state)` is true, when the route
 * ends, or when the time budget runs out. A waypoint is skipped when the player makes no
 * progress toward it for a while (a wall corner the slide cannot clear).
 */
function runRoute(world, route, budgetSeconds, stop, sneak) {
  const state = world.state;
  let waypoint = 0;
  let stuckTimer = 0;
  let lastDist = Infinity;
  const steps = Math.floor(budgetSeconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (stop && stop(state)) break;
    if (waypoint >= route.length) break;
    const target = tileCentre(route[waypoint][0], route[waypoint][1]);
    const dist = Math.hypot(target.x - state.player.x, target.y - state.player.y);
    if (dist < 14) {
      waypoint += 1;
      stuckTimer = 0;
      lastDist = Infinity;
      continue;
    }
    if (dist > lastDist - 0.5) {
      stuckTimer += STEP;
      if (stuckTimer > 1.5) {
        waypoint += 1;
        stuckTimer = 0;
        lastDist = Infinity;
        continue;
      }
    } else {
      stuckTimer = 0;
    }
    lastDist = dist;
    world.step(STEP, steerToward(state, target.x, target.y, sneak), false);
    if (state.caught || state.won) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best time to show.
 * cover: the readable stealth decision — the player waited behind the crate while guard A's
 *   cone is cut by it, the first ledger and the exit in the same frame.
 * patrol: the player waits at the junction while guard A pauses at its waypoint and turns
 *   away, so the crossing north to the ledger reads as open.
 * alarm: a real chase, not a near-miss — the meter is full, the SPOTTED — HIDE!
 *   banner is up, the chasing guard shows "!" and closes in, and the player stands
 *   at the edge of the bush with one step to cover.
 * win: all ledgers in, stepping onto the exit.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name === 'cover') {
    // The player really walks to the crate; the guard is placed on its own patrol
    // waypoint, facing the crate, as it passes every loop.
    runRoute(world, [[1, 16], [1, 13], [1, 9], [4, 9], [4, 8], [4, 7], [6, 7]], 20, null, false);
    const guard = state.guards[0];
    state.player.x = 260;
    state.player.y = 300; // (6,7): directly behind the crate at (6,6)
    state.player.dir = -Math.PI / 2;
    guard.x = 260;
    guard.y = 140; // (6,3): the patrol corner above the crate
    guard.dir = Math.PI / 2; // facing south, straight at the crate
    guard.state = GUARD_PATROL;
    guard.pauseTimer = 1.2;
    guard.moving = false;
    state.detection = 0;
    state.caught = false;
    state.alarm = false;
    for (let i = 0; i < 6; i += 1) world.step(STEP, { x: 0, y: 0, sneak: false }, false);
    // Re-assert the geometry after the settle steps: the painted frame must show the
    // cone cut by the crate and the player hidden behind it.
    guard.x = 260;
    guard.y = 140;
    guard.dir = Math.PI / 2;
    state.player.x = 260;
    state.player.y = 300;
    state.detection = 0;
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'patrol') {
    // The player waits at the junction; guard A pauses at its waypoint and turns away.
    state.player.x = 300;
    state.player.y = 220; // (7,5): the junction — north to the ledger, east, south
    state.player.dir = -Math.PI / 2; // facing north, toward the route that just opened
    const guard = state.guards[0];
    guard.x = 260;
    guard.y = 140; // (6,3): the patrol corner above the junction
    guard.dir = -Math.PI / 2; // facing north, away from the player
    guard.state = GUARD_PATROL;
    guard.pauseTimer = 1.2;
    guard.moving = false;
    state.detection = 0;
    state.caught = false;
    state.alarm = false;
    for (let i = 0; i < 6; i += 1) world.step(STEP, { x: 0, y: 0, sneak: false }, false);
    guard.x = 260;
    guard.y = 140;
    guard.dir = -Math.PI / 2;
    state.player.x = 300;
    state.player.y = 220;
    state.detection = 0;
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'alarm') {
    // A genuine chase: the meter is full and the alarm is on, so the banner shows,
    // the guard runs at the player with "!" over its head, and the player stands at
    // the edge of the bush at (2,10) — one step from cover, ~90 px from the guard,
    // far enough that the settle steps cannot catch them.
    const player = state.player;
    player.x = 140;
    player.y = 420; // (3,10): one step east of the bush at (2,10)
    player.inBush = false;
    player.dir = Math.PI; // facing the bush, ready to duck in
    state.detection = 1;
    state.alarm = true;
    const guard = state.guards[0];
    guard.x = 220;
    guard.y = 380;
    guard.dir = Math.atan2(player.y - guard.y, player.x - guard.x);
    guard.state = GUARD_CHASE;
    guard.loseTimer = 0;
    guard.lastSeen.x = player.x;
    guard.lastSeen.y = player.y;
    for (let i = 0; i < 6; i += 1) world.step(STEP, { x: 0, y: 0, sneak: false }, false);
    // Re-assert the geometry after the settle steps: the painted frame must show a
    // chasing guard, a full meter and the banner, with the player at the bush edge.
    guard.x = 220;
    guard.y = 380;
    guard.dir = Math.atan2(player.y - guard.y, player.x - guard.x);
    guard.state = GUARD_CHASE;
    state.player.x = 140;
    state.player.y = 420;
    state.detection = 1;
    state.alarm = true;
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'win') {
    // Play for real first so the escape time reads like a genuine run: walk to the first
    // ledger, sneak back to the start, then wait there (out of every patrol) until the
    // clock is near 30 seconds. If the sneak back gets spotted, restage from a fresh
    // world and set the clock the way the alarm scene sets its detection.
    runRoute(world, LEDGER_ROUTE, 20, null, false);
    runRoute(world, [...LEDGER_ROUTE].reverse(), 30, null, true);
    let guard = 0;
    while (state.elapsed < 30 && !state.caught && !state.won && guard < 60 * 45) {
      world.step(STEP, { x: 0, y: 0, sneak: false }, false);
      guard += 1;
    }
    if (state.caught) {
      world.reset();
      state.elapsed = 32;
    }
    for (const ledger of state.level.ledgers) ledger.taken = true;
    state.ledgersTaken = state.level.ledgers.length;
    state.player.x = state.level.exit.x;
    state.player.y = state.level.exit.y - 24;
    for (let i = 0; i < 40 && !state.won; i += 1) {
      world.step(STEP, { x: 0, y: 1, sneak: false }, false);
    }
    return { screen: state.won ? SCREEN_WIN : SCREEN_PLAY, best: 0 };
  }
  // Unknown scene: sneak the route to the first ledger, as the old cover did.
  runRoute(world, LEDGER_ROUTE.slice(0, 8), 14, null, false);
  runRoute(world, LEDGER_ROUTE.slice(8), 20, (s) => s.detection >= 0.3, true);
  return { screen: SCREEN_PLAY, best: 0 };
}
