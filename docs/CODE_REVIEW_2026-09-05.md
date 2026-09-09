# Mneme code review and refactoring — 2026-09-05

Updated: 2026-09-10 (thirteenth pass)

## Scope and checkpoint

Reviewed the handoff, repository instructions, product contracts, and relevant ADRs before editing. The existing handoff was committed as `83deb3f` (`docs: checkpoint acceptance handoff before code review`) after a successful build. Its parent `9cd98ad` contains the pre-review product code.

Work continued on `refactor/review-transaction-safety`. This audit focused on reviewed Markdown writes, Card append operations, Inbox acceptance, and asynchronous Review View actions. It was not an exhaustive review of every provider, parser, UI surface, or platform.

A second pass on `refactor/state-persistence`, based on documentation checkpoint `0377c60`, addresses shared plugin-state persistence and presentation refresh. It also applies the atomic Markdown contract introduced in the first pass to Source provenance writes.

The third pass on `refactor/approved-write-recovery` starts from committed checkpoint `30bcce7`. It addresses interrupted Inbox writes, receipt retention during reconciliation, and Card Composer lifecycle errors.

The fourth pass on `refactor/manual-card-write-recovery` starts from committed checkpoint `4e57766`. It coordinates durable Manual Card creation with draft completion and reviews the Composer's recovery state transitions.

The fifth pass on `refactor/manual-concept-write-recovery` starts from committed checkpoint `59ddfd2`. It covers direct Concept creation, Source provenance completion, persistent draft identity, and Concept Composer/Merge lifecycle boundaries.

The sixth pass on `refactor/index-reconciliation-safety` starts from committed checkpoint `d125577`. It addresses index scan/save races and the reviewed Markdown/owner checks used during Concept deletion.

The ninth pass on `fix/identity-repair-content-safety` starts from checkpoint `2b437f3`, after the seventh/eighth-pass durable deletion changes. It addresses ID-only content edits and Concept/Card Group ownership preflight. It does not yet replace the ID repair modals' write/rollback protocol.

The tenth pass on `fix/card-id-repair-recovery` starts from committed checkpoint `596f4e9`. It gives single-Card ID repair a durable coordinator, atomic content checks, state migration and explicit recovery. Concept ID repair remains a separate multi-file audit.

The eleventh pass on `fix/concept-id-repair-recovery` starts from checkpoint `764354a`. It replaces Concept ID repair compensation with a durable two-file coordinator and protects overlapping identity and authoring work.

The twelfth pass on `fix/repair-provenance-reconciliation` starts from checkpoint `34e8d72`. It prevents index cleanup from discarding provenance associated with repaired identities and makes deferred cleanup visible.

The thirteenth pass on `fix/proposal-target-after-id-repair` starts from checkpoint `25cf41c`. It prevents ambiguous legacy proposals from writing to the remaining owner of a repaired duplicate ID, and preserves authored conflict-Merge drafts when their context changes.

The existing `mneme` self-link, `release-artifacts/`, recordings, and acceptance Vaults were preserved. No remote push, publication, version change, or live Vault update was performed.

## Local implementation commits

- `04bc46f` — preserve concurrent edits in reviewed Markdown transactions.
- `4e16141` — append Cards atomically across authoring flows.
- `95cf030` — guard Review actions against duplicate and stale completion.
- `37d3533` — serialize plugin-data mutations, protect Source relink/removal writes, and preserve Review state on diagnostics refresh.
- `3100b9b` — durable Inbox write recovery, atomic completion, and protected reconciliation.
- `5617b23` — Card Composer input/close lifecycle and truthful completion warnings.
- `f2dbec4` — durable Manual Card recovery, protected draft identities, and Composer recovery controls.
- `ecd462c` — durable Manual Concept recovery, atomic provenance/draft completion, and Composer/Merge lifecycle protection.
- `f66bd16` — reconcile Source indexes with conditional per-record changes.
- `3a9f321` — protect deletion Related writes/rollback and require Card ownership.
- `daa70e1` — durable Concept deletion recovery and state completion.
- `fc87e06` — durable single-Card deletion without stale Markdown compensation.
- `cb1957b` — preserve ID repair content and verify linked Card Group ownership before writes.
- `ab38414` — durable single-Card ID repair, atomic state migration and explicit recovery without Markdown rollback.
- `32f6f3d` — durable two-file Concept ID repair, pause migration, ownership checks and cross-workflow guards.
- `9a33133` — preserve repaired Concept provenance during index resync and report deferred cleanup.
- `f8a9c05` — verify proposal targets after duplicate-ID repair and retain authored Merge drafts across context changes.

## Confirmed and fixed

### P1 — Merge and Related writes could overwrite concurrent note edits

Ordinary Merge, incoming name-conflict Merge, and Related link changes checked snapshots with `read()` and later performed unconditional `modify()`. An edit between those calls could pass the initial check and then be overwritten. Rollback had the same read/write gap.

The three services now share `executeMarkdownWriteTransaction()` in `src/services/markdownWriteTransaction.ts`. Each changed file compares the reviewed snapshot against the current content inside `Vault.process()` before returning replacement content. Successful writes roll back in reverse order on a later failure. Rollback also compares inside `process()` and reports a conflict instead of overwriting newer user content. Existing plugin-data rollback callbacks and result shapes are retained.

The installed Obsidian API declares `Vault.process()` since 1.1.0, below Mneme's existing minimum of 1.5.0. No new dependency or persisted format was introduced.

Evidence: the original three service tests failed on injected write races (`merged`/`linked` instead of `conflict`). Regression coverage now includes ordinary rollback, edits after the initial check, later-file conflicts after earlier writes, partial data persistence failure, and edits during rollback.

