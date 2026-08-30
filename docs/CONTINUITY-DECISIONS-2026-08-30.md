# CONTINUITY DECISIONS — 2026-08-30

> **DECIDED 2026-08-30, in session.** The owner ruled on every open item;
> outcomes are stamped inline below. Remaining open work is only what the
> stamps say is follow-up.

Written against the full-campaign continuity audit, then re-checked after
the 206-commit drop from the weekend's other kitchen landed on main (the
Act One cabin, the luxury apartment, the Day 12–13 arc). Claims below were
re-verified against the merged tree. Every item is something that can go
more than one way, where the ways lead somewhere different. **Nothing below
is a bug.** The bugs the audits found were fixed in this pass (list at the
bottom, for the record); these get decided.

Format follows the house rule: options lettered, my pick marked.

---

## 1 · ~~THE PALACE JUMPS THE FLAT~~ — RESOLVED by the other kitchen

The audit's biggest find — the Cartel Palace jumping the apartment and
orphaning the Special Meeting's Act One — was solved in the new spine: the
Booski call, the getting ready, and the pickup now play in the **luxury
apartment** (`src/luxury-apartment/main.js` carries
`SPECIAL_MEETING_BOOSKI_CALL` and the private lift owns the exit;
`MIGRATIONS[21]` carries legacy saves across). Nothing to decide; noted so
the audit trail closes.

## 2 · ~~THE "FIRST CABIN SCENE"~~ — FOUND, and the hard lock is fixed

The cabin arrived with the 206 commits (`src/cabin/`, the countryside
hideout). The hard lock you hit was real and total: the chapter's opening
nap had **no way to happen** — the bed refused in every branch, so Lou never
rang and every landmark silently refused E. Fixed in this pass: the bed now
sleeps in the two rest phases; landmark refusals say why; the ridge
overlook's interact box sat 174° behind the authored stance and now sits in
the view where you actually look; your auto-call timer is in (Lou rings
after ~2½ quiet minutes even if you never nap, and the four-walk tour
concedes after five); the objective card survives the title screen and now
names the outstanding places and the rifle rack. The "two activities" you
remembered was the old gate's wording — the shipped gate is four walks, and
the timer now caps it either way.

## 3 · STALE COPY FROM THE OLD ROUTE — the flat still narrates last month's campaign

**DECIDED: rewrite in the house voice.** Done this pass: the heist return points at Lou’s call (the new-space reward), the golf/date returns tell legacy saves the current truth, and Lou’s heist call names all seven pieces and the safehouse. Changed recorded lines are queued for the booth by the ledger pipeline.

Three clusters, all survivors of the pre-final-arc route:

- Post-heist: *"Wash it off, change, and hide the gear. **Then the Bing.**"*
  and the cleanup item *"Change for the Bada Bing"* — but the door sends him
  to the **Silver Case pickup**, then the mansion. The Bing is days behind
  him.
- Post-golf: *"One job left before seven. Lou will call."* and post-date:
  *"Tomorrow is the big night."* — both now sit **seven missions and three
  days** before the actual big night.
- Lou's heist call lists six kit items; the door requires **seven** (the
  cash duffel is never mentioned), and the call says *"a closed laundry"*
  where the heist's own vocabulary is *safehouse*.

- **(a) I rewrite all of it to the current route, in the house voice, one
  commit you can review line by line. (my pick)**
- (b) You dictate the lines you want and I place them.
- (c) Leave — every line still plays, it just points at the wrong future.

## 4 · THE NEWS AND THE PHONE NEVER HEAR ABOUT THE FINAL ARC

**DECIDED: full pass.** Done this pass where a surface exists: the shared message ids are split one-per-chapter (no more cross-marking; Willy stays on the harbor-morning tape where he is alive), the date evening got its own tape, and the big-night wire finally acknowledges the war for the legacy leg. FOLLOW-UP: the luxury apartment has NO news surface at all — the war week’s canonical evenings happen there, so “a wire for the new place” is the remaining build.

`CHAPTER_NEWS`/`CHAPTER_MESSAGES` stop at `post_heist`. The Special Meeting
night's bulletin is *"Quiet week on the wire… clear and warm tonight"* — the
night after a firefight at Lou's mansion and six thousand pounds of Fat
Squatch dropped on the wrong city. Two adjacent wrinkles: `no_wake`/`date`
share one answering-machine event id (so Lou's *"if Willy calls you…"*
message can play **after Willy is dead**), and `golf_morning`/`heist_day`/
`big_night` share another — hearing one chapter's messages silently marks
the others' as heard.

