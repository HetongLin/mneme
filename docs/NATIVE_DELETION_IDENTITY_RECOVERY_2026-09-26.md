# Native Deletion and Identity Repair Recovery — 2026-09-26

Round 37 starts at `e173eac` on `test/native-deletion-identity-recovery`.
Native checks ran on September 26; documentation was completed September 27.
No product-code change was needed for the three tested recovery paths.

## Setup and method

- macOS Obsidian 1.13.7; isolated `release-artifacts/Mneme_Release_Candidate`.
- Plugin/data backup and hashes of all 49 existing Markdown files are in
  `release-artifacts/deletion-identity-recovery-20260926/` (local, untracked).
- Six new Markdown files form three Concept/Card Group pairs beneath
  `Identity Native Acceptance 20260926/`, in separate `Delete`, `CardRepair`,
  and `ConceptRepair` subfolders. `fixtures-before.json` records the final setup.
- Every pair includes custom YAML and learner prose. The deletion group also
  contains a neighboring Card which must remain intact.
- Installed main.js matches the repository build, SHA-256
  `6aa7777393d8735456612a9c2ba8de72dcc0a9ed5dcd09ad263daa35380c0da4`.

Official CLI commands open native views. CLI eval interacts with actual renderer
DOM controls and confirmation modals; official Resume commands perform recovery.
This is DOM-driven acceptance, not physical input or screenshot visual QA.
Review states and events for the deletion target and missing-ID Card were seeded
synthetically (reviewCount 3, lapseCount 1); this round did not submit new ratings.
Round 36 separately covers an actual Good rating.

## Three pending operations

| Operation | Native entry and fault boundary | Persisted state before restart |
| --- | --- | --- |
| Card deletion | Review diagnostics → Delete Card; first cancel, then confirm. One completion save throws before storing the tombstone/removing the intent. | `r37-delete-card` is absent from Markdown; deletion intent and original review state/event remain. Neighbor `r37-delete-neighbor` remains. |
| Missing Card ID | Review diagnostics → Assign Stable ID → Assign ID. One completed-receipt save throws after Markdown is written. | `r37-repaired-card` is present once; repair pending; state still belongs to the original path/index fallback. |
| Missing Concept ID | Concept Library Identity Repair → Assign Stable ID → Assign ID. Wrapped `vault.process` throws after writing the Concept file. | Concept has `r37-repaired-concept`; linked Card Group still has `r37-orphan-owner`; repair pending. |

The fallback Card identity is
`Identity Native Acceptance 20260926/CardRepair/CardRepairCards.md#0`.
Its legacy block originally had Front/Back markers but no stable ID or outer CARD
wrapper. The Concept repair preserves its contained Card `r37-conceptrepair-card`.

`delete-pending.json`, `card-repair-pending.json`, `all-pending.json`, and
`markdown-pending.json` capture receipts and actual partial file contents.
Both repair intents request state migration. Concept/Card Group before/after
hashes were independently checked against the corrected fixtures.

## Main-process restart and recovery

After verifying the Obsidian executable and renderer-parent relationship, SIGKILL
terminated main PID **91890** (renderer **91894**). Reopening the same Vault produced
main PID **98171**, renderer **98176**. All three pending operations survived.
This is a main-process restart; it also discarded the runtime fault wrappers.
`termination.json` and `after-restart.json` record the process and pending state.

The following official commands were executed sequentially:

1. `mneme:mneme-resume-card-deletion`: clears the intent and active state, retains
   the original event, and creates a tombstone retaining reviewCount/lapseCount.
2. `mneme:mneme-resume-card-id-repair`: completes the receipt and moves the exact
   fallback review state to the new ID. Event key remains unchanged; its cardId
   changes to the new ID. The old state key is absent.
3. `mneme:mneme-resume-concept-id-repair`: completes the remaining Card Group owner
   write and receipt. Both files match their confirmed after hashes.

Deletion and Card repair do not rewrite their already-applied Markdown. Concept
repair preserves the already-written Concept file and all existing Card IDs.
Repeating all three Resume commands leaves data.json and all six fixture files
byte-for-byte unchanged. Final Library inspection has no fixture identity issue.
Startup notifications were not captured in this round.

## Preservation and validation

Inline verification and `final-results.json` confirm:

- All 49 original Markdown hashes unchanged; exactly six new Markdown files.
- Custom YAML, learner prose, and the neighboring Card preserved.
- Every baseline review state/event, tombstone, and repair record preserved.
- Only `cardIdRepairs`, `cardTombstones`, `conceptIdRepairs`, `reviewEvents`, and
  `reviewStates` differ from baseline data. Settings and unrelated state unchanged.
- No pending deletion or ID repair; repeated recovery is byte-identical.

`npm run test:card-editor`, `npm run test:concept-library`, `npm run build`, and
`npm run check:release -- 1.0.0` passed. Logs are
`/private/tmp/mneme-identity-native-{card,concept,build,release}.log`.
Documentation diff validation also passed. This documentation-only round did not
rerun every unrelated test suite. No personal Vault was changed or commit pushed.

## Setup caveats and remaining work

The initial fixture placed all three owners in one folder. Review grouped them
under one title. `ConceptLoader` groups by parent folder and reads metadata from
the first Card; the fixtures were separated before the recovery tests. Follow-up
must determine the supported ownership contract and reproduce Library/Review
behavior with two explicit owners in one folder before choosing a fix.

During fixture relocation, `fileManager.renameFile` opened an Update links modal;
Do not update was selected and fixture links were explicitly corrected. An early
Concept fault hook fired once during preparation, before any repair receipt
existed. Setup finished using controlled fixture writes, and the hook was rearmed
only after `fixtures-before.json` was saved. Preparation waits and that early
fault are not counted as product failures or recovery evidence.

Advanced diagnostics was enabled only in memory and returned to its baseline
false setting after restart. A seeded legacy Concept pause was cleared by Review
before repair, consistent with `DATA_MODEL.md`; **pause migration was not covered**.
The recorded result explicitly sets `pauseMigrationCovered: false`.

Duplicate-ID repairs, earlier deletion/repair interruption boundaries, interrupted
new-group creation and rating persistence, other rating phases, external edits,
Windows/mobile, sync races, torn writes, and power-loss durability remain separate
checks. These results do not complete the overall release checklist.