### P1 — Concurrent Card append operations could lose Cards or user edits

Manual Card creation and Inbox Card acceptance built a replacement Card Group from a prior read, then overwrote the whole file. Concurrent operations could both read the same content and erase the first append.

Both existing-group paths now calculate `appendCardGroupDraft()` inside `process()`, using the latest Markdown. Owner validation, malformed-block checks, and ID collision checks still run before writing. Missing groups still use create-only semantics: a simultaneous creation may fail visibly, but cannot overwrite an existing file.

Evidence: two pending appends are released together from a deterministic read barrier; original Card IDs and both new IDs remain exactly once. Separate fixtures inject a user edit immediately before writing. The old manual/Inbox implementations overwrite that edit and fail the regression assertions; the current implementations preserve it.

This protects Card Markdown. The third and fourth passes below add durable recovery for the accompanying proposal/draft-state writes.

### P1 — Repeated Review actions could submit multiple writes and skip Cards

Rating, Review Tomorrow, Suspend, and Archive could run concurrently against the same displayed Card. Each completion then advanced or removed a Card from the current session. Skip could also change the current position while a rating was saving.

`ReviewActionGuard` coordinates these operations within each Review View. Action buttons disable immediately and recover in `finally`; Skip is blocked during a pending operation. Starting/resetting/closing a session invalidates old completion callbacks while retaining the pending lock until the outstanding write finishes.

Evidence: `tests/reviewActionGuard.test.ts` invokes the actual Review View methods with deferred persistence promises and a minimal rendering harness. It verifies one write and one transition for duplicate/competing operations, immediate button disabling and recovery, explicit retry after failure, and session/close invalidation. The pre-review View submits three operations for the same Card in this fixture and fails. The harness does not claim visual or live Obsidian acceptance.

### P1 — Independent stores could overwrite concurrent changes to data.json

Review, proposals, settings, drafts, provenance, and Merge independently read a complete plugin-data snapshot and later saved a complete replacement. Two operations could read the same snapshot before either saved, and the second save could erase the first update. A deterministic pre-fix test confirmed that concurrent ratings of two Cards retained only the second Card.

All current plugin-data writers now use `runPluginDataMutation()` with the shared plugin instance as storage owner. The queue surrounds the entire read/validate/modify/save operation. Merge and provenance operations retain it through Markdown writes and compensating rollback. Proposal lifecycle validation happens after entering the queue; it no longer reads outside the queue and calls a separately queued upsert. Failures propagate to their callers without blocking later operations.

Evidence: `tests/pluginDataMutation.test.ts` covers concurrent ratings, independent Review store instances, Review alongside proposals/settings/drafts/source records/source links, competing proposal transitions, failed-save recovery, and Merge commit/rollback interleaved with Review. `tests/pluginSettingsConcurrency.test.ts` invokes the actual `MnemePlugin.saveSettings()` with a shared storage owner and deferred saves in both orders; later reviews preserve the new settings as well. No timers or live Vault are required.

The existing schema is unchanged. This queue coordinates one plugin instance, not external writers or restart recovery. Caller-provided whole-record/map replacement and multi-step authoring workflows retain their existing semantics. See [ADR 0022](adr/0022-plugin-state-mutations-share-one-queue.md) for the ownership and non-reentrancy contract.

### P1 — Source relink/removal could overwrite concurrent Concept edits

Source provenance relink and removal had the same snapshot-check/overwrite gap as the first-pass Merge paths, including unconditional Markdown rollback after a state-save failure. They now use `executeMarkdownWriteTransaction()` with the same atomic `process()` contract. A pre-write conflict leaves plugin data untouched; a rollback conflict preserves newer Markdown, reports incomplete compensation, and still attempts state recovery. The plugin-data queue remains held through the operation.

Evidence: both service suites inject edits immediately before the atomic write and between failed persistence and rollback. The new tests verify conflict status, preserved edits, and state behavior. Re-running the write-race assertions against the original service code via a temporary build returned `relinked`/`removed` instead of `conflict`; both failed as expected. Existing success, source/state snapshot conflict, and ordinary rollback tests are retained.

### P2 — Changing advanced diagnostics reset an active review session

The diagnostics toggle called the full Review refresh, which rebuilt the queue and reset the current Card and revealed answer. It now uses a presentation refresh routed through the plugin to each open Review View. The scheduling toggle keeps its existing full refresh.

Evidence: the Review View method harness verifies that presentation refresh preserves the selected Concept, Card index, and answer state without submitting an FSRS write. This is method-level regression coverage; live rendering remains a manual check.

### P1 — Inbox retries could create duplicate Concepts/Cards after a failed completion save

The writer now persists a versioned recovery record before Markdown I/O, holding the shared storage queue throughout the operation. The record fixes the target, entity ID, and expected hashes; it contains no learning content. All five supported Inbox write kinds share preparation and completion. Concept updates use atomic snapshot checks, and one state save completes provenance and proposal status together.

On retry, an already-applied write only completes its state. An unapplied write uses the saved path and ID. A conflicting target, changed proposal, or malformed record produces an explicit failure without creating a new destination or overwriting content. Receipts reserve IDs and new Concept paths even before the file exists. Completed records remain for duplicate requests, with the proposal payload removed.

Inbox includes interrupted approved proposals and offers completion with editing/rejection disabled once writing has started. Stores reject stale UI replacements. Reconciliation retains recovery records and uses compare-and-delete for unrelated stale proposals, so a snapshot taken before a write cannot erase its new record.

