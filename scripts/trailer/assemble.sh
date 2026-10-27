#!/bin/bash
# assemble.sh <format> <output.mp4>
# Frames from out/<format>/full + a score composed to its cuts -> one MP4,
# H.264 high profile, yuv420p, AAC 48k, loudness -14 LUFS, fast start.
set -euo pipefail
cd "$(dirname "$0")"
fmt=$1
out=$2
dir=out/$fmt/full
node compose.cjs "$dir/cuts.json" "$dir/score.wav"
ffmpeg -v error -y -framerate 30 -i "$dir/%05d.jpg" -i "$dir/score.wav" \
  -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf 18 -profile:v high -pix_fmt yuv420p -r 30 -g 60 \
  -af "loudnorm=I=-14:TP=-1.5:LRA=7,afade=t=out:st=$(python3 -c "import json;c=json.load(open('$dir/cuts.json'));print(round(c['frames']/30-0.6,2))"):d=0.6" \
  -c:a aac -b:a 192k -ar 48000 \
  -shortest -movflags +faststart "$out"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height -of compact "$out"
