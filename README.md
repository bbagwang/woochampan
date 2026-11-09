# 우참판 서래본점 — woochampan.com

Landing page for 우참판, the 1++ No.9 hanwoo house in Seorae Village (서울 서초구 서래로 23 이오빌딩 3층).
A static site served by GitHub Pages (`CNAME` → woochampan.com).

```
index.html            the page (Korean)
assets/css/site.css   styles
assets/js/site.js     header state, mobile menu, reveal on scroll, opening status (Asia/Seoul)
assets/img/logo.png   the official 우참판 logo, unchanged except for a transparent background
assets/img/photo/     the shop's photos, resized to web sizes (WebP)
tools/serve.cjs       tiny static server for local preview
```

Store facts (hours, rooms, menu items, notices) come from the shop's CatchTable listing.
Menu prices are intentionally not published on the site.

Local preview: `node tools/serve.cjs . 8123`, then open http://127.0.0.1:8123/.