Evidence: a temporary build of the original writer produced two Concept files from one proposal when its completion save failed and a new writer retried. `tests/approvedWriteRecovery.test.ts` covers all five kinds with failed completion plus reconstructed storage/writer/Vault state, failures before and after metadata/Markdown writes, duplicate writers, Review interleaving, reserved paths/IDs, edited targets and proposal inputs, malformed receipts, and atomic checks for updates/views/source links. Existing writer tests retain content and provenance assertions; their fault injection now targets the unified completion save. See [ADR 0023](adr/0023-approved-writes-have-durable-recovery-records.md).

This repair applies to writes that have a recovery record. Historical partial writes without one, unreadable metadata, and conflicting external edits still require manual reconciliation. No real Obsidian crash/restart acceptance is claimed by the in-memory reconstruction tests.

### P2 — Card Composer creation could overwrite input or revive a draft while closing

Creation disabled only its submit button, while a successful completion cleared all fields. The Composer now locks inputs during creation and prevents a pending `prepare()` lookup from rebuilding the form after creation starts or the View closes. Closing waits for creation; a completed Card clears the draft independently of the closed DOM. Save timers are cleared on close.

The third pass separated creation, draft-cleanup, and View-refresh outcomes. The fourth pass replaces the separate cleanup save with the durable coordinator below. View-refresh errors remain independent of a successfully persisted Card. The actual View method harness covers input locking, deferred preparation, close during creation, and preservation after a failed Card write. Rendering is stubbed, so live Obsidian validation remains outstanding.

### P2 — Manual Card creation and Composer draft cleanup could diverge

The Card was written before draft cleanup was persisted. If cleanup failed, the saved draft could return after reload and allocate a second Card ID. `manualCardWriteService.ts` now persists a fixed-ID intent before Markdown, verifies that Card on retry, and saves completion, draft removal, and a new draft identity together. Pending records contain only hashes and locator metadata; completed drafts do not retain learning prose.

`ManualCardDraftStore` compares draft identities inside the shared state queue and rejects saves/clears for pending writes or stale windows. A new draft may intentionally contain the same text. Inbox and manual allocation reserve each other's Card IDs even before Markdown exists; Card Group paths remain shared destinations.

Composer retains pending drafts as read-only with an explicit Resume action. Loading failures cannot expose an empty editable fallback or clear saved content on close; late opening callbacks cannot render after close. A missing Concept no longer silently redirects a meaningful draft to the first library entry. See [ADR 0024](adr/0024-manual-card-creation-resumes-a-durable-draft.md).

Evidence: `tests/manualCardWriteRecovery.test.ts` exercises new and existing groups across six fault stages: before/after intent save, before/after Markdown write, and before/after completion save. Each case recreates both storage and Vault, reuses the original draft identity, asserts the complete Card ID list, and checks that applied Markdown is not replayed. Other cases cover legacy migration, pending/stale autosaves, duplicate completion, intentional same-text new drafts, unrelated appends, conflicting targets, malformed records, missing Concepts, changed settings, and deterministic Review interleaving. Composer tests invoke real lifecycle/control methods; final review also fixed `prepare()` losing input typed before its autosave timer.

### P1 — Manual Concept rollback could delete learner edits after an uncertain state save

The low-level creator deleted the new note whenever its provenance committer threw. A state save can throw after persisting, and the learner can edit the note while the save is pending. Unconditional deletion could therefore remove valid authored content. Creation now preserves Markdown on any uncertain completion outcome. The production coordinator uses a persisted intent and forward recovery instead of deletion.

Evidence: the low-level service regression injects learner edits inside the failing committer and verifies the edited bytes survive with zero remove calls. Recovery tests reject edited targets and confirm their bytes remain unchanged.

### P2 — Manual Concept creation, provenance, and Composer completion could diverge

`manualConceptWriteService.ts` persists a fixed Concept ID, paths, expected hash, alias flag, and optional Source snapshot before note creation. One queued state save completes provenance, retires the old draft identity, records completion, and installs a blank next draft that keeps the Source selection. Resume verifies the original file and never allocates a second destination for that operation. No final prose is retained in the receipt. See [ADR 0025](adr/0025-manual-concept-creation-resumes-a-durable-draft.md).

Pending writes block draft saves/clears and manual name-conflict Merge. Merge completion rotates the draft identity inside its existing transaction, so late Composer saves cannot restore completed content. Inbox and manual creation reserve each other's Concept IDs and new-note paths. The production entry point delegates to the coordinator without nesting queued stores.

Evidence: `tests/manualConceptWriteRecovery.test.ts` covers Source present/absent across six failure stages: before/after intent persistence, before/after Markdown creation, and before/after completion persistence. Every case reconstructs storage and Vault, retries the original draft, and asserts one file, fixed ID/path, matching bytes, no replay of an existing file, identity rotation, and Source provenance/fingerprint preservation. Additional cases cover legacy migration, stale/pending saves and clears, intentional same-text new drafts, malformed receipts, changed alias/folder settings before missing-file recovery, edited targets, and Review queued behind an explicit creation barrier. Writer and Merge tests cover reserved destinations, pending direct creation, changed preview state, and identity retirement. A nested legacy-title fixture also verifies that planning and recovery apply name normalization identically.

### P2 — Concept Composer asynchronous actions could outlive their draft

Concept creation now locks all editing, invalidates alias requests, and waits on close. Pending recovery bypasses fresh Source/name/duplicate checks and preserves its original alias input. Failed reloads lock the form; successful creation uses the coordinator's next draft without another save. Fresh and resumed creation share completion handling. Delayed tag-catalog refreshes preserve the creation lock and ignore closed lifecycles. Late preflight checks cannot create or open dialogs after closing; Merge callbacks compare draft identity, and title refinement focuses only after controls unlock.

