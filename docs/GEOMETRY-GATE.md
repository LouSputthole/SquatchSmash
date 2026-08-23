# Repository-wide geometry gate

`npm run verify:geometry` builds every registered scene state headlessly, collects
every rendered mesh instance and active collider, and fails on geometry that is
neither clean nor present in that scene's exact allowlist.

The gate is deliberately separate from the older `scene-audit` tooling. That
audit remains a broad advisory report; this Module is deterministic, exhaustive,
and blocking.

## What fails

The fixed conventions are:

- `INTERPENETRATION`: visual-to-visual or explicitly overlap-audited
  collider-to-collider AABB depth is strictly greater than 3 cm.
- `FLOATING`: a support-seeking assembly has no side, ceiling, or below contact
  within 4 cm. Pipes are not treated as mounted merely because their name says
  `pipe`.
- `WALL_EMBED`: a visual object enters a wall by strictly more than 2 cm along
  the wall's thin axis.

Visual and collision geometry occupy separate overlap layers because a collider
normally encloses its own visible object. Every collider is collected, bounds-
validated, owner-mapped, and support-capable. Runtime blocking volumes are overlap-audited against other colliders by default.
A source-proven exact collider may declare `overlap: false` for a tessellated
join; that opt-out is counted and pinned like every other suppression.
Structural floor, ground, and terrain meshes are support surfaces rather than
penetration targets.

Support policy can be explicit per assembly. Side and ceiling attachment only
counts against a fixed structural, wall, or collider anchor; two touching
airborne assemblies cannot mutually validate one another. Below-support is
strictly directed from lower to higher geometry, so equal-height records cannot
form a support cycle. The default fixture heuristic is limited to unambiguous
wall/ceiling art and lights; pipes, ducts, cables, and wires are deliberately
excluded so unsupported services still fail.

The collector emits a record for every visible `InstancedMesh` instance.
Runtime hide/destruction paths may use an effectively-zero instance transform as
a visibility sentinel; an instance is omitted only when all three decomposed
local axis scales are at most `1e-3`. A merely small or non-uniform instance
remains audited, and every matrix is validated as finite before the visibility
rule is considered. Builders whose separate instanced draw calls form one
logical object can declare `userData.geometryGate.instanceAssemblyPrefix`;
matching instance indices then share one owner without merging different
instances.

Authored `overlap: false` and `checkSupport: false` metadata carries its exact
semantic source path through collection. Direct metadata on an exact `Mesh` or
`InstancedMesh` is allowed. Inherited metadata is allowed only when its source
subtree has at most 64 collected parts and spans at most 8 m on every axis. A
room, terrain root, or other scene-scale inherited opt-out fails the worker
instead of silently disabling a class of checks.

## Coverage

The registry in `tools/geometry-scenes.mjs` contains every public preview scene
plus independently authored geometry states: all Apartment chapters, both Bing
visits, Mansion tour/return and both Silent Squatch lab states, all Golf holes,
Silver, NO WAKE, all six Enola checkpoints, six Heist phases, Motel, Graveyard, Beef Run,
both Silver Case sets, Squatchfather, both Cartel Palace states, and all six
Mansion Siege damage states.

Initiation is the sole named waiver. It is frozen pending owner playtest and its
geometry is interleaved with top-level WebGL startup rather than exposed through
a headless builder. The registry and its tests make that waiver visible; no
files under `src/initiation/` are changed by this gate.

## Running a focused sweep

```powershell
npm run verify:geometry -- --scene mansion-siege
npm run verify:geometry -- --state graveyard:arrival
node tools/verify-geometry.mjs --scene golf --json
```

Each state runs in its own bounded child process. This keeps procedural Mansion
and Siege allocations from accumulating across the full campaign run.

## Allowlists are reviewed policy

Each scene owns `tools/geometry-allowlists/<scene>.json`. Entries select one
exact state and exact stable object IDs; wildcard selectors are forbidden. An
entry must explain the authored join and cite a repository-relative source line.
The CLI verifies that the file exists and the cited line is in range and nonblank.
An optional `sourceAnchor` pins a stable substring that must remain on that line.
It also pins the current maximum depth or gap.

Every allowlist also owns a required `suppressionPolicy` entry for each selected
state. It pins exact `overlap: false` and `checkSupport: false` application
counts plus the sorted semantic source IDs and direct/inherited scope. Worker and
JSON reports publish the same per-state inventory. A new opt-out, a newly covered
descendant, or a moved source scope therefore fails until it is reviewed and the
checked-in policy is intentionally updated.

The gate fails when:

- a new finding has no entry;
- a finding grows beyond its pinned cap;
- an entry points at an unknown object or state;
- two entries match the same finding;
- an entry becomes stale after the geometry is fixed; or
- a source file, line, or optional anchor cannot be verified;
- suppression counts or exact source scopes differ from checked-in policy; or
- the file has an unknown key, weak reason, invalid source, or non-canonical
  ordering.

There is intentionally no `--update` switch. A failing relation should first be
fixed or identified as an authored join; only then should its exact entry and
measured cap be added. This keeps a red gate from becoming a rubber-stamp
baseline generator.

## Architecture

The flow has one narrow Seam:

1. `geometry-scenes.mjs` adapts heterogeneous runtime builders to roots and
   colliders.
2. `geometry-collect.mjs` converts live THREE objects into stable plain records.
3. `verify-geometry-worker.mjs` applies scene-level ownership and support policy.
4. `geometry-gate.mjs` performs the pure indexed scan and strict reconciliation.
5. `verify-geometry.mjs` isolates states, loads per-scene policy, reports, and
   sets the CI exit status.

The pure gate uses an uncapped sweep-and-prune broadphase rather than the older
quadratic support scan. Tests compare it with an independent brute-force oracle
and assert that it reports all 4,950 pairs in a dense 100-record case.
