# Voice generation and verification pass — 2026-08-27

The reachable recording backlog is **zero**: **4,123 / 4,123** authored lines have indexed recordings.

## What changed

- Rendered the complete 207-line backlog through the repository's existing ElevenLabs pipeline.
- Added **204** new MP3 files and refreshed **3** rewritten Silver Room takes.
- The subsequent all-radio identity pass refreshed **3** announcer takes whose first transcriptions were materially unclear; their replacements now match the current station copy.
- The delivered batch contains **553.786 seconds** of speech across the cabin/dungeon chapter, cabin calls, Silver Room band request, Silver Case corrections, post-siege call, and repaired-mansion debrief.
- Cleared the three re-record queue rows only after their replacement takes were rendered, indexed, and stamped.
- Kept the API key outside the repository.

## Evidence

- `VOICE-LINES-NEEDED.md`: 0 outstanding.
- `VOICE-LINES-TODO.md`: regenerated from the current manifest and delivered files.
- `assets/sfx/takes.json`: 0 stale text, 0 queued stale text, 0 stale voices, 0 unledgered takes, and 0 orphaned entries.
- `assets/sfx/index.json`: every delivered file has a current cache-busting content hash.
- [rendered-voice-receipts.json](./voice/rendered-voice-receipts.json): **386 / 386** exact rendered takes, including all 207 backlog lines and the three audited announcer replacements, match the current cue text hash and voice ID and decode in the repository's Playwright Chromium. Total decoded duration is 1,162.695 seconds; the new backlog batch accounts for 553.786 seconds.
- [radio content transcriptions](./radio/content-transcriptions.json): **298 / 298** spoken radio/news assets have current hash-, text-, voice-, and transcript-bound Scribe v2 receipts.
- [scribe-spot-checks.json](./voice/scribe-spot-checks.json): **15 / 15** representative takes across ten voice profiles match their authored content in ElevenLabs Scribe v2. All were detected as English with probability 1.0. Proper-name spelling differences such as `Sasole` / `Sassoli` and `Squatchiel` / `Squachial` are recorded explicitly rather than hidden.

## Pipeline repair

OneDrive intermittently denied `open` on `assets/sfx/takes.json` after a successfully rendered MP3 had already reached disk. The shared take-ledger writer now retries only transient Windows/OneDrive lock codes with a bounded backoff. Seven affected cues were then force-rendered by exact cue ID so their files and provenance stamps could not disagree.

## Verification boundary

The browser-decode receipt proves the committed MP3 is loadable and has a positive duration. The rendered take ledger proves which exact text and ElevenLabs voice ID were sent. The Scribe sample independently checks intelligibility and wording across the new cast. These receipts do not claim that a transcript model can judge acting taste; active-scene dialogue timing, ducking, mouths, and player-path checks remain the relevant presentation proof.
