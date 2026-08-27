# Before you push

This is the short card. `CLAUDE.md`, `docs/ENGINE-TRAPS.md`, and
`.github/workflows/verify.yml` contain the full rules.

- Run the campaign marathon for campaign-route, scene-graph, exit, call-unlock,
  clock, handoff, or save-backed story changes. A green unit suite does not
  prove that the campaign route works.
- Regenerate and check the dialogue, VO, take, recording, and audio ledgers
  after authored line or cue changes. Do not hand-edit generated sheets.
- Inspect geometry traversal-path churn. Naming or inserting a mesh can
  renumber later paths; never bless a large allowlist diff mechanically.
- Read CI in execution order. A later gate may never have run when an earlier
  gate failed.
- Reproduce the debt ratchet against an explicit trusted base, for example:
  `npm run certify:debt-ratchet -- --trusted-ref "$(git rev-parse <trusted-base>)"`.
- Start the changed scene in a browser, use the real player input path, inspect
  console/page/network failures, and capture active-play evidence. A direct
  `debugUse()` handler call is not interaction proof.
- Run the relevant scene verifier before the broad gates, then follow the
  authoritative order in `.github/workflows/verify.yml`.

