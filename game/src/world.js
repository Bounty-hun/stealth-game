// The game's rules and state, with no drawing and no browser in it: the player, the guards
// and their patrols, vision cones and detection, the ledgers and the exit. step() advances one
// fixed step and returns what happened as bit flags, so the caller can react without the world
// knowing about screens or sound. Most per-frame work reuses the state objects, but this is
// not allocation-free: patrol calls tileCentre, ripples allocate, and the solid cache fills.
import { DETECTION, FIELD, GUARD, LEDGERS_TOTAL, PLAYER, STEP, TILE } from './config.js';
import { GUARD_PATROLS, parseLevel, tileCentre } from './level.js';

export const EVENT_PICKUP = 1;
export const EVENT_SPOTTED = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_WIN = 8;

export const GUARD_PATROL = 'patrol';
export const GUARD_SUSPICIOUS = 'suspicious';
export const GUARD_CHASE = 'chase';

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function angleDifference(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * The ONE occlusion primitive the whole game shares, used by both sight and the drawn
 * cone: the distance from (ox,oy) along the unit direction (dx,dy) to the first
 * axis-aligned rectangle it enters, or Infinity when the ray stays clear. Sight and the
 * cone therefore agree ray by ray — but the drawn cone is a polygon of sampled rays,
 * so near a crate corner its straight edge can still sit a few pixels short of the ray
 * the meter uses. render.js adds rays through occluder corners to narrow that gap.
 */
export function rayRectT(ox, oy, dx, dy, r) {
  let tMin = 0;
  let tMax = Infinity;
  if (dx === 0) {
    if (ox < r.x || ox > r.x + r.width) return Infinity;
  } else {
    let t1 = (r.x - ox) / dx;
    let t2 = (r.x + r.width - ox) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return Infinity;
  }
  if (dy === 0) {
    if (oy < r.y || oy > r.y + r.height) return Infinity;
  } else {
    let t1 = (r.y - oy) / dy;
    let t2 = (r.y + r.height - oy) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return Infinity;
  }
  return tMin;
}

/** Distance to the first solid the ray meets, capped at maxDist (maxDist when clear). */
export function rayOcclusionDistance(ox, oy, angle, maxDist, solids) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = maxDist;
  for (let i = 0; i < solids.length; i += 1) {
    const t = rayRectT(ox, oy, dx, dy, solids[i]);
    if (t < best) best = t;
  }
  return best;
}

/** The solid rectangles of a level: walls and crates, the only things that block sight. */
export function levelSolids(level) {
  return level.walls.concat(level.crates);
}

/** True when the segment from (x1,y1) to (x2,y2) touches no wall or crate rectangle. */
export function hasLineOfSight(x1, y1, x2, y2, solids) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return true;
  return rayOcclusionDistance(x1, y1, Math.atan2(dy, dx), len, solids) >= len - 0.5;
}

/** True when the point sits inside any rectangle of the list. */
function pointInRects(x, y, rects) {
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) return true;
  }
  return false;
}

