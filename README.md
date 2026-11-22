# The Night Archive

A top-down stealth game for the make.fun best-stealth-game bounty.

You are Wira, the night archivist. The museum archive is closed, the guards are on
patrol, and three ledgers are out of place. Recover all three, then reach the green
EXIT — unseen.

- **Move** WASD / arrow keys, **sneak** with Shift, **pause** with P, **restart** with R.
- Guards patrol with vision cones. Stay out of a cone, or hide in the bushes: a bush
  is cover, not invisibility — a guard right next to you can still see you.
- The detection meter fills while a guard sees you and drains when you are hidden.
  When it fills, the alarm is raised: the guard chases you. Break line of sight and
  the guard runs to your last seen spot, searches, then goes back to patrol — you get
  a chance to recover.
- Crates and walls block a guard's sight. Footstep ripples show where guards walk.

## How it works

The behaviour the screenshots show is built from a few named functions:

- `hasLineOfSight` / `rayOcclusionDistance` (`game/src/world.js`) — the ONE occlusion
  test the whole game shares: the detection meter and the drawn vision cone both use
  it. The cone is a polygon of rays cast through that test, with extra rays through
  occluder corners so its edge follows walls and crates closely — the meter measures
  the exact ray to the player, so at a crate corner the drawn edge can still sit a
  few pixels short of it.
- `updatePatrol` (`game/src/world.js`) — each guard walks its loop and pauses 1.2 s at
  every waypoint; the pause is the readable window to cross.
- `updateChase` (`game/src/world.js`) — a chasing guard runs at you while it sees
  you; once sight breaks it runs to your last seen spot, then searches. It can only
  catch you with a clear line of sight.
- `updateDetection` (`game/src/world.js`) — the detection meter fills while a guard
  sees you and, after a 0.8 s hold once sight breaks, drains while you stay hidden.
  Only this function writes the meter.
- `stageShot` (`game/src/shots.js`) — the four screenshots (cover, patrol, alarm, win),
  each staged from the running game: `?shot=cover|patrol|alarm|win`.

Layout: `game/src/level.js` (the map), `game/src/world.js` (rules), `game/src/render.js`
(drawing), `game/src/input.js` (keyboard + pointer), `game/src/config.js` (tuning),
`game/src/shots.js` (screenshot scenes), `game/src/main.js` (boot + loop).

Play it: `node serve.ts`, then open http://localhost:8080 in a desktop browser.
No network requests, no libraries — vanilla JavaScript and canvas.