Composer regressions use actual lifecycle/control methods with a rendering substitute. They do not exercise live Obsidian rendering or process crashes.

### P1 — Index reconciliation could overwrite newly saved Source provenance

Resync loaded Source records and links, awaited filesystem checks, then replaced each entire map. A concurrent capture, Concept completion, relink, or explicit removal could be overwritten even though the final store save used the shared mutation queue. Pending-proposal cleanup also used an earlier proposal-ID snapshot.

Reconciliation now submits per-record observations and changes. Source and link stores compare each expected record inside the shared queue and preserve concurrent additions, updates, moves, and removals. Source pending IDs are checked against current proposals at commit time. Result IDs describe only applied changes. The old replacement APIs had no other callers and were removed. See the index-reconciliation addendum in [ADR 0022](adr/0022-plugin-state-mutations-share-one-queue.md).

Evidence: the original implementation failed the added integration test by removing `Missing-Updated.md` after another real store updated it during the filesystem check. `tests/vaultStateReconciler.test.ts` now covers added/updated Source records and fingerprints, updated deletion candidates, explicit removals, a proposal created after the proposal scan, new links, relinked candidates, and removed links that must not be resurrected. Existing no-race cleanup and approved stale-provenance behavior remain covered.

### P1 — Concept deletion could overwrite Related Markdown or delete an unowned file

Deletion previously checked Related snapshots and later used unconditional `modify()`. Rollback repeated that read/write gap. Each forward and compensating Related write now uses the existing atomic Markdown transaction helper. Cards targets must have a recognized Card Group type (including the supported legacy type) and the expected Concept owner. Missing ownership or a wrong type blocks preparation. Concept and Cards snapshots are checked again immediately before removal; rollback reports occupied paths while preserving their contents.

Evidence: the old implementation returned `ready` for an ordinary note pointed to by `cardsPath`, and returned `deleted` after an injected edit immediately before the Related write. The current deletion suite verifies blocking of unowned/wrong-owner targets, preserved write-time and rollback-time edits, restoration after ordinary deletion/callback failure, duplicate execution with Related writes, Cards edited during Related cleanup, and occupied rollback paths. The original service was rebuilt in a temporary bundle for the failing race check; repository history was not changed.

These changes protect the reviewed Related writes and owner checks. They do **not** make file removal and plugin-state completion a durable deletion transaction.

### P1 — Concept deletion could diverge from persisted Card state after interruption

Seventh-pass code/ADR commit: `daa70e1` on `refactor/concept-deletion-recovery`, starting from checkpoint `d9b7874`.

Seventh pass adds a dedicated coordinator under the shared plugin-data queue. It saves a strict hash/path receipt, removes Related links with an atomic transform, stages each owned file under a non-Markdown suffix, verifies its bytes, and moves it to local Vault trash. Card tombstones, active-control cleanup, Source provenance cleanup, and the compact completion receipt are saved together. The old in-memory execute/rollback path and permanent `Vault.delete` adapter method have been removed.

`Resume Concept Deletion` explicitly finishes pending work, including when the original Concept is already absent. Startup reports pending work without deleting files. Ratings reject pending Card IDs; Inbox/Composer writes and merge preparation reject pending/deleted Concept targets. Concept allocation reserves deleted IDs and pending paths. Proposal and draft prose remains available. See [ADR 0026](adr/0026-concept-deletion-resumes-from-durable-staging.md).

The recovery matrix injects failures both before and after each of six state saves, and before/after Related processing and both file rename/trash operations. Storage doubles clone persisted data so failed saves cannot appear successful through shared object references. Assertions cover resumed completion, exactly-once trash effects, tombstone counts, preserved history/settings/proposals/drafts, and selective provenance cleanup. Additional cases cover staged edits, recreated paths, write-time Related edits, malformed/path-traversal records before Vault I/O, duplicate calls and queued reviews/settings. Writer regressions cover payload-only Concept references and deleted ID allocation.

### P1 — Single-Card deletion could overwrite edits or restore a tombstoned Card

Eighth-pass code/ADR commit: `fc87e06`, starting from checkpoint `347caa7` on `fix/card-deletion-recovery`. The old `CardDeleteModal` used cached read/whole-file modify, then unconditionally restored that snapshot when either state persistence or view refresh failed. Two delete windows or a save that persisted then rejected could therefore restore a Card with an already-saved tombstone. A normal post-delete refresh failure also triggered this compensation.

`RecoverableCardDeletion` now saves a content-free `cardDeletion` intent under the shared queue, compares the loaded whole-file snapshot against a fresh read, performs the transformation with `Vault.process`, and atomically completes tombstone/control cleanup while removing the receipt. **Resume Card Deletion** handles interruption without requiring a visible Card. Modal confirmation delegates persistence; state reload and view refresh happen afterward and cannot roll back content. See [ADR 0027](adr/0027-card-deletion-persists-intent-before-markdown.md).

Tests cover both saves and Markdown processing before/after effects, duplicate concurrent deletes, loaded-snapshot/write-time/resume conflicts, malformed paths before Vault I/O, history/draft/proposal preservation, explicit history erasure, and queued reviews/settings. UI tests cover double confirmation and refresh failure. Pending deletion also blocks overlapping creation/merge/Concept-deletion work; stale review controls and source-ID migration cannot recreate deleted Card state. Completed deletion detection uses own tombstone keys, so a legacy ID matching a JavaScript prototype property is not mistaken for prior deletion.

### P2 — Card ID repair discarded marker attributes