- **(a) Full pass: per-chapter news + messages for the final arc, and split
  the shared `HEAR_MESSAGES_*` ids so each chapter's tape is its own.
  That last part needs a small campaign-schema bump. (my pick)**
- (b) Minimal: split the ids only, so nothing is ever suppressed; write the
  arc's news later.
- (c) Leave it.

## 5 · REBOUND KEYS ARE DEAD IN NINE SCENES

**DECIDED: do it now, in session.** Running as an agent pass; the queued task card is superseded (dismiss it if it is still showing).

A player who rebinds Use gets a dead key everywhere except the apartment and
the Special Meeting — nine scenes compare the raw physical key instead of
running it through `translateKey` (movement keys are likely in the same
state there). Default bindings are unaffected, which is why nobody has hit
it yet. I've queued a ready-to-start task card for it ("Fix rebound interact
key dead in nine scenes") with the exact sites and the reference pattern —
start it when you want it; it's a mechanical but nine-scene change and it
deserved its own validated pass rather than riding this one.

## 6 · TWO HOMECOMINGS HAVE NO PASTIME

**DECIDED: fix the doc.** Done — the pastime comment now names the two bare evenings as deliberate.

The pastime system's own thesis (`CHAPTER_PASTIMES`): *"one thing of his
own, in every chapter that sends him home."* `heist_day` (home from Silver
Pines) and `date` (home from NO WAKE) send him home and have none.

- (a) Add one authored pastime to each — needs your call on what Tony does
  with those two evenings.
- **(b) Leave it, but fix the doc/comment so the thesis matches the table.
  (my pick, unless you have the two pastimes in your head already)**

## 7 · LATE-CAMPAIGN HOMES HAVE NO PREVIEW CHECKPOINT

**DECIDED: build the luxury checkpoints.** Running as an agent pass in a worktree.

Preview exits now carry the right apartment variant (fixed this pass) for
the five scenes that still send the player to the starter flat. The new
spine's late homes are a different gap: the **luxury apartment**'s stages
(the stayover, the Special-Meeting night, the post-Initiation freeplay) have
no `apartment=`-style variant system of their own, so previewing those
mornings still means playing to them. The other kitchen's
`CAMPAIGN_HUB_PREVIEW_BEATS` launcher covers entry points; arrival-by-exit
is what is missing.

- **(a) Extend the variant system to the luxury flat's checkpoints. (my
  pick, low urgency)**
- (b) Leave the fallback.

## 8 · THE INITIATION CEREMONY SHOWS NO OBJECTIVES — by design, currently

**DECIDED: the blank card stands.** Empty objective bar = watch this, per the scene’s own convention; timeouts guarantee no stall. Settled rule — do not add lines.

Every cabin cutscene phase (`ceremony`, `card`, `made`, `room`…) authors an
empty objective on purpose, with a watchdog timeout per the house rule. It
reads as "objectives broken" in a playtest, which is exactly what you
reported from the cabin.

- (a) Keep the authored silence — cutscenes don't give orders.
- **(b) Give the long phases one quiet line each ("The ceremony." / "Say the
  words.") so the panel never reads as broken. (my pick — cheap, and it
  cures the symptom you hit)**

## 9 · SMALL VOICE-AND-STYLE CALLS — batched

**DECIDED: all three, smallest versions.** Done this pass: the door says “the bank on Mercer”, the mansion’s transient top-center objective banner is retired (the standing panel owns the sentence), and the mansion card carries a standing line between mission beats.

- *"Leave for THE TAKE"* names a mission title where every sibling names a
  place. Rename to the bank's name, or leave the title-drop?
- The mansion draws the current order twice — the shared panel (standing,
  upper-left) and the mission's own `.ss-objective` (transient, top-center
  callout). Deliberate layering or one too many? If it bothered you in
  play, I'll keep the panel and retire the callout.
- The mansion panel goes blank between mission beats when the runtime hasn't
  published an objective; a fallback line ("PROJECT SILENT SQUATCH") would
  cover the gaps.

**My pick: all three, smallest versions.**

## 10 · A THEORETICAL DEAD END WORTH ONE LINE OF ARMOR

**DECIDED: just do it.** Done — the recovery adapter repairs `final_arc_locked` by unlocking the case, mirroring the seam-repair precedent.

