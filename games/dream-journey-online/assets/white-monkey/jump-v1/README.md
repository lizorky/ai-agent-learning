# Jump animation v1

User-supplied videos are preserved centrally as `../source-videos/jump-takeoff.mp4` and `../source-videos/jump-landing.mp4`. These are the corrected takeoff and landing sources; earlier walking/running videos are not reused for jumping.

24 fps source frame indices:
- takeoff: 0, 12, 18, 24, 63, 66 from source-5
- rise: 73, 78, 84 from source-5
- fall: 0, 8, 16, 24 from source-6
- land: 30, 34, 40, 58, 62, 66, 70 from source-6

FFmpeg key: rgba, colorkey 0xCF00DA similarity .23 blend .06, crop 620x660 at (160,0). Remove remaining purple ground shadow below crop y=500. Keep full raised hands. Constant scale calibrated against takeoff frame 1; no per-frame height normalization. Align feet for grounded poses; video root translation is removed, game physics controls height. Different jump poses switch without cross-fade to avoid double silhouettes.

Demo: Space takes off (180 ms anticipation), a fresh Space in the air performs the second jump with airborne poses, landing plays 210 ms recovery and resets the count. Held Space does not repeat. Horizontal A/D movement is allowed in air; facing changes after returning to the ground. Ground-only punch remains unchanged. Skills and air attacks are out of scope.

Generated PNGs and browser verification outputs remain in the E-drive project. Original user downloads are untouched.