Replacing an ID rebuilt the entire opening marker, removing Card type, custom attributes, and formatting. The editor now replaces only the standalone ID value or inserts a missing attribute, retaining the original marker and surrounding Markdown. Its attribute scanner skips quoted values and distinguishes `id` from `data-id`. Duplicate attributes and disagreement with the standard Card parser block repair. Legacy wrapping preserves LF/CRLF; malformed block boundaries block repair, while an unrelated Card missing a section does not prevent a valid ID-only change.

Exact-output tests cover type/custom attributes, quoting, whitespace, insertion, malformed markers, ambiguous parser identities, and an incomplete neighboring Card.

### P1 — Concept ID repair could consume the next YAML field

The old scalar regex allowed whitespace to cross a newline after an empty ID; whole-line replacement also removed inline comments and quote style. The editor now restricts whitespace to the current line and replaces the scalar value span. It retains quoted keys/values, inline comments, and existing LF/CRLF endings. Compound or unsupported scalar syntax blocks repair.

Regression tests cover empty IDs before `importance`, comments after empty values, quoted `#` characters, missing-field insertion, and malformed/compound values. The old implementation failed the new quote/comment preservation assertion. This is a restricted scalar editor, not a complete YAML serializer.

### P1 — Concept ID repair could reassign another Concept's Card Group

The modal previously rewrote any linked Card Group owner without checking whether another Concept owned or shared it. The new pure ownership preflight checks freshly read Markdown identities and links before any write. Foreign ownership, shared links (including legacy folders), newly occupied IDs, stale selected identities/links, and missing or wrong-type groups block the repair. Unowned groups and orphan identities retain the supported missing-ID recovery path.

The regression harness runs the actual modal save method with an intentionally stale ID set. Rebuilding the old modal from checkpoint `2b437f3` against this test produced two writes for the foreign-owner case where zero were required. Current blocked cases assert zero file writes and zero state callbacks; a valid case completes both file writes. The harness supplies registered YAML fixtures rather than exercising Obsidian's real YAML parser. See the repair safeguards in [ADR 0020](adr/0020-random-opaque-entity-identities-and-optional-english-aliases.md).

### P1 — Card ID repair could restore an ID after its review state had moved

The old modal wrote a cached whole-file snapshot and then called a combined state-migration/refresh callback. The regression script reproduced a refresh failure after state migration: state used `card-new`, but Markdown reverted to its unlabelled original. An interruption between those writes had no recovery metadata.

`RecoverableCardIdRepair` now holds the shared storage queue through pending intent, `Vault.process` and completion. It compares the full loaded snapshot, checks fresh Card identities with Obsidian frontmatter parsing, blocks occupied destination history and overlapping authoring/deletion work, and persists only IDs/path/index/hashes/policy/time. Completion migrates fallback FSRS state, controls and events atomically with receipt status; duplicate-ID repair retains shared old state. The modal handles refresh separately. **Resume Card ID Repair** works after restart without the old view; startup only reports pending work. See [ADR 0028](adr/0028-card-id-repair-resumes-without-markdown-rollback.md).

Completed records reserve the destination and reject stale mutations to a migrated fallback ID. Exact repeated requests also verify the current file's after hash: an externally restored file produces a conflict rather than false success. Manual/Inbox allocation and overlapping merge/delete paths enforce the new guards. The extracted state transform additionally rejects destinations having only review-event history.

### P1 — Concept ID repair could revert files after pause migration persisted

The original modal's unconditional compensation restored both Markdown snapshots when its state callback rejected. A regression script made migration take effect and then reject: the pause moved to the new ID while the original ID-less Concept content was restored. Interrupted writes between Concept and Card Group also had no durable recovery path.

The new coordinator saves one content-free receipt for both files under the shared queue, checks both snapshots before writing, uses `Vault.process` for each ID-only change, and completes pause migration/receipt status in one save. Recovery skips files already matching their after hash. Ownership and shared links are rechecked on restart. A separate Card Group claiming the orphan owner or new ID blocks repair, even if no Concept currently claims that identity. Matching written creation provenance may retain the owner at its original path. See [ADR 0029](adr/0029-concept-id-repair-resumes-both-markdown-files.md).

**Resume Concept ID Repair** works without the original dialog; startup only reports pending work. The modal delegates persistence and handles refresh separately. Pending identities/paths are protected across authoring, deletion, merge, Card ID repair and pause controls. Review startup's automatic legacy-pause cleanup now also waits while repair is pending; otherwise it could erase the pause before migration. Completed repair provenance preserves ID reservations and rejects stale actions against a migrated orphan owner.

### P1 — Resync could delete Source evidence retained by Concept ID repair

Missing-ID repair deliberately keeps original Source links and Source record IDs.
After changing an orphan owner to a new ID, resync saw the old ID absent from its
Concept scan and permanently removed the original link, including its evidence.
The link itself had not changed, so the existing snapshot-equality check allowed
this deletion. A scan can also become stale when repair completes before cleanup.

Link cleanup now distinguishes missing-Concept removals from missing-Source
cleanup. Inside the mutation queue, it checks current Concept repair receipts and
defers missing-Concept removal for every old/new ID referenced by those records.
The entire link remains unchanged; the result reports deferred IDs and Inbox and
Resync display the unresolved ownership message. Unrelated cleanup and explicit
removal retain their existing behavior. No IDs are reassigned automatically.
See the reconciliation addendum in [ADR 0029](adr/0029-concept-id-repair-resumes-both-markdown-files.md).

### P1 — Duplicate-ID repair could redirect an older Proposal to another Concept

