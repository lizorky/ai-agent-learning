# White monkey: first punch prototype

Double-click the project-root PLAY PUNCH TEST.lnk shortcut. The same existing page now includes walking and turning.

- A/D: walk with a 12-frame loop. Reversing direction plays a 0.4-second, 12-frame turn before movement resumes. J: single punch; pressing during a turn queues one punch after it finishes.
- H: attack, player hurtbox and dummy hurtbox overlays.
- Esc: pause. Focus loss also pauses. Reset clears counters and position.
- Slow motion is available for inspection.

The shared PNG sequence is loaded from `assets/white-monkey/punch-01-v1/frames`.
Rear-foot and floor alignment uses alpha geometry per frame. The fist center is estimated from the leading silhouette at chest height. Active frames are 5–7 (one-based); damage is limited to one hit per swing. Target is a static training dummy, not an enemy AI. No equipment swapping or combo is implemented.

Validation: `node --test prototypes/punch-test/combat.test.mjs`. `browser-check.cjs` additionally verifies real browser asset loading, hit/miss behavior, one hit per swing and pause. Its Playwright path is specific to this workstation. Screenshots are in `verification/`.

Locomotion assets: assets/white-monkey/locomotion-v1. Walk uses source frames 4–27 (every other frame at runtime); turn uses frames 33–66 with stride 3. Background keyed with FFmpeg. Torso and ground anchors align the clips. Source AI blur in some frames remains. Validation: locomotion.test.mjs and movement-browser-check.cjs.
