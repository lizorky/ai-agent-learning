# Demo archive — 2026-09-25

The current playable work is `prototypes/punch-test/index.html`, not the older multiplayer framework described in README.md.

From this project directory, run:

```sh
python -m http.server 4174 --bind 127.0.0.1
```

Open http://127.0.0.1:4174/prototypes/punch-test/index.html.

Controls: A/D walk, double-tap a direction to run, J four-hit combo, K jump/double jump, Esc pause, H hitbox display.

Current behavior:
- Attacks 1, 2 and 4 support forward movement with walking legs.
- Attack 3 preserves its original full-body animation in place and launches the enemy.
- Held reverse movement resumes after attack recovery.
- Walking and attack movement share enemy collision handling.
- Lower-body hurt regions follow separate opaque runs instead of one broad rectangle.

Known limitations:
- Waist/leg compositing still has visible deformation; visual acceptance is pending.
- Enemy is a stationary combat-test opponent, not a completed first level.
- Browser smoke scripts currently reference the development machine's Playwright and Chrome paths.
- Included art has mixed provenance; this archive is not a declaration of redistribution rights or a release-ready asset package.

Excluded from this archive: temporary browser profiles/caches, build outputs, local shortcuts, original third-party asset ZIP packages and their unpacked source collections. Runtime enemy images remain included.

Validation before archiving: combo smoke (rapid, spaced and after-recovery input), left/right walk-attack smoke, movement/recovery regression, and 11 combat/enemy/run unit tests passed.
