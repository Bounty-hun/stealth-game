// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between five screens: title, play, paused, caught and win.
//
// ?shot=cover|patrol|alarm|win stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot. window.__game exposes the live state for
// play-testing: { state, screen }.
import { BEST_KEY, STEP } from './config.js';
import { createWorld, EVENT_CAUGHT, EVENT_PICKUP, EVENT_SPOTTED, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld();
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best time then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, performance.now());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
  window.__game = { state: world.state, screen: scene.screen, shot: name };
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Recover 3 ledgers, then reach the exit unseen.');
  }

  function endCaught() {
    screen = SCREEN_OVER;
    announce(`Caught. ${world.state.ledgersTaken} of 3 ledgers recovered. Press R to try again.`);
  }

  function endWin() {
    screen = SCREEN_WIN;
    const ms = Math.round(world.state.elapsed * 1000);
    if (best === 0 || ms < best) {
      best = ms;
      saveBest(best);
    }
    announce(`Escaped in ${Math.floor(ms / 1000)} seconds. Press R to play again.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0, sneak: false }, true);
      return;
    }
    const events = world.step(STEP, input.direction(), false);
    if (events & EVENT_WIN) endWin();
    else if (events & EVENT_CAUGHT) endCaught();
    else if (events & EVENT_SPOTTED) announce('Spotted! Break line of sight and hide.');
    else if (events & EVENT_PICKUP) announce(`Ledger ${world.state.ledgersTaken} of 3 recovered.`);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, now);
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  window.__game = {
    get state() { return world.state; },
    get screen() { return screen; },
  };
  announce('The Night Archive. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
