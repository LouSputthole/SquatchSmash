# Vendored skills

`threejs-*` are from https://github.com/CloudAI-X/threejs-skills — reference
notes on the three.js API for agents working in this repo. They are NOT shipped
with the game and nothing in `src/` imports them; they exist so that a session
working on the apartment has accurate constructor signatures and patterns to
hand instead of recalling them.

Note: that repository carries no LICENSE file. Its README explicitly says to
clone it into your project or copy the skills directory, so use is clearly
intended, but there is no formal grant. If that matters for this project,
either ask the author to add one or delete this directory -- nothing depends
on it.
