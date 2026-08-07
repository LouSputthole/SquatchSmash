# Video

## Current channels

- `austin-2.mp4` - THE AUSTIN TAPE
- `hog-mamas-show.mp4` - HOG MAMA'S SHOW (Sebesta Does Stand-Up)
- `godfather-sollozzo.mp4` - the mansion home theatre, reel 1 (The Godfather, "Killing Sollozzo and McCluskey")
- `goodfellas-copacabana.mp4` - the mansion home theatre, reel 2 (Goodfellas, the Copacabana long take)
- `heat-bank-robbery.mp4` - the mansion home theatre, reel 3 (Heat, the bank robbery)
- `blow-opening.mp4` - the mansion home theatre, reel 4 (Blow, the opening scene) and the apartment's gangster-marathon channel

Tapes for the telly. A file in here becomes a channel via `videoChannel()` in
`src/core/tv.js` — it is blitted onto the same 512x288 canvas every other
channel paints on, and its sound goes out through a panner at the set.

Encode to the screen's own size, or the browser scales a 1080p frame down sixty
times a second for no visible gain:

    ffmpeg -i source.mp4 \
      -vf "scale=512:288:force_original_aspect_ratio=decrease,pad=512:288:(ow-iw)/2:(oh-ih)/2,fps=24" \
      -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p -profile:v main \
      -movflags +faststart -c:a aac -b:a 64k -ac 1 \
      assets/video/name.mp4

H.264 in an mp4, because every browser plays it. A single-file `npm run bundle`
build has no folder to fetch from, so the channel shows its "no tape" card
there rather than failing — that is expected, not a bug.
