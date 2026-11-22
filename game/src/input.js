// Keyboard and pointer input. Held keys give a steering direction; one-shot presses (start,
// restart, pause) are queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);
const SNEAK = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      held.add(event.code);
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (SNEAK.has(event.code)) {
      held.add(event.code);
    } else {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  function direction() {
    let x = 0;
    let y = 0;
    for (const code of held) {
      if (UP.has(code)) y -= 1;
      else if (DOWN.has(code)) y += 1;
      else if (LEFT.has(code)) x -= 1;
      else if (RIGHT.has(code)) x += 1;
    }
    const sneak = [...held].some((code) => SNEAK.has(code));
    return { x, y, sneak };
  }

  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  return { direction, takeActions };
}
