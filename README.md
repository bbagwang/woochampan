# 우참판 서래본점 — woochampan.com

Landing page for 우참판, the 1++ No.9 hanwoo house in Seorae Village (서울 서초구 서래로 23 이오빌딩 3층).
Static site, served by GitHub Pages (`CNAME` → woochampan.com).

```
index.html              landing page (Korean)
assets/css/site.css     styles: same design tokens as the showreel
assets/js/site.js       interactions: reveals, HUD synced to the hero video, WebGL marbling scale,
                        scroll-driven grill sequence, lattice doors, live KST open/closed status
assets/js/lib/          shared WebGL code: food renderer, marbling / fire / post shaders
assets/img/             CG plating renders (generated, see tools/)
assets/media/           showreel (1080p60 + sound), hero loop, poster, chapter thumbnails
reel/                   the showreel engine — open /reel/ to watch it render live, with a scrubber
tools/                  bake / render / audio / encode scripts (see tools/README.md)
```

Restaurant facts (hours, rooms, prices, corkage, valet) come from the shop's CatchTable listing
(menu data dated 2025-12). Plating and food images are CG reconstructions, not photographs.

Local preview: `node tools/serve.cjs . 8123` then open http://127.0.0.1:8123/.
