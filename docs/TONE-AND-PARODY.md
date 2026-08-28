# Tone doctrine — how every scene in this game is built

**This governs every scene. Read it before writing, dressing or tuning any of
them.** It is the owner's, stated 2026-08-04, and it is not a style preference —
it is the thing the game is.

## The rule

> The PARODY is the whole game and the fact you go OHHH this is the SCENE from
> HEAT! when you are playing it. The PARODY is not the scene itself trying to be
> funny. The joke itself is the fact you are playing SCENES from famous movies in
> a game that ITSELF is entirely a JOKE. But the SCENE needs to be REAL and
> INTENSE and KIND OF FUCKING HARDCORE.

And:

> There's a special feeling in games like Conker's Live & Reloaded and GTA 3–5
> where you load into a mission and KNOW ohhh this is a satirical parody of
> [some] FAMOUS movie scene. It still needs to be FUN and REAL in the game
> world. The PARODY is for the player playing it that KNOWS what it's from and
> gets a chuckle, but the SCENE is NOT a comedy scene.

## What that means in practice

**The joke is delivered by recognition, not by the scene.** The player supplies
the laugh, from outside, because they know what they are looking at. The scene's
job is to be worth playing on its own terms. A bank job plays as a bank job.

**Play it straight, at full intensity.** Real stakes, real tension, real
consequence. The adrenaline is the point. If a beat would be tense in the film
it is parodying, it is tense here — undercutting it with a gag is the failure
mode, not the goal.

**Do not let the scene wink.** No nudging the player about the reference. No
character remarking that this is like a movie. No lampshade. The moment the
scene acknowledges the joke, the joke is gone, because the joke was the player's
to notice.

**The comedy lives in the world, not in the scene's spine.** Sasquatches in a
mob, Big Uncle Lou, the Bada Bing, jerky logistics, the Shubenator wandering in
— that is where the absurdity lives, and it is funny precisely because everyone
in it is playing the situation completely straight. Dialogue can be deadpan
funny. The mission structure, the threat, and the failure states must not be.

**Detail and completeness are load-bearing.** A scene that plays thin reads as a
sketch, and a sketch cannot carry the recognition. "It needs to be detailed and
complete" is a tone requirement, not a polish requirement — an under-built scene
fails the doctrine before any of its writing is heard.

## HUD instructions never replace a character

When the game needs to tell the player which button, the character speaks
first and the screen clarifies afterwards — never both at once, and never the
screen instead. Ape says "This is the part where we make sure everybody
remembers this conversation. The one on the couch. Deke." and *then* the HUD
says which button fires. Showing the instruction on the same frame reads as the
game talking over its own cast, and it gives the beat away before the character
has finished setting it up.

Owner's rule, stated 2026-08-04, and it applies in every scene. `sayThenInstruct`
in `src/silvercase/main.js` is the shape: play the beat, put the instruction up
in its `onDone`.

## The test

Two questions, and a scene has to pass both:

1. Would this be a good mission if the player had never seen the film?
2. Does the player who *has* seen the film get the chuckle without the scene
   ever pointing at it?

A yes to 1 and a no to 2 means the reference is too buried. A no to 1 means the
scene is coasting on the reference and has to be built properly. Only a scene
that is genuinely good on its own terms can afford to be a parody at all.

## Scenes this governs

Every one, including the ones not yet written. Known references in flight:

| Scene | Playing straight as | The recognition |
|---|---|---|
| THE TAKE | a bank robbery and a street shootout | *Heat* (1995) |
| The Silver Case | collecting a debt in somebody's apartment | *Pulp Fiction* |
| SQUATCHOLA GAY | a night bombing raid | *Enola Gay* / the war-film raid |
| NO WAKE | a man taken out on a boat | *The Sopranos*, the Big Pussy episode |
| The Squatchfather | the meeting | *The Godfather* |
| Front and Center | a date at a supper club | the mob-restaurant scene |

The pattern holds in all of them: the situation is the joke, the execution never
is.