After repairing Concept A from a shared old ID to a new ID, Concept B could be the
only scan result for that old ID. An older Proposal with only the ID then wrote to
B without evidence that B was its intended target. The baseline writer returned
`written` in the new regression that requires rejection. Pending-repair guards
and the scanner's multiple-match check did not cover completed duplicate repairs.

Before allocating a receipt, the writer now rejects Concept updates, added Views,
and Source links referring to a completed duplicate repair's old ID. Card proposals
may proceed only when their recorded generating Concept path matches the unique
scan result and is not a repaired path. Missing paths/scanners and mismatches stop
the write while keeping the full proposal. Valid existing write receipts retain
their path/hash recovery checks; there is no automatic replacement with the new ID.

### P2 — Reopening Merge after a context change discarded authored draft text

Conflict Merge cleared a saved draft if its existing Concept ID or incoming
fingerprint no longer matched, then persisted generated defaults over the edited
text. The baseline real-`setSession` test replaced every authored field. Reopening
now restores the saved text and warns when its context differs. The current
session still supplies the chosen Concepts, and preview/confirmation remain
necessary before any Markdown write. No stored draft is cleared or overwritten
merely by loading the changed context.

## Remaining boundaries

The confirmed findings above have implementation fixes. This is still a focused audit, not proof that every workflow is correct. Historical partial writes without recovery metadata, corrupted external state, conflicting target edits, and external writers remain outside automatic recovery. Real Obsidian restart, UI rendering, and platform acceptance remain outstanding.

Card and Concept ID repairs now have durable recovery records. External edits, malformed records and historical partial repairs without receipts still stop automatic recovery. Completed provenance retains identity reservations; migrated fallback/orphan IDs cannot be silently reused. External writers do not participate in the queue or its ID reservations. Concept repair preserves existing Source/Proposal/history provenance rather than globally rekeying it. Resync now protects links associated with repair records, including historical identities later removed externally; explicit ownership resolution and history-reference coordination remain future work. Normal Review startup still clears legacy Concept pauses after pending repairs finish, as required by the existing review policy.

New Concept and single-Card deletions now have durable recovery metadata. Historical partial deletions without receipts still require manual inspection. External edits/moves or changed Related files deliberately stop recovery; there is no automatic conflict resolution or undo. Obsidian rename does not guarantee an atomic compare-and-rename, and local-trash semantics still need real-platform acceptance. Activities/proposals referring to a deleted Concept remain a separate reconciliation-policy question; their prose is preserved rather than silently discarded.

## Validation

Thirteenth-pass validation (2026-09-10): full tests, build, release metadata check,
and diff check passed. The final strengthened approved-write recovery suite also
passed. Full output: `/private/tmp/mneme-proposal-target-repair-all.log`. Baseline
bundles substituting the writer/View from `25cf41c` failed with `written` instead
of rejection and with default Merge text instead of authored fields, respectively.
Temporary red logs: `/private/tmp/mneme-approvedWriteRecovery-red.log` and
`/private/tmp/mneme-conceptConflictMergeDraftRestore-red.log`. Regression coverage
includes ambiguous Concept writes, Card path/scanner checks, unrelated repairs,
real completion-save failure followed by reconstructed storage/Vault recovery with
zero repeated writes, and four saved-draft context combinations plus first use.
The View test invokes the real method with a render stub, not real Obsidian UI.

Twelfth-pass validation (2026-09-09): `npm run test:all`, `npm run build`,
`npm run check:release -- 1.0.0`, and `git diff --check` passed. Full output:
`/private/tmp/mneme-repair-provenance-all.log`. The integration test bundled with
the two reconciliation modules from `34e8d72` failed because the Source link map
became empty; output: `/private/tmp/mneme-repair-provenance-red.log`. Current tests
cover real repair followed by resync, repair completed between scan and cleanup,
complete link/Source-record retention, pending/completed and missing/duplicate
receipts, repeated resync, explicit removal and malformed repair records. Logs
are temporary; tests and the runner are committed. No live Obsidian UI or restart
acceptance was performed.

First-pass commands and results:

- `npm run test:all` — passed.
- `npm run build` — passed.
- `npm run check:release -- 1.0.0` — passed.
- `git diff --check` — passed.

No existing test expectation was weakened to conceal a failure. Added test doubles implement the new atomic process contract. Baseline tests passed before refactoring.

Second-pass final validation (2026-09-06): `npm run test:all`, `npm run build`, `npm run check:release -- 1.0.0`, and `git diff --check` all passed. The full suite includes the new plugin-data/settings concurrency tests and Source provenance regressions. Import-time Obsidian test stubs do not run plugin startup, rendering, network requests, or real filesystem writes.

Third-pass final validation (2026-09-06): `npm run test:all`, `npm run build`, `npm run check:release -- 1.0.0`, and `git diff --check` all passed. The Markdown test runner now awaits each exported test promise, including receipt recovery and Composer lifecycle tests, rather than allowing unresolved asynchronous tests to exit successfully.

Fourth-pass final validation (2026-09-07): `npm run test:all`, `npm run build`, `npm run check:release -- 1.0.0`, and `git diff --check` all passed. The full suite includes the manual recovery fault matrix, writer ID reservations, updated shared-state tests, and Composer lifecycle/control regressions. These use in-memory Vaults and a View rendering harness, not live Obsidian crash/restart testing.

Fifth-pass final validation (2026-09-07): `npm run test:all`, `npm run build`, `npm run check:release -- 1.0.0`, and `git diff --check` all passed. The Markdown runner includes the manual Concept recovery matrix and Concept Composer lifecycle tests, and awaits their exported promises. Full output: `/private/tmp/mneme-manual-concept-recovery-all.log`.

