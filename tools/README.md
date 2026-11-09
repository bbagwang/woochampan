# 우참판 showreel & site — build tools

Everything in the showreel is generated in code: no stock footage, no photos.

| Piece | File | What it is |
| --- | --- | --- |
| CG food renderer | `assets/js/lib/food.js` | GLSL height-field "flat-lay" renderer (ray-marched tilt camera, soft shadows, AO, GGX + subsurface meat shading). Recreates the 우참판 plating: ridged black slate, 1++ tenderloin medallions, star-cut shiitake, king oyster, asparagus, fern; plus grill shots. |
| Real-time shaders | `assets/js/lib/shaders.js` | Hanwoo marbling (BMS 1–9), fire / coal pit, post-processing grade. Used by both the reel and the website. |
| Motion engine | `reel/reel.js` | Deterministic `renderFrame(t)` for the 36 s piece (1920×1080, 60 fps). Open `reel/` in a browser to watch it live with a scrubber. |
| Soundtrack | `tools/audio.py` | numpy-only synth: Karplus–Strong gayageum plucks, sub impacts, risers, kick/clap/hats, sizzle, door knock, FFT convolution reverb. Hits are on the same timeline as the reel. |

## Rebuild

```bash
node tools/bake.cjs                     # CG stills -> assets/img/cg/*.png (≈4 min each on SwiftShader)
python3 tools/audio.py /tmp/reel.wav    # soundtrack
node tools/render.cjs --frames --workers 4 --out /tmp/frames   # 2160 PNG frames
tools/encode.sh /tmp/frames /tmp/reel.wav                      # -> assets/media/*
```

`node tools/render.cjs --stills 4.3,12.6 --out /tmp/stills` renders single frames for review.
All Node tools expect Playwright's Chromium (`require('playwright')`).
