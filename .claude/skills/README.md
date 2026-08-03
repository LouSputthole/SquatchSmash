# Vendored skills

Reference material for agents working in this repository. None of it is shipped
with the game; nothing in `src/` imports any of it.

## `img2threejs`

From https://github.com/img2threejs/img2threejs, **Apache-2.0** (`LICENSE` is
included). A staged pipeline for rebuilding the subject of a reference image as
a code-only procedural Three.js model — sculpt spec, generated factory, and a
vision-based self-correction loop.

It is here because that is exactly what this project already is: every
character, the club, the aeroplane and the boat are procedural Three.js built
in code, and `assets/faces/*.png` are authoritative reference photographs for
named members of the Circle. The identity layer in `src/core/characters.js` is
the contract any generated model has to come through, so a future art pass can
use this without moving a name, voice, dialogue flag or save id.

Vendored without the upstream `.git` and `.github` directories. Update it by
re-cloning upstream and copying over the same path; do not hand-edit it, or the
next update silently drops the fix.

## `threejs-*`

From https://github.com/CloudAI-X/threejs-skills — reference
notes on the three.js API for agents working in this repo. They are NOT shipped
with the game and nothing in `src/` imports them; they exist so that a session
working on the apartment has accurate constructor signatures and patterns to
hand instead of recalling them.

Note: that repository carries no LICENSE file. Its README explicitly says to
clone it into your project or copy the skills directory, so use is clearly
intended, but there is no formal grant. If that matters for this project,
either ask the author to add one or delete this directory -- nothing depends
on it.