Sixth-pass final validation (2026-09-07): `npm run test:all`, `npm run build`, `npm run check:release -- 1.0.0`, and `git diff --check` passed. Concept Library and Vault-state runners now explicitly await exported suite promises. Full output: `/private/tmp/mneme-index-deletion-safety-all.log`.

Seventh-pass final validation (2026-09-08): `npm run test:all`, `npm run build`, `npm run check:release -- 1.0.0`, and `git diff --check` passed. Full output: `/private/tmp/mneme-concept-deletion-recovery-all.log`. These are deterministic in-memory tests, not real Obsidian crash/restart or local-trash acceptance.

Eighth-pass final validation (2026-09-08): `npm run test:all`, `npm run build`, `npm run check:release -- 1.0.0`, and `git diff --check` passed. Full output: `/private/tmp/mneme-card-deletion-recovery-all.log`. The Card-editor runner now waits for each exported async suite and includes a lightweight Modal harness. It does not run live Obsidian startup or filesystem crash/restart tests.

Ninth-pass final validation (2026-09-09): `npm run test:all`, `npm run build`, `npm run check:release -- 1.0.0`, and `git diff --check` passed. Full output: `/private/tmp/mneme-identity-content-safety-all.log` (temporary, not a durable artifact). Card-editor and Concept-library runners include the new editor, ownership, and actual Modal-save regressions. Import-only Obsidian stubs throw if YAML parsing is unexpectedly invoked. Real Obsidian rendering, YAML parsing, restart, and platform acceptance remain untested.

Tenth-pass final validation (2026-09-09): `npm run test:all`, `npm run build`, and `npm run check:release -- 1.0.0` passed. Additional final migration-control assertions passed with `npm run test:card-editor`; diff checks passed after documentation cleanup. Temporary logs: `/private/tmp/mneme-card-id-repair-all.log`, `/private/tmp/mneme-card-id-repair-focused.log`. Tests cover before/after intent and completion saves, process failures, cloned-storage reconstruction, missing-ID state/event/control migration, duplicate-state retention, malformed receipts before Vault I/O, fresh Markdown/history-only ID collisions, loaded/process/resume conflicts, restored old Markdown after completion, real queued ratings/settings, Modal refresh failure, and Manual/Inbox path/ID guards. The old refresh rollback was reproduced in `/private/tmp/mneme-card-id-refresh-red.log`. Test Vaults and YAML fixtures do not constitute real Obsidian restart or platform acceptance.

Eleventh-pass final validation (2026-09-09): `npm run test:all`, `npm run build`, `npm run check:release -- 1.0.0`, and final diff checks passed. Temporary full output: `/private/tmp/mneme-concept-id-repair-all.log`; original rollback repro: `/private/tmp/mneme-concept-id-refresh-red.log`. New tests reconstruct cloned storage/Vaults after both state-save failures and each file's before/after-process failures, assert exactly-once successful file changes, preserve Card state/Source records/drafts, and check duplicate/adopted-owner semantics. They also cover fresh ownership conflicts, inter-file edits, restored old files after completion, malformed paths before Vault I/O, actual queued pause/settings work, pending legacy-pause cleanup, both directions of Card/Concept repair exclusion, Modal refresh failure, and creation ID/path reservations. YAML fixtures and in-memory Vaults are not real Obsidian acceptance.

Focused manual checks still to run in a disposable Vault:

1. Reveal a Card and rapidly repeat a rating; only one review should be stored and only one Card advanced. Repeat with Review Tomorrow, Suspend, and Archive; verify the next Card's buttons work.
2. Trigger a rating, then leave/close the Review View while persistence is delayed; an old completion must not advance a new session.
3. Build a Merge preview, edit an involved Concept/Card Group, then confirm; expect a conflict and preserved edited Markdown. Also check successful Merge and Related add/remove.
4. Append Cards from separate authoring/Inbox entry points to the same existing group; confirm both Cards and any unrelated Markdown survive.
5. Rate Cards in separate Review Views while changing settings or saving a Composer draft. Reload the plugin and confirm that all states remain saved.
6. Reveal an answer, move to a later Card, then toggle `Show advanced diagnostics`; confirm the Card and answer remain visible. Check that `Show Today’s Focus` still applies its scheduling policy.
7. Preview a stale Source relink/removal, edit the Concept, then confirm; expect a conflict and preserved Markdown. Check a normal confirmation and its Source index update as well.
8. In a disposable test environment, inject completion-save failure after accepting a Concept/Card. Reload Mneme, resume the Inbox item, and verify one Concept path/Card ID plus complete provenance. Editing the target before retry should preserve the edit and report a conflict.
9. Start creating a Manual Card and close its Composer while the write is delayed. After completion, reopening should show an empty draft. Inject a completion-state save failure, reload, and use Resume Creation: the same Card ID should occur once and the draft should then clear. Repeat after appending an unrelated Card; both should remain.
10. Fail a Composer state load or its post-error reload: editing and submit must stay disabled, including after closing/reopening attempts. Interrupt a write, then remove its Concept from the visible library: Resume must retain the original target and never select another Concept. Verify that a new draft with the same text can intentionally create a distinct Card.

11. Create a Manual Concept with a Source Note and English Alias. Inject a completion-state failure, reload, and Resume Creation: verify one Concept ID/path, complete Source provenance, and a blank next draft retaining Source selection. Repeat with the Source moved or alias/folder settings changed after intent persistence. Edit the Concept before retry and verify recovery stops without removing the edits.
12. Close Concept Composer during creation/name checking or alias generation. Reopen and verify saved content and control availability. Complete a manual name-conflict Merge, then trigger an old autosave/callback: it must not restore or overwrite the new draft.