export function createWorld() {
  const level = parseLevel();
  const solids = level.walls.concat(level.crates);
  const player = { x: 0, y: 0, dir: 0, moving: false, sneaking: false, inBush: false };
  const guards = GUARD_PATROLS.map((waypoints, index) => {
    const start = tileCentre(waypoints[0][0], waypoints[0][1]);
    return {
      index,
      x: start.x,
      y: start.y,
      dir: 0,
      waypoints,
      waypointIndex: 1,
      pauseTimer: index * 0.7,
      state: GUARD_PATROL,
      lastSeen: { x: start.x, y: start.y },
      loseTimer: 0,
      lookTimer: 0,
      stepTimer: 0,
      /** Stuck-investigation bookkeeping: seconds without progress toward lastSeen. */
      stuckTimer: 0,
      moving: false,
    };
  });
  const ripples = [];
  const state = {
    level,
    player,
    guards,
    ripples,
    ledgersTaken: 0,
    detection: 0,
    /** Seconds since line of sight last broke; the meter only drains past drainDelay. */
    hiddenTimer: 0,
    elapsed: 0,
    caught: false,
    won: false,
    alarm: false,
  };

  function reset() {
    player.x = level.playerStart.x;
    player.y = level.playerStart.y;
    player.dir = 0;
    player.moving = false;
    player.sneaking = false;
    player.inBush = false;
    player.stepTimer = 0;
    for (const ledger of level.ledgers) ledger.taken = false;
    for (let i = 0; i < guards.length; i += 1) {
      const guard = guards[i];
      const start = tileCentre(guard.waypoints[0][0], guard.waypoints[0][1]);
      guard.x = start.x;
      guard.y = start.y;
      guard.dir = 0;
      guard.waypointIndex = 1;
      guard.pauseTimer = i * 0.7;
      guard.state = GUARD_PATROL;
      guard.lastSeen.x = start.x;
      guard.lastSeen.y = start.y;
      guard.loseTimer = 0;
      guard.lookTimer = 0;
      guard.stepTimer = 0;
      guard.stuckTimer = 0;
      guard.moving = false;
    }
    ripples.length = 0;
    state.ledgersTaken = 0;
    state.detection = 0;
    state.hiddenTimer = 0;
    state.elapsed = 0;
    state.caught = false;
    state.won = false;
    state.alarm = false;
  }

  /** Move a circle through the walls: slide along one axis at a time. */
  function moveCircle(body, dx, dy, radius) {
    const nextX = body.x + dx;
    if (!circleHitsSolid(nextX, body.y, radius)) body.x = nextX;
    const nextY = body.y + dy;
    if (!circleHitsSolid(body.x, nextY, radius)) body.y = nextY;
    body.x = clamp(body.x, radius, FIELD.width - radius);
    body.y = clamp(body.y, radius, FIELD.height - radius);
  }

  function circleHitsSolid(x, y, radius) {
    const left = Math.floor((x - radius) / TILE);
    const right = Math.floor((x + radius) / TILE);
    const top = Math.floor((y - radius) / TILE);
    const bottom = Math.floor((y + radius) / TILE);
    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) {
        if (row < 0 || row >= level.rows || col < 0 || col >= level.cols) return true;
        const rect = solidAt(col, row);
        if (!rect) continue;
        const cx = clamp(x, rect.x, rect.x + rect.width);
        const cy = clamp(y, rect.y, rect.y + rect.height);
        const ddx = x - cx;
        const ddy = y - cy;
        if (ddx * ddx + ddy * ddy < radius * radius) return true;
      }
    }
    return false;
  }

  // A tile's solid rectangle, or null. Walls and crates are the only solid tiles.
  const solidCache = new Map();
  function solidAt(col, row) {
    const key = row * 100 + col;
    if (solidCache.has(key)) return solidCache.get(key);
    let found = null;
    for (let i = 0; i < solids.length; i += 1) {
      const r = solids[i];
      if (r.x === col * TILE && r.y === row * TILE) { found = r; break; }
    }
    solidCache.set(key, found);
    return found;
  }

  /** Does this guard see the player right now? Returns 0 when not seen, else a 0..1 closeness. */
  function guardSeesPlayer(guard) {
    const dx = player.x - guard.x;
    const dy = player.y - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist > GUARD.sightRange) return 0;
    const angle = Math.atan2(dy, dx);
    // The cone the renderer draws uses this same half-angle, so there is no hidden
    // band at the cone's edge — but the cone is a polygon of sampled rays, so at a
    // crate corner its straight edge can sit a few pixels short of this exact ray.
    if (Math.abs(angleDifference(angle, guard.dir)) > GUARD.sightHalfAngle) return 0;
    if (!hasLineOfSight(guard.x, guard.y, player.x, player.y, solids)) return 0;
    if (player.inBush && dist > GUARD.bushRevealDistance) return 0;
    return 1 - (dist / GUARD.sightRange) * 0.6;
  }

  function raiseAlarm(spotter) {
    state.alarm = true;
    for (const guard of guards) {
      if (guard === spotter) {
        guard.state = GUARD_CHASE;
        guard.loseTimer = 0;
      } else if (guard.state !== GUARD_CHASE) {
        guard.state = GUARD_SUSPICIOUS;
        guard.lastSeen.x = player.x;
        guard.lastSeen.y = player.y;
        guard.lookTimer = 0;
        guard.stuckTimer = 0;
      }
    }
  }

  /**
   * Chase: run at the player while seen. Once sight breaks, the guard no longer
   * knows where the player is: it heads for the last seen spot, and gives up to
   * investigate when it arrives there or the lose timer runs out. A catch needs
   * real line of sight — never through a wall or crate.
   */
  function updateChase(guard, dt) {
    const sees = guardSeesPlayer(guard);
    if (sees > 0) {
      guard.loseTimer = 0;
      moveToward(guard, player.x, player.y, GUARD.chaseSpeed, dt);
    } else {
      guard.loseTimer += dt;
      const arrived = moveToward(guard, guard.lastSeen.x, guard.lastSeen.y, GUARD.chaseSpeed, dt);
      if (arrived || guard.loseTimer >= GUARD.loseSightTime) {
        guard.state = GUARD_SUSPICIOUS;
        guard.lookTimer = 0;
        guard.stuckTimer = 0;
      }
    }
    if (Math.hypot(player.x - guard.x, player.y - guard.y) <= GUARD.catchDistance
      && hasLineOfSight(guard.x, guard.y, player.x, player.y, solids)) {
      state.caught = true;
    }
  }

  /**
   * Suspicious: walk to the last seen spot, look around, then return to patrol.
   * The axis slide cannot steer around a wall corner, so a guard that makes no
   * progress toward the spot for ~0.5 s starts looking around from where it is
   * instead of waiting against the wall forever. The detection meter is owned
   * only by updateDetection — investigating never writes it.
   */
  function updateSuspicious(guard, dt) {
    // Once the look-around phase starts it runs to completion: lookTimer > 0
    // latches it, so the stuck check below only applies while walking.
    if (guard.lookTimer > 0) {
      guard.lookTimer += dt;
      guard.dir += dt * 1.4;
      if (guard.lookTimer >= GUARD.lookTime) {
        guard.state = GUARD_PATROL;
        guard.lookTimer = 0;
        if (!guards.some((g) => g.state === GUARD_CHASE)) state.alarm = false;
      }
      return;
    }
    const before = Math.hypot(guard.lastSeen.x - guard.x, guard.lastSeen.y - guard.y);
    const arrived = moveToward(guard, guard.lastSeen.x, guard.lastSeen.y, GUARD.investigateSpeed, dt);
    const after = Math.hypot(guard.lastSeen.x - guard.x, guard.lastSeen.y - guard.y);
    if (arrived) {
      guard.stuckTimer = 0;
      guard.lookTimer += dt;
      guard.dir += dt * 1.4;
      return;
    }
    // Progress is measured per step: a free guard closes ~2.5 px per step at
    // investigate speed; a blocked one barely moves. Half a second of that means
    // the slide cannot clear the corner, so start looking around from here.
    if (after >= before - 0.5) guard.stuckTimer += dt;
    else guard.stuckTimer = 0;
    if (guard.stuckTimer >= 0.5) {
      guard.stuckTimer = 0;
      guard.lookTimer += dt;
      guard.dir += dt * 1.4;
    }
  }

  /**
   * Patrol: walk the loop, pausing pauseTime at each waypoint. The pause is the readable
   * window — the guard stands still and slowly turns, and a waiting player can cross.
   */
  function updatePatrol(guard, dt) {
    if (guard.pauseTimer > 0) {
      guard.pauseTimer -= dt;
      guard.dir += dt * 0.5;
      guard.moving = false;
      return;
    }
    const target = tileCentre(guard.waypoints[guard.waypointIndex][0], guard.waypoints[guard.waypointIndex][1]);
    const arrived = moveToward(guard, target.x, target.y, GUARD.patrolSpeed, dt);
    if (arrived) {
      guard.waypointIndex = (guard.waypointIndex + 1) % guard.waypoints.length;
      guard.pauseTimer = GUARD.pauseTime;
    }
  }

  /** One guard's behaviour for a step: remember what it sees, then run its state. */
  function stepGuard(guard, dt) {
    if (guardSeesPlayer(guard) > 0) {
      guard.lastSeen.x = player.x;
      guard.lastSeen.y = player.y;
    }
    if (guard.state === GUARD_CHASE) updateChase(guard, dt);
    else if (guard.state === GUARD_SUSPICIOUS) updateSuspicious(guard, dt);
    else updatePatrol(guard, dt);
  }

  /** Walk toward a point; returns true when arrived. Turns to face the walk. */
  function moveToward(guard, tx, ty, speed, dt) {
    const dx = tx - guard.x;
    const dy = ty - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) {
      guard.moving = false;
      return true;
    }
    const step = Math.min(dist, speed * dt);
    const nx = (dx / dist) * step;
    const ny = (dy / dist) * step;
    const beforeX = guard.x;
    const beforeY = guard.y;
    moveCircle(guard, nx, ny, GUARD.radius);
    guard.moving = guard.x !== beforeX || guard.y !== beforeY;
    if (guard.moving) guard.dir = Math.atan2(dy, dx);
    return false;
  }

  function addRipple(x, y, strong) {
    if (ripples.length > 40) ripples.shift();
    ripples.push({ x, y, r: 6, maxR: strong ? 34 : 22, life: 0.8, maxLife: 0.8 });
  }

  /**
   * The detection meter: the closest seeing guard fills it, faster up close and slower
   * while the player sneaks. When sight breaks, the meter HOLDS for drainDelay — the
   * near-miss moment — and only then drains. Returns EVENT_SPOTTED only when the alarm
   * newly activates: while the meter sits at 1 the alarm stays on, but the event
   * must not fire again every tick. This function alone owns the meter.
   */
  function updateDetection(input, dt) {
    let bestSee = 0;
    let spotter = null;
    for (const guard of guards) {
      const seen = guardSeesPlayer(guard);
      if (seen > bestSee) {
        bestSee = seen;
        spotter = guard;
      }
    }
    if (bestSee > 0) {
      state.hiddenTimer = 0;
      let rate = DETECTION.fill * bestSee;
      if (input.sneak) rate = DETECTION.fillSneak * bestSee;
      const dist = spotter ? Math.hypot(player.x - spotter.x, player.y - spotter.y) : 999;
      if (dist < GUARD.nearMissDistance) rate *= 2;
      state.detection = Math.min(1, state.detection + rate * dt);
      if (state.detection >= 1 && spotter) {
        const wasAlarm = state.alarm;
        raiseAlarm(spotter);
        state.detection = 1;
        return wasAlarm ? 0 : EVENT_SPOTTED;
      }
      return 0;
    }
    state.hiddenTimer += dt;
    if (state.hiddenTimer >= DETECTION.drainDelay) {
      state.detection = Math.max(0, state.detection - DETECTION.drain * dt);
    }
    return 0;
  }

  /**
   * Advance one fixed step. `input` is {x, y, sneak} with x/y in -1..1; `demo` runs the
   * guards' patrols only (title-screen attract mode: no detection, no alarm, no catch,
   * so the standing player can never be spotted while the title is up). Returns event
   * flags. Once a terminal result is decided (win or caught) the world freezes: a step
   * can never emit WIN and CAUGHT together, and no guard moves after the result.
   */
  function step(dt, input, demo) {
    let events = 0;
    if (state.caught || state.won) return 0;
    state.elapsed += dt;
    if (!demo && !state.caught && !state.won) {
      const speed = input.sneak ? PLAYER.sneakSpeed : PLAYER.speed;
      const len = Math.hypot(input.x, input.y);
      const nx = len > 0 ? (input.x / len) * speed * dt : 0;
      const ny = len > 0 ? (input.y / len) * speed * dt : 0;
      const beforeX = player.x;
      const beforeY = player.y;
      moveCircle(player, nx, ny, PLAYER.radius);
      player.moving = player.x !== beforeX || player.y !== beforeY;
      player.sneaking = input.sneak && player.moving;
      if (player.moving) player.dir = Math.atan2(ny, nx);
      player.inBush = pointInRects(player.x, player.y, level.bushes);
      // Footsteps: a faint ripple when running out in the open.
      player.stepTimer = (player.stepTimer || 0) - dt;
      if (player.moving && !player.sneaking && player.stepTimer <= 0) {
        addRipple(player.x, player.y, false);
        player.stepTimer = 0.5;
      }
      // Ledgers.
      for (const ledger of level.ledgers) {
        if (!ledger.taken && Math.hypot(player.x - ledger.x, player.y - ledger.y) <= 26) {
          ledger.taken = true;
          state.ledgersTaken += 1;
          events |= EVENT_PICKUP;
        }
      }
      // Exit: locked until every ledger is recovered. Reaching it ends the run here,
      // before any guard can act in this tick.
      if (state.ledgersTaken === LEDGERS_TOTAL
        && Math.hypot(player.x - level.exit.x, player.y - level.exit.y) <= 30) {
        state.won = true;
        return events | EVENT_WIN;
      }
    }
    if (demo) {
      for (const guard of guards) updatePatrol(guard, dt);
    } else {
      events |= updateDetection(input, dt);
      for (const guard of guards) {
        stepGuard(guard, dt);
        guard.stepTimer -= dt;
        if (guard.moving && guard.stepTimer <= 0) {
          addRipple(guard.x, guard.y, true);
          guard.stepTimer = GUARD.stepPulse;
        }
      }
    }
    for (let i = ripples.length - 1; i >= 0; i -= 1) {
      const ripple = ripples[i];
      ripple.life -= dt;
      ripple.r += (ripple.maxR - ripple.r) * dt * 3;
      if (ripple.life <= 0) ripples.splice(i, 1);
    }
    if (state.caught) events |= EVENT_CAUGHT;
    return events;
  }

  reset();
  return { state, reset, step, hasLineOfSight: (x1, y1, x2, y2) => hasLineOfSight(x1, y1, x2, y2, solids), solids };
}
