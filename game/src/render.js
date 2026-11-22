// All canvas drawing: the floor, walls, crates and bushes, the guards' vision cones (raycast
// so they wrap around walls the way sight does), the player, the HUD and the screens. The
// renderer never changes the world; it only paints what is there.
import { FIELD, FONT, GUARD, LEDGERS_TOTAL, PALETTE, TILE } from './config.js';
import { GUARD_CHASE, GUARD_SUSPICIOUS, levelSolids, rayOcclusionDistance } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** Rays across a cone. Each ray's reach comes from the world's own occlusion test. */
const CONE_RAYS = 26;

/**
 * The cone's outline: one ray per slice, each stopped by the first solid the world's
 * occlusion test meets. The cone is a polygon of sampled rays, so a straight edge
 * between two samples can cut across a crate corner that the detection ray slips
 * past — the Codex case (guard (174,212), player (307,247)) showed the drawn cone
 * stopping at 121 px where the meter's ray reaches 137.5 px. Rays through every
 * occluder corner inside the cone (plus a hair either side of each) pin the polygon
 * to the real occlusion boundary, so what the eye sees stays close to what the
 * meter measures. Exported for the occlusion test.
 */
export function conePoints(guard, solids) {
  const start = guard.dir - GUARD.sightHalfAngle;
  const end = guard.dir + GUARD.sightHalfAngle;
  const angles = [];
  for (let i = 0; i <= CONE_RAYS; i += 1) {
    angles.push(start + (2 * GUARD.sightHalfAngle * i) / CONE_RAYS);
  }
  const EPS = 0.002;
  for (const r of solids) {
    const corners = [
      [r.x, r.y], [r.x + r.width, r.y],
      [r.x, r.y + r.height], [r.x + r.width, r.y + r.height],
    ];
    for (const [cx, cy] of corners) {
      const dx = cx - guard.x;
      const dy = cy - guard.y;
      if (dx * dx + dy * dy > GUARD.sightRange * GUARD.sightRange) continue;
      const a = Math.atan2(dy, dx);
      let d = a - guard.dir;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > GUARD.sightHalfAngle + 0.01) continue;
      angles.push(a - EPS, a, a + EPS);
    }
  }
  angles.sort((a, b) => a - b);
  const points = [{ x: guard.x, y: guard.y }];
  for (const angle of angles) {
    const reach = rayOcclusionDistance(guard.x, guard.y, angle, GUARD.sightRange, solids);
    points.push({ x: guard.x + Math.cos(angle) * reach, y: guard.y + Math.sin(angle) * reach });
  }
  return points;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let solidsCache = null;
  let levelRef = null;

  /** The level's occluders, rebuilt only when the level changes. */
  function solidsFor(level) {
    if (levelRef !== level) {
      levelRef = level;
      solidsCache = levelSolids(level);
    }
    return solidsCache;
  }

  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    ctx.setTransform(scale, 0, 0, scale, (canvas.width - FIELD.width * scale) / 2, (canvas.height - FIELD.height * scale) / 2);
  }

  function rememberLevel(level) {
    solidsFor(level);
  }

  function drawCone(guard, solids) {
    const colour = guard.state === GUARD_CHASE
      ? PALETTE.coneAlert
      : guard.state === GUARD_SUSPICIOUS ? PALETTE.coneSuspicious : PALETTE.conePatrol;
    const points = conePoints(guard, solids);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.strokeStyle = guard.state === GUARD_CHASE ? 'rgba(229,83,75,0.55)' : 'rgba(242,201,76,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawFloor(level, time) {
    ctx.fillStyle = PALETTE.floor;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    for (let row = 0; row < level.rows; row += 1) {
      for (let col = 0; col < level.cols; col += 1) {
        if ((row + col) % 2 === 0) {
          ctx.fillStyle = PALETTE.floorAlt;
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE);
        }
      }
    }
    ctx.strokeStyle = PALETTE.floorLine;
    ctx.lineWidth = 1;
    for (let col = 0; col <= level.cols; col += 1) {
      ctx.beginPath();
      ctx.moveTo(col * TILE, 0);
      ctx.lineTo(col * TILE, FIELD.height);
      ctx.stroke();
    }
    for (let row = 0; row <= level.rows; row += 1) {
      ctx.beginPath();
      ctx.moveTo(0, row * TILE);
      ctx.lineTo(FIELD.width, row * TILE);
      ctx.stroke();
    }
    // Warm lamp pools: safe-looking light that marks the open floor.
    const lamps = [[200, 140], [1080, 140], [640, 360], [200, 580], [1080, 580]];
    for (const [lx, ly] of lamps) {
      const glow = ctx.createRadialGradient(lx, ly, 10, lx, ly, 130);
      glow.addColorStop(0, 'rgba(242, 201, 76, 0.10)');
      glow.addColorStop(1, 'rgba(242, 201, 76, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(lx - 130, ly - 130, 260, 260);
    }
    void time;
  }

  function drawWalls(level) {
    for (const wall of level.walls) {
      ctx.fillStyle = PALETTE.wall;
      ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
      ctx.fillStyle = PALETTE.wallTop;
      ctx.fillRect(wall.x, wall.y, wall.width, 5);
    }
    for (const crate of level.crates) {
      ctx.fillStyle = PALETTE.crate;
      ctx.fillRect(crate.x + 3, crate.y + 3, crate.width - 6, crate.height - 6);
      ctx.fillStyle = PALETTE.crateTop;
      ctx.fillRect(crate.x + 3, crate.y + 3, crate.width - 6, 5);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(crate.x + 6, crate.y + 6);
      ctx.lineTo(crate.x + crate.width - 6, crate.y + crate.height - 6);
      ctx.moveTo(crate.x + crate.width - 6, crate.y + 6);
      ctx.lineTo(crate.x + 6, crate.y + crate.height - 6);
      ctx.stroke();
    }
    for (const bush of level.bushes) {
      ctx.fillStyle = PALETTE.bush;
      ctx.fillRect(bush.x, bush.y, bush.width, bush.height);
      ctx.fillStyle = PALETTE.bushLeaf;
      for (const [ox, oy, r] of [[10, 12, 9], [28, 8, 10], [20, 26, 9], [32, 30, 7], [8, 30, 7]]) {
        ctx.beginPath();
        ctx.arc(bush.x + ox, bush.y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawLedgers(level, time) {
    for (const ledger of level.ledgers) {
      if (ledger.taken) continue;
      const bob = Math.sin(time / 350 + ledger.x) * 2;
      ctx.save();
      ctx.shadowColor = PALETTE.ledger;
      ctx.shadowBlur = 14;
      ctx.fillStyle = PALETTE.ledger;
      ctx.fillRect(ledger.x - 9, ledger.y - 12 + bob, 18, 24);
      ctx.restore();
      ctx.strokeStyle = '#7a5c14';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(ledger.x - 5, ledger.y - 6 + bob + i * 6);
        ctx.lineTo(ledger.x + 5, ledger.y - 6 + bob + i * 6);
        ctx.stroke();
      }
    }
  }

  function drawExit(level, unlocked, time) {
    const exit = level.exit;
    const pulse = unlocked ? 0.6 + Math.sin(time / 300) * 0.25 : 0.25;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = unlocked ? PALETTE.exit : PALETTE.exitLocked;
    ctx.beginPath();
    ctx.arc(exit.x, exit.y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = unlocked ? PALETTE.exit : PALETTE.exitLocked;
    ctx.lineWidth = 3;
    ctx.strokeRect(exit.x - 16, exit.y - 20, 32, 40);
    ctx.fillStyle = '#0d1020';
    ctx.fillRect(exit.x - 8, exit.y - 10, 16, 20);
    ctx.fillStyle = unlocked ? PALETTE.exit : PALETTE.exitLocked;
    ctx.font = 'bold 13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(unlocked ? 'EXIT' : 'LOCK', exit.x, exit.y - 32);
  }

  function drawRipples(ripples) {
    for (const ripple of ripples) {
      ctx.strokeStyle = `rgba(127, 212, 255, ${0.45 * (ripple.life / ripple.maxLife)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, ripple.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawGuards(state) {
    const solids = solidsFor(state.level);
    for (const guard of state.guards) {
      drawCone(guard, solids);
    }
    for (const guard of state.guards) {
      const body = guard.state === GUARD_CHASE ? PALETTE.guard
        : guard.state === GUARD_SUSPICIOUS ? PALETTE.guardSuspicious : PALETTE.guard;
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(guard.x, guard.y, GUARD.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Facing tick: the direction the guard is looking.
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(guard.x, guard.y);
      ctx.lineTo(guard.x + Math.cos(guard.dir) * (GUARD.radius + 7), guard.y + Math.sin(guard.dir) * (GUARD.radius + 7));
      ctx.stroke();
      if (guard.state !== 'patrol') {
        ctx.fillStyle = guard.state === GUARD_CHASE ? '#ff6b61' : '#f2c94c';
        ctx.font = 'bold 26px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(guard.state === GUARD_CHASE ? '!' : '?', guard.x, guard.y - GUARD.radius - 4);
      }
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    ctx.save();
    if (player.sneaking) ctx.globalAlpha = 0.85;
    ctx.fillStyle = player.sneaking ? PALETTE.playerSneak : PALETTE.player;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(player.x + Math.cos(player.dir) * 16, player.y + Math.sin(player.dir) * 16);
    ctx.stroke();
    ctx.restore();
    if (player.inBush) {
      // A bush is cover, not invisibility: a guard closer than 70 px can still see
      // the player inside it, so the label promises only cover.
      ctx.fillStyle = '#7fd4ff';
      ctx.font = 'bold 11px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('COVER', player.x, player.y - 16);
      ctx.fillStyle = '#9aa3b8';
      ctx.font = '10px ' + FONT;
      ctx.fillText('Penjaga dekat masih bisa melihatmu', player.x, player.y - 30);
    }
  }

  function drawHud(state, time) {
    const barW = 260;
    const barX = (FIELD.width - barW) / 2;
    ctx.fillStyle = 'rgba(13, 16, 32, 0.82)';
    ctx.fillRect(0, 0, FIELD.width, 46);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 16px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('THE NIGHT ARCHIVE', 16, 24);
    ctx.font = '14px ' + FONT;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`LEDGERS  ${state.ledgersTaken}/${LEDGERS_TOTAL}`, 250, 24);
    for (let i = 0; i < LEDGERS_TOTAL; i += 1) {
      ctx.fillStyle = i < state.ledgersTaken ? PALETTE.ledger : '#3a4266';
      ctx.beginPath();
      ctx.arc(360 + i * 20, 24, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Detection meter: a text label (no emoji, so it reads the same on every platform)
    // and a bar that fills as a guard spots you.
    const meter = state.detection;
    ctx.fillStyle = meter > 0.66 ? PALETTE.danger : meter > 0.33 ? PALETTE.guardSuspicious : PALETTE.muted;
    ctx.font = 'bold 13px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillText('DETECTION', barX - 10, 24);
    ctx.fillStyle = '#262c4a';
    ctx.fillRect(barX, 14, barW, 20);
    ctx.fillStyle = meter > 0.66 ? PALETTE.danger : meter > 0.33 ? '#f2c94c' : '#7fd4ff';
    ctx.fillRect(barX, 14, barW * meter, 20);
    ctx.strokeStyle = '#4a5380';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, 14, barW, 20);
    const seconds = Math.floor(state.elapsed);
    const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 16px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillText(clock, FIELD.width - 16, 24);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '13px ' + FONT;
    ctx.textAlign = 'left';
    const objective = state.ledgersTaken < LEDGERS_TOTAL
      ? `Recover the ledgers (${state.ledgersTaken}/${LEDGERS_TOTAL}), then reach the exit unseen.`
      : 'All ledgers recovered — reach the green EXIT!';
    ctx.fillText(objective, 16, 62);
    if (state.alarm) {
      const blink = 0.65 + Math.sin(time / 130) * 0.35;
      ctx.save();
      ctx.globalAlpha = blink;
      ctx.fillStyle = '#a02020';
      ctx.fillRect(FIELD.width / 2 - 150, 52, 300, 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('SPOTTED — HIDE!', FIELD.width / 2, 67);
      ctx.restore();
    }
  }

  function overlay(title, lines, accent) {
    ctx.fillStyle = 'rgba(8, 10, 22, 0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.fillStyle = accent;
    ctx.font = 'bold 52px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, FIELD.width / 2, FIELD.height / 2 - 70);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '18px ' + FONT;
    lines.forEach((line, i) => {
      ctx.fillText(line, FIELD.width / 2, FIELD.height / 2 - 10 + i * 30);
    });
  }

  function draw(state, screen, best, time) {
    fit();
    rememberLevel(state.level);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    drawFloor(state.level, time);
    drawWalls(state.level);
    drawLedgers(state.level, time);
    drawExit(state.level, state.ledgersTaken === LEDGERS_TOTAL, time);
    drawRipples(state.ripples);
    drawGuards(state);
    drawPlayer(state);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(state, time);
    if (screen === SCREEN_TITLE) {
      overlay('THE NIGHT ARCHIVE', [
        'You are Wira, the night archivist. Recover 3 ledgers, then reach the EXIT unseen.',
        'WASD / Arrows — move    Shift — sneak    P — pause    R — restart',
        'Stay out of the guards\' cones. Bushes are cover — a guard right next to you can still see you. A full meter means the alarm is raised.',
        'Press SPACE or click to start',
      ], '#f2c94c');
    } else if (screen === SCREEN_PAUSED) {
      overlay('PAUSED', ['Press P or SPACE to keep sneaking.'], PALETTE.text);
    } else if (screen === SCREEN_OVER) {
      overlay('CAUGHT!', [
        'A guard caught you in the open.',
        `Ledgers recovered: ${state.ledgersTaken}/${LEDGERS_TOTAL}`,
        'Press R or click to try again.',
      ], PALETTE.danger);
    } else if (screen === SCREEN_WIN) {
      const ms = Math.round(state.elapsed * 1000);
      const bestLine = best > 0 ? `Best escape: ${formatTime(best)}` : 'Your first escape — nicely done.';
      overlay('ESCAPED!', [
        `You slipped out with all ${LEDGERS_TOTAL} ledgers in ${formatTime(ms)}.`,
        bestLine,
        'Press R or click to play again.',
      ], PALETTE.exit);
    }
  }

  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  return { draw };
}