13. While resync checks a disposable Vault, complete a capture or Source relink and verify the new record/provenance remains. A later resync can process candidates skipped because they changed.
14. Point a disposable Concept at an ordinary Markdown file as its Cards path: Delete must stop and preserve both files. Edit a related Concept during deletion or its rollback: the new text must survive with a conflict/failure message. The durable protocol is covered by in-memory fault tests and still requires live acceptance.

These checks do not replace the handoff's outstanding real-provider, restart, Windows, and mobile publication evidence. The old `9cd98ad` ZIP and recordings remain evidence for their original source revision only.


Seventh-pass manual checks in a disposable Vault:

1. Delete a Concept with Cards and Related links. Confirm the Concept/Card files appear in local `.trash` under staging-suffixed names, Related links disappear, and review state no longer offers those Cards.
2. Interrupt deletion after staging or trashing a file. Reload Mneme: expect a pending notice and no automatic file removal. Run **Resume Concept Deletion** and confirm complete cleanup without duplicate trash effects.
3. Edit a staged file or recreate its original path before resuming. Expect a conflict and preserved content. Inspect local trash and the saved receipt before manual recovery; restoring files does not undo tombstones.
4. With a deletion pending, attempt a rating or an Inbox/Composer write for that Concept. Expect a clear error and retained proposal/draft text. Verify unrelated review/settings changes still persist.


Eighth-pass manual checks in a disposable Vault:

1. Open Delete Card from two views for the same Card. Confirm both: the block should be removed once, with one tombstone and retained review events.
2. Change Rubric, owner metadata or surrounding Markdown after opening Delete Card. Confirmation must preserve that change and request a refresh.
3. Inject a failure after Markdown processing but before completion state saves. Reload Mneme and run **Resume Card Deletion**: the same Card remains absent and its state completes without another Markdown removal.
4. Fail the state-cache or view refresh after successful deletion. The UI should report a refresh problem without restoring the Card. Check another Card's review controls still work.

Ninth-pass manual checks in a disposable Vault:

1. Repair a Card ID with a type and custom marker attributes; inspect the raw file and confirm only the ID changes.
2. Repair an empty Concept ID followed by another YAML field, including quoted/commented and CRLF examples. Confirm all annotations, fields, and prose remain.
3. Point duplicate-ID Concepts at the same Card Group, or point one at a foreign-owned group. Repair must report the conflict and leave both files unchanged. A new collision introduced after opening the dialog must also block repair.
4. Repair an exclusively linked duplicate Concept and a missing-ID Concept with an unclaimed group owner; verify the intended IDs and existing pause-migration policy.

Potential follow-up audit: reconcile identity-repair provenance with Source/index/history references and complete real Obsidian acceptance. Real Obsidian restart/provider/platform gates remain open.


Tenth-pass manual checks in a disposable Vault:

1. Assign an ID to an unlabelled Card with saved reviews, then replace one of two duplicate IDs. Verify fallback state/events move in the first case and shared state stays with the original ID in the second.
2. Interrupt after intent persistence or after Markdown changes. Reload the plugin: expect a pending notice and no automatic write. Run **Resume Card ID Repair** and verify the same new ID and a single completed migration.
3. Edit the target before confirmation or resume; expect a conflict with the edit preserved. After a completed repair, restore old Markdown externally and repeat the request; it must report a conflict, not successful repair.
4. Fail a view refresh after successful persistence. The new ID/state must remain aligned. An old Review View must not recreate migrated fallback state. Check unrelated reviews and settings still persist.

Eleventh-pass manual checks in a disposable Vault:

1. Repair a missing Concept ID with an orphan Card Group owner; inspect both IDs and pause migration. Repeat by adopting the existing owner directly: unchanged Card Group content should not be rewritten. Replace one duplicate Concept ID and verify shared old state remains.
2. Interrupt before/after each file change and before completion state saves. Reload, then run **Resume Concept ID Repair**: each file must end at the same new ID without duplicate writes or stale-content restoration.
3. Change the second file or add a conflicting Concept/Card Group before resume. Expect a conflict and preserved content. Restore old Markdown after a completed repair and repeat the request: it must not report success.
4. Open Review while repair is pending; legacy pause cleanup must preserve pending pause state. Check competing Card ID repair, creation, merge and deletion are blocked where they overlap. After repair, legacy pause cleanup retains its existing behavior.

Twelfth-pass manual checks in a disposable Vault:

1. Repair a missing Concept ID with an orphan owner and existing Source evidence. Run **Resync Index**, then refresh Inbox: the original link and evidence must remain, and the UI must report ownership still needs review. The source record must retain its old linked ID.
2. Repeat resync and restart: retained provenance must not silently disappear or be assigned to the new Concept. Confirm that unrelated stale index items still reconcile.
3. Repair one duplicate ID: shared old provenance must stay with its original ID. Explicitly remove a Source link through its normal workflow and confirm a subsequent resync does not restore it.

Thirteenth-pass manual checks in a disposable Vault:

1. Preserve a Proposal generated for one of two Concepts with the same ID, repair that Concept, then accept the old Proposal. An ambiguous target must be rejected with its text intact and the other Concept unchanged. A Card generated from the remaining Concept with a matching source path must still work.
2. Edit every field in a conflict-Merge draft, return to conflict options, then change the existing Concept ID or incoming revision and reopen Merge. Confirm all saved text remains and a context warning is visible; review the current targets and preview before confirming.

Explicit rebinding of ambiguous legacy Proposals and Conflict Merge asynchronous confirmation/lifecycle and durable completion remain follow-up work. These tests do not establish real Obsidian restart or platform acceptance.
