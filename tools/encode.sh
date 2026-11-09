#!/usr/bin/env bash
# Encode the rendered PNG sequence + synthesized soundtrack into the site's media.
#   tools/encode.sh <frames_dir> <audio.wav> [hero_frames_dir (30 fps, from render.cjs --hero --fps 30)]
set -euo pipefail
FR=${1:?frames dir}
WAV=${2:?audio wav}
HERO=${3:-}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/media"
mkdir -p "$OUT"

# 1080p60 master with sound (modal player)
ffmpeg -hide_banner -loglevel warning -y -framerate 60 -i "$FR/f_%05d.png" -i "$WAV" \
  -c:v libx264 -preset slow -crf 20 -maxrate 14M -bufsize 28M -profile:v high -pix_fmt yuv420p \
  -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT/showreel.mp4"

# soundtrack alone, for the live engine at reel/
ffmpeg -hide_banner -loglevel warning -y -i "$WAV" -c:a aac -b:a 160k -movflags +faststart "$OUT/showreel.m4a"

# light, silent loop for the hero background (text-free food film if rendered, else the reel)
if [ -n "$HERO" ]; then
  ffmpeg -hide_banner -loglevel warning -y -framerate 30 -i "$HERO/f_%05d.png" \
    -vf "scale=1600:900:flags=lanczos" -c:v libx264 -preset slow -crf 24 -profile:v high -pix_fmt yuv420p \
    -an -movflags +faststart "$OUT/showreel-hero.mp4"
  ffmpeg -hide_banner -loglevel error -y -i "$HERO/f_00000.png" -vf "scale=1600:900:flags=lanczos" -q:v 3 "$OUT/hero-poster.jpg"
else
  ffmpeg -hide_banner -loglevel warning -y -framerate 60 -i "$FR/f_%05d.png" \
    -vf "fps=30,scale=1280:720:flags=lanczos" -c:v libx264 -preset slow -crf 27 -profile:v high -pix_fmt yuv420p \
    -an -movflags +faststart "$OUT/showreel-hero.mp4"
fi

# poster, social card, chapter thumbnails
frame() { printf "%s/f_%05d.png" "$FR" "$(python3 -c "print(round($1*60))")"; }
ffmpeg -hide_banner -loglevel error -y -i "$(frame 7.4)" -q:v 3 "$OUT/poster.jpg"
ffmpeg -hide_banner -loglevel error -y -i "$(frame 7.4)" -vf "crop=1920:1008:0:36,scale=1200:630:flags=lanczos" -q:v 3 "$OUT/og.jpg"
i=1
for t in 3.0 6.9 9.95 13.6 18.9 20.6 28.9 33.0; do
  ffmpeg -hide_banner -loglevel error -y -i "$(frame $t)" -vf "scale=640:360:flags=lanczos" -q:v 4 "$OUT/ch-$i.jpg"
  i=$((i+1))
done
ls -la "$OUT"