`post_heist` with the Silver Case still locked produces a door refusal
(`final_arc_locked`) that the recovery system can't resolve — not reachable
on the normal route today, but if any future change ever produces it, the
save is stuck for good. One line in the recovery adapter (treat it as a
settle-and-continue) closes it forever. **My pick: just do it.**

## 11 · WHAT IS FREEPLAY, ACTUALLY?

**DECIDED: the flat is the epilogue.** The shipped refusal stands; no freeplay door. Settled.

This pass stopped the finished campaign's door from re-offering the
Initiation forever; it now refuses honestly (*"The week is over…"*) and the
objectives card retires. But that makes the flat a terrarium: TV, arcade,
radio, no way out.

- (a) That's the ending. The flat is the epilogue.
- (b) Freeplay door: leave for any completed scene as a replay (needs a
  small destination menu and a no-commit re-entry mode per scene).
- **No pick from me — this is a design call about what the game is after
  the credits.**

## 12 · THREE VERIFIER FINDINGS FROM THE OTHER KITCHEN — pre-existing, measured against their own main

**DECIDED: repair the two verifiers now** (agent pass in flight: the cabin probe learns to expect the departure; the cold-open budgets scale to measured frame rate with the strict values as the real-time floor). The Special Meeting’s save-claiming stays as shipped — their design; revisit only if a playtest hits it.

All three reproduce byte-for-byte on `origin/main` before this branch's
merge; none is caused by it, and none blocks the ship. Flagged so they are
owned rather than rediscovered:

- **`verify:cold-open` times out at the quit handshake** under software
  rendering: the new strict wall-time budgets (12 s) assume real-time frames,
  and swiftshader runs this page at ~10 fps. You reported the cold open
  working in live play, which points at the verifier's budget, not the
  product — but if a playtest ever shows QUIT reloading Squatch Smash
  instead of pulling the camera back, this is the first place to look.
- **`verify:cabin-browser` ends 50/51**: its final probe presses E at the
  car of a completed chapter and the page genuinely navigates out from
  under it. The 50 substantive checks pass. The probe needs to expect the
  departure.
- **The Special Meeting page claims any save that opens it** (scene pointer
  + a 35-minute clock burn) — their shipped design, and their recovery seam
  and verifier depend on the claim, so this pass's direct-entry guard was
  reverted. Decide the policy: keep the claim (a bookmark mid-campaign
  rewrites the save), or teach the recovery seam to host a no-commit visit.

## 13 · STILL OPEN FROM LAST WEEKEND'S MEMO

The reuse ratchet counts files-that-import rather than cards-that-exist
(old item 6). Per-page ratchet rows remain on offer; no pick was given.

---

## FIXED IN THIS PASS (the bugs, for the record)

- Cold open (and everything after it, all session) was mute: the reveal now
  performs the Start button's audio decode itself; gate added to
  `verify:cold-open`.
- Bada Bing: Gratin's shout fires for anyone entering the hallway; the card
  marks the current objective and carries a direction line.
- Day Two's second call: the panel now shows "Wait for Big Uncle Lou's call"
  instead of an all-ticked list crediting Booskibro (`objectives()` learned
  door-kind `call`).
- The apartment HUD's hide-latch (hidden once, hidden forever) fixed to
  match the shared panel.
- The shared panel's injected CSS no longer beats scene placement overrides
  (golf scorecard, Palace mission card et al.).
- No Wake: "GO BELOW DECK" retires when he's below deck; the motel's HUD no
  longer ships a different first objective than the mission's.
- Post-Initiation homecoming is attributed to the Initiation, not the
  Palace (`APARTMENT_RETURN_PRIORITY`).
- The finished campaign's door no longer re-offers the Initiation.
- Loading `index.html` mid-final-arc no longer overwrites the save into a
  flat that can't host it — it returns the save to its own scene. The
  Special Meeting page got the same guard (it used to claim any save and
  burn 35 minutes).
- Preview exits carry the campaign stage: eight mission exits land on the
  right apartment morning, the five final-arc Continue buttons work in
  preview, the siege end-card no longer leaks preview into the real save,
  and the Day One ending card's Bing link is preview-safe.
- The apartment scene graph listed the Special Meeting twice.
- After the 206-commit merge: the cabin chapter's frame-one hard lock (the
  arrival nap had no caller — bed wired, watchdog timers added per the
  owner's ask, overlook interact box moved into the sightline, landmark
  refusals given voices, objective card revealed past the title screen and
  taught to name the outstanding places and the rifle rack).
