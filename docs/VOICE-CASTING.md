# Voice casting — LOCKED (2026-07-30)

Source of truth: the owner's `Voice_Ids.xlsx` (uploaded 2026-07-30), hand-picked
ElevenLabs voices. Rows 2–20 of that sheet are **the Family**. The rules the
owner set, now standing:

1. **Everyone in the Family table hangs out at the Bada Bing** when the player
   is not on their mission. (Hog Mama included — she was radio-only before;
   the owner's sheet puts her in the room.)
2. **A character is one person everywhere.** The Sasole at a Bing table is the
   Sasole in the Beef Run cockpit is the Sasole at the Initiation: one stable
   id, one voice id, one face, every scene.
3. **The sheet's voice wins over whatever was recorded.** Every line spoken by
   a recast character regenerates. The old ids were stock placeholder
   castings; none of them survive.
4. **And two characters are not one person.** *(Added 2026-08-24.)* Rule 2 only
   ever ran one way — one character, one id, every scene — and nothing here
   said the reverse, so ids drifted onto each other one paste at a time and the
   first anybody heard of it was the owner asking why Rico in the Jerky Motel
   sounded like Captain Lou Sasole. An id belongs to one character. Sharing one
   is still allowed, but only as a decision somebody made on purpose and wrote
   down where the next person will find it: the sanctioned pools all do, in
   their own `_note` in `assets/sfx/manifest.json` — `npc-male` is *"neutral by
   design — this voice has to sit behind a dozen different faces without
   becoming a character"*, `mansion-guard` is *"one voice across all of them on
   purpose: they are the same job, not the same man"* — and the GATE/BOOTH pair
   at `src/mansion/script.js:77-89` argues the case in full before letting two
   speakers share `mansion-gate`. This is the prohibition already sitting in
   the Cecilio row below (*"LOCKED; never reuse for a scene-local Motel
   antagonist"*), generalised from one voice to every voice.

   `tests/voice-casting-distinctness.test.mjs` holds the half of this a machine
   can hold: any two profiles sharing an id fail the suite unless the group is
   allowlisted there with its reason. Read its header before you trust it — it
   compares ids, so it is green on Rico, whose id is genuinely his own and
   merely sounds like Sasole's. Nothing but a person listening catches that,
   and this rule is owed one listening pass per new cast.

The `voices` block of `assets/sfx/manifest.json` now carries these ids —
that block is what the generator reads, so the manifest is the lock and this
document is the ledger. `tools/generate-sfx.mjs` gained `--cast <voice,...>`
(2026-07-30) to regenerate exactly one character's lines.

## The Family — locked

| Character | voice profile | LOCKED ElevenLabs id | replaced | lines to redo | face photo |
|---|---|---|---|---|---|
| Lag | `lag` *(new)* | `fBD19tfE58bkETeiwUoC` | — | 0 | **MISSING** |
| Gratin | `gratin` | `UgBBYS2sOqTuMpoF3BR0` | pqHfZKP7… | 13 | `gratin.png` |
| Eric | `eric` | `A7AUsa1uITCDpK29MG3m` | cjVigY5q… | 13 | `erican.png` |
| Hog Mama | `hogmama` | `052jzHJceQiZr7ltnY0C` | FGY2WhTY… | 24 | `hogmama.png` |
| DeathMegatron | `deathmegatron` *(new)* | `bD9maNcCuQQS75DGuteM` | — | 0 | `deathmegatron.png` |
| Big Uncle Lou Sputthole | `lou` + `lou1` | `M9UAxraM2w5tCjpOaIB0` | bIHbv24M… | 35 | `lou.png` |
| Booskibro | `booski` | `s2wvuS7SwITYg8dqsJdn` | N2lVS1w4… | 27 | `booski.png` |
| Captain Lou Sasole | `lou2` | `QzTKubutNn9TjrB7Xb2Q` | TX3LPaxm… | **155** | `sasole.png` |
| Willy | `willy` *(new)* | `R9EZoy8pXSL8Yh4yxiew` | — | 0 | **MISSING** |
| Irish | `irish` | `qwaVDEGNsBllYcZO1ZOJ` | JBFqnCBs… | 24 | **MISSING** |
| Ape | `ape` | `pI7p9goUOVAfkfaP1k9Z` | CwhRBWXz… | 30 | **MISSING** |
| Old Stove | `old-stove` | `lUTamkMw7gOzZbFIwmq4` | nPczCjzI… | 10 | **MISSING** |
| Snow | `snow` *(new)* | `OhisAd2u8Q6qSA4xXAAT` | — | 0 | `snow.png` |
| Rippinflow | `rippinflow` *(new)* | `rHWSYoq8UlV0YIBKMryp` | — | 0 | `rippinflow.png` |
| Seff | `seff` *(new)* | `lnFzEtvLAfx8I9DtiJTS` | — | 0 | **MISSING** |
| The Shubenator | `shubenator` *(new)* | `vpPOiJgwc09J0uCYqE35` | — | 0 | `shubes.png` |
| Numbskull | `numbskull` *(new)* | `R4Zv8YQNcHyNDZl0ViUG` | — | 0 | **MISSING** |
| *Radio (station voice)* | `announcer` | `dn9HtxgDwCH96MVX9iAO` | pNInz6ob… | 62 | n/a |

The prospect (**Tony Squatchtana**, profile `player`, 365 lines) was not
recast — his voice stands.

### Gaps that need the owner

1. ~~**Numbskull has no voice id.**~~ **Closed 2026-07-30** — the owner
   supplied `R4Zv8YQNcHyNDZl0ViUG`, it is in `voices.numbskull.id`, and his
   two hangout lines are now manifest cues (`vo.bing.hang.numbskull.1/.2`)
   and recorded like everyone else's. Nothing outstanding.
2. **Four Family faces missing.** Old Stove's, Irish's, and Ape's supplied
   faces now live under `assets/faces/`. Drop PNGs under these remaining ledger
   names and every scene picks them up: `lag.png`, `willy.png`, `seff.png`,
   `numbskull.png`.
3. Station voices `uncle` (98.8) and `ksqch` (101.7) keep their old stock
   ids — the sheet supplied one radio voice and 97.8 got it. Shout if those
   two should recast as well.
4. Still provisional: `hr`, `unknown` (the caller), `lookout`, `motel-rico`,
   `motel-chino`, and `npc-male`. The last three now use the owner's reserved
   Boston, Southern, and old-man NPC rows respectively so their lines can be
   auditioned without borrowing Cecilio or the Bing doorman. The voice lead
   must approve or replace those three ids before locking the final cast.
5. **Two ids reserved, no character built yet (2026-08-05).** The owner
   supplied ElevenLabs ids ahead of the NPCs they're for — not bound to a
   profile in `assets/sfx/manifest.json` because no `voiceProfile:` in code
   references them yet. Bind whichever name lands (matching the `sauce`
   staging pattern: name the profile in `src/core/characters.js`, then paste
   the id into `voices.<name>.id`) and drop this row.
   - `8vdIucMc14HcML5KYpFx` — a female NPC in Lou's room.
   - `wRLtZBD4lymiso8Hiwws` — a male NPC.

### HotDog incident casting gaps

The closed-party/graveyard pass adds three dedicated profiles whose cue banks
are already authoritative and visible in `VOICE-LINES-TODO.md`. HotDog, Aubbie,
and Echo are owner-cast. Lawnmower is Snow in this sequence and retains the
existing locked `snow` voice:

| Role | profile | bank | direction |
|---|---|---|---|
| Billy HotDog | `hotdog` | `vo.bing2.hotdog.*` | `Pcfg2Zc6kmNWQ9ji3J5F`; loud, comfortable, casually cruel; final insult gets quieter |
| Aubbie | `aubbie` | `vo.bing2.aubbie.*` | `3Qc2SrJq4us6etYTOtzn`; tired, practical, dry repair-estimate delivery |
| Lawnmower / Snow | `snow` | `vo.bing2.lawnmower.*` | Existing locked Snow voice; one fast affectionate heckle |
| Echo | `echo` | `vo.graveyard.echo.*` | `fbIG6gEosVIM95R5qOna`; clean frightened delivery, runtime supplies grave muffling |

All HotDog incident voice profiles are now cast. To generate any future missing
clips from these banks, run:

```bash
npm run sfx -- --voice-only --cast hotdog,aubbie,echo,snow
npm run sfx:listen
```

Do not cast Ericran separately: `erican` and `ericran` are compatibility
spellings for the existing Eric identity and `eric` voice.

## Everyone else from the sheet

| Sheet row | profile | id | where it speaks |
|---|---|---|---|
| Date Copacabana **Margo** | `margo` | `XlDdozLmuTofIxK4BjPD` | Silver Room date + her call (4 lines to redo — this closes the "recast Margo off the hogmama placeholder" item) |
| Don Cecilio Barriga | `cecilio` | `IpCcRCVYm2nsZJjBFn4H` | The Beef Run's other end (`vo.beefrun.*`). LOCKED; never reuse for a scene-local Motel antagonist. |
| Boston side character *(provisional Rico)* | `motel-rico` | `UZvBfqEdvCFLqsBOo9Zr` | Rico's exact Motel catalog. Audition takes exist; voice-lead approval required before locking the cast. |
| Southern NPC *(provisional Chino)* | `motel-chino` | `x9G2ivoqdzPgvaOC8XUa` | Chino's exact Motel catalog. Audition takes exist; voice-lead approval required before locking the cast. |
| Old man NPC pool *(scene locals)* | `npc-male` | `THy3prVIjAFnT9vQVvCB` | Motel sellers/lookouts/clerk and the Bing contractor. **Row corrected 2026-08-24.** It read `NOpBlnGInO9m6vDvFkFC` for the nineteen days since the owner recast this pool onto its own id on 2026-08-05, and that older id is now `heist-guard`'s alone — the bank customer, the manager and this pool were all moved off it. So the ledger was quietly naming the bank security guard as the motel clerk. Gap 4 below still lists the profile as provisional: the id is the owner's own old-man NPC row, the voice lead's approval is not on record. |
| Dealer, cards, in Bada | `dealer` *(new)* | `snyKKuaGYk1VUEh42zbW` | blackjack VO below |
| Bartender in Bada | `bartender` *(new)* | `nUEpF21E0nXsKMw4L4CS` | bar barks below |
| Side guards / doorman, Bing | `doorman` *(new)* | `fhZTG3MTnv8OnksvofJI` | door barks below; backups `7fbQ7yJuEo56rYjrYaEh` (deep), `Je8d8oi82sj0l8L1VM0l` |
| Performer in Bada (female) | `performer` *(new)* | `9QPzUjm1evjwY2ENQBKU` | stage barks below; backups `75MqelvgFq5upx0r44WK`, `qBDvhofpxp92JgXJxDjB`, `k6aNMn2EN3T8vpJSBhQw` |
| Squatchfather Italian (Sal / McOwell) | `sal`, `mcclawsky` | Sal `q3pCVYOxlOb5G3l2O13o`, McClawsky `yowh82B72eMNrxcxHgBh` | folded in via PR #4 (2026-07-31): 27 `vo.sf.*` cues in the root manifest (12 Sal, 6 McClawsky, 9 Tony). The sheet's row named one primary and one backup id; the two men got one each so they don't share a voice at the same table — swap `mcclawsky`'s id if that read is wrong (note it doubles as row 40, "Italian Waitstaff"). Supersedes the fold on `claude/squatchfather-scene-o13uzh`, which can be deleted. |
| Guards (Italian) | — | `OBLxU3DhFiBOh33EeRvi` | reserved; profile added when lines exist |
| NPC pools (male ×4+, female ×3, old man, southern, Boston, German, clear male, waitstaff m/f, Italian waitstaff) | — | see `Voice_Ids.xlsx` | reserved for ambient NPC barks; add profiles as lines get authored |

## The redo batch

Run wherever `ELEVENLABS_API_KEY` lives (any machine; the repo is static):

```bash
# 1. The recast Family + Margo + Cecilio — 342 lines:
npm run sfx -- --force --cast gratin,eric,hogmama,lou,lou1,lou2,booski,irish,ape,old-stove,margo,cecilio

# 2. The 97.8 station voice — 62 lines:
npm run sfx -- --force --cast announcer

# 3. Every missing, currently playable voice line (no --force needed).
#    This command excludes the authored but unreachable Initiation party:
npm run sfx:vo

# 4. Rebuild the audio index the game fetches from:
npm run sfx:listen
```

PowerShell on Windows: same commands, same order.

## New lines — the Bada Bing floor

Written 2026-07-30 to give every Family member something to say when Tony
walks up between missions, plus the beats the wave-2 notes ordered (Booski's
shot, blackjack VO). **In the manifest as of 2026-07-31 — 56 `vo.bing.*`
cues**. **Recorded 2026-07-30** — 56 plus Numbskull's two, once his id
landed, by `npm run sfx -- --voice-only`. Every line on this page now has a
clip behind it.

Wiring (2026-07-31): the Family hangout floor plays the hangout beats
(Numbskull's included, now that his clips exist), Booski's shot beat, and
the blackjack dealer/Tony lines through `src/bing/family.js` + `main.js`'s
exact-name `voiceCue()`. `applyBingVoiceCues()` now also assigns a stable cue
to every remaining scripted Bing line and Tony reply; `npm run vo:bing` writes
their exact text to the manifest. The full recording backlog is generated by
`npm run audio:todo`, not hidden behind an unwired subtitle.

Naming: `vo.bing.hang.<char>.<n>` for hangout lines,
`vo.bing.hang.<char>.tony.<n>` for the prospect's replies (voice `player`),
`vo.bing.booski.shot.*`, `vo.bing.blackjack.*`, `vo.bing.door.*`,
`vo.bing.bar.*`, `vo.bing.stage.*`.

### Hangouts (one beat per Family member)

**Lag** (`lag`)
1. "You see the lights flicker just now? That ain't the wiring, that's packet loss. This whole building is on wifi." (6s)
2. "I don't dance, Prospect. I peaked in a game you never heard of and I'm still cooling down." (6s)
- Tony: "The jukebox is not a server, Lag." (3s)

**Gratin** (`gratin`)
1. "The kitchen here does one thing, and it is shrimp, and it is wrong. I still order it. Loyalty." (7s)
2. "Sit. Eat something. You look like a prospect who skips lunch, and dead men skip lunch." (6s)
- Tony: "I ate an egg today, actually." (3s)

**Eric** (`eric`)
1. "Big things happening overseas, Prospect. Nobody in this club reads. I read. Ask me anything." (6s)
2. "Off the record? The family's press situation is terrible, because we shoot the press." (6s)
3. "The chicken shawarma nearby is unbelievable. Best thing within walking distance, and I have checked repeatedly." (6s)
4. "Garlic sauce, pickles, crispy edges. That rotating spit has done more for this neighborhood than local government." (6s)

**Hog Mama** (`hogmama`)
1. "Gimme a word, baby. Any word. I'll make a whole bit out of it, right here, no net." (6s)
2. "You? You're a bit already, honey. Walkin' around all serious with them little errands." (6s)
- Tony: "Please don't make me a bit." (2.5s)

**DeathMegatron** (`deathmegatron`)
1. "I ordered a spritz. They gave me a spritz. Ain't every day the world does what it should." (6s)
2. "Relax, kid. Nobody dies on a Tuesday. Statistically that ain't true, but relax anyway." (6s)

**Big Uncle Lou Sputthole** (`lou`)
1. "There he is. My favorite errand with legs. You keepin' your nose clean or just wipin' it?" (6s)
2. "Everything in this room I either bought, won, or forgave. Remember that when you want somethin'." (6.5s)

**Booskibro** (`booski`)
1. "PROSPECT! Get over here before I love you from a distance like some kinda stranger!" (5.5s)
2. "I had six hundred on red and it came up FAMILY, baby. House pays either way when it's my house." (6.5s)

**Captain Lou Sasole** (`lou2`)
1. "Ground people, Tony. Everyone in here. Beautiful souls, zero situational awareness." (6s)
2. "You flew with me once and you walked away from the landing. That puts you top five pilots in this room." (6s)
- Tony: "Top five? Who's ahead of me?" (2.5s)

**Willy** (`willy`)
1. "I'm between things right now. Big things. Can't say. The things can hear." (5.5s)
2. "You want my seat? It's the best seat. That's why I'm in it. I test 'em all after close." (5.5s)

**Irish** (`irish`)
1. "Before you say anything — here. One hundred dollars. I had it earmarked for eggs, but you look like a developing situation." (7s; first Bing One talk grants $100 once)
2. "A man should have walking-around money. Also, now you are financially invested in hearing the egg story." (6s)
3. "Sit down, sit down — I was just gettin' to the good part. So the egg, right, the SAME egg—" (6s)
4. "Nobody finishes a story anymore. Attention spans. Now — where was I. Start over. So. Eggs." (6s)
- Tony: "You told me the egg one, Irish." (2.5s)

**Ape** (`ape`)
1. "Statements made in this establishment are for entertainment purposes only." (5s)
2. "I am having a nice time. This is my nice-time face. It is load-bearing." (5s)

**Old Stove** (`old-stove`)
1. "City drinks, city prices, city ice. Ice used to mean somethin'." (5s)
2. "That aeroplane misses you. Don't you tell her nothin' I wouldn't say." (5s)

**Snow** (`snow`)
1. "Cold in here. Good." (2.5s)
2. "You talk a lot for a guy on a checklist." (3.5s)

**Rippinflow** (`rippinflow`)
1. "Prospect on the floor, yeah, walkin' like rent's due — that's a bar, that's free, someone write that down." (6.5s)
2. "I don't freestyle no more. Anyway — look at him, suit like a verdict, uh — see, it happened again." (6.5s)

**Seff** (`seff`)
1. "Quick thing. You got a guy for mattresses? Doesn't matter. Forget it. I GOT the guy. I'm the guy." (6s)
2. "This round's on me the moment somebody explains my situation to Lou. You'll do that, right?" (5.5s)

**The Shubenator** (`shubenator`)
1. "I did nine hundred push-ups today. The number is not the impressive part. The floor was." (5.5s)
2. "You need mass, Prospect. Order the shrimp. Order nine shrimp." (4.5s)

**Numbskull** (`numbskull` — id landed 2026-07-30, generates with the rest)
1. "I like you. I decided this morning. It's done now, so don't worry about it." (5s)
2. "Lou says I'm the muscle. Booski says I'm the heart. I say ow." (5s)

### Booski's shot (the owner's booked beat)

- `vo.bing.booski.shot.offer` (`booski`): "You look empty-handed, Prospect. That's a ME problem now. You want a shot? Course you want a shot." (6s)
- `vo.bing.booski.shot.yell` (`booski`): "AY! I want that shot in thirty FUCKING seconds!" (4s)
- `vo.bing.booski.shot.handoff` (`booski`): "Twenty-eight. He's growin' on me. Drink, baby." (4s)
- `vo.bing.booski.shot.tony.1` (`player`): "Thanks. I was gonna say no, and then I heard the yelling." (4s)

### Blackjack (wave-2 backlog: explicit VO)

- `vo.bing.blackjack.dealer.deal.1` (`dealer`): "Cards comin' in." (2s)
- `vo.bing.blackjack.dealer.deal.2` (`dealer`): "Good luck, prospect." (2s)
- `vo.bing.blackjack.dealer.win` (`dealer`): "Player wins. Somebody's kissin' the right rings." (3.5s)
- `vo.bing.blackjack.dealer.lose` (`dealer`): "House takes it. The house always liked me better." (3.5s)
- `vo.bing.blackjack.dealer.push` (`dealer`): "Push. Nobody wins, everybody stays pretty." (3s)
- `vo.bing.blackjack.dealer.bust` (`dealer`): "That's a bust, sweetheart." (2.5s)
- `vo.bing.blackjack.tony.win` (`player`): "Hey — that's how you do that." (2.5s)
- `vo.bing.blackjack.tony.lose` (`player`): "That card was personal." (2.5s)

### Door, bar, stage

- `vo.bing.door.in.1` (`doorman`): "Go on in. He knows." (2.5s)
- `vo.bing.door.in.2` (`doorman`): "Nice night. Stays nice if you're nice." (3s)
- `vo.bing.bar.1` (`bartender`): "What're we havin'?" (2s)
- `vo.bing.bar.2` (`bartender`): "Comin' up. Don't watch me pour, it makes the hands weird." (4s)
- `vo.bing.bar.3` (`bartender`): "Booski's tab? Booski's tab is a myth I refill." (3.5s)
- `vo.bing.stage.1` (`performer`): "You're sweet. Tip the band, sweetheart." (3s)
- `vo.bing.stage.2` (`performer`): "Eyes up here are free. The winkin' costs." (3.5s)

## Consistency contract (implementation order)

1. `CHARACTER_IDS` in `src/core/campaign.js` grows an entry per Family
   member; face + voice resolve from the character id everywhere.
2. The Bing hangout floor (Family present between missions, walk-up talk
   using the lines above) lands **after** the in-flight Bada Bing wave-2 pass
   is harvested — that pass owns `src/bing/` and the shared figure builder.
3. The Initiation stays byte-frozen until the owner's playtest; its cast
   unifies onto these ids in the approved post-playtest rewrite.
4. Old Stove keeps his Beef Run post; being Family, he also gets his Bing
   seat. Manny stays a civilian ally — no Family table, no targeting logic.
