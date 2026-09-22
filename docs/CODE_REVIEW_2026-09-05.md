# Mneme code review and refactoring — 2026-09-05

Updated: 2026-09-23 (thirtieth pass)

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

The fourteenth pass on `fix/conflict-merge-session-lifecycle` starts from checkpoint `57bdc2f`. It isolates asynchronous conflict-Merge actions by session and keeps confirmation/commit operations locked through completion.

The fifteenth pass on `fix/guided-merge-session-lifecycle` starts from checkpoint `8c0a112`. It applies selection and operation boundaries to the separate ordinary Guided Merge View, without changing the underlying Merge transaction protocol.

The sixteenth pass on `fix/markdown-transaction-uncertain-writes` starts from checkpoint `292e6fc`. It fixes same-process compensation when an atomic Markdown transform succeeds but `process()` rejects before or after applying its result. Durable Merge recovery remains separate work.

The seventeenth pass on `fix/merge-input-ownership` starts from checkpoint `bb69ace`. Before extending durable Merge recovery, it fixes three preparation guards: stale Card Group locators, incoming proposals already owned by approved-write recovery, and false Concept identity matches in body text.

The eighteenth pass on `fix/merge-pending-write-guards` starts from checkpoint `83c729f`. It protects pending Manual Card/Concept and Inbox operations from overlapping Merge writes, including rewired Related neighbors and Card Groups reserved before creation.

The nineteenth pass on `fix/merge-card-group-content` starts from checkpoint `b8656b4`. It retains non-Card content in a vacated Card Group, rejects within-group duplicate IDs, and prevents leftover legacy section markers from becoming unintended Cards after migration.

The twentieth pass on `fix/card-relocation-references` starts from checkpoint `8d6b0d6`. It guards Card relocation against source-path and document-reference dependencies, and rechecks Wiki resolution before execution.

The twenty-first pass on `fix/concept-perspective-references` starts from checkpoint `436bfa1`. It applies the shared relocation guard to preserved Concept perspectives and prevents code examples from being treated as managed Card navigation.

The twenty-second pass on `fix/merge-concept-structure` starts from checkpoint `fd968fd`. It preserves additional Concept headings and updates native Card navigation when the survivor adopts another group, sharing Merge-specific Markdown inspection.

The twenty-third pass on `fix/related-markdown-literals` starts from checkpoint `da1028b`. It protects literal Markdown examples from Related discovery and edits, sharing the line inspector with Merge transformations.

The twenty-fourth pass on `fix/related-explicit-paths` starts from checkpoint `385df15`. It preserves explicit directories during Related resolution and makes shorthand matching directional across Merge, relationship edits and deletion cleanup.

The twenty-fifth pass on `fix/merge-related-match-consistency` starts from checkpoint `68d2abb`. It aligns Guided Merge removal and deduplication with the same Concept resolver used for relationship discovery.

The twenty-sixth pass on `fix/related-source-context` starts from checkpoint `8394c5a`. It resolves bare Related links from their source file during manual edits, deletion preparation and deletion recovery, with decision rechecks before writes.

The twenty-seventh pass on `fix/related-scan-resolution` starts from checkpoint `58e8bcd`. It aligns the scanner-provided Related relationships shown in Concept details and management with source-context resolution.

The twenty-eighth pass on `fix/merge-related-source-context` starts from checkpoint `a05d506`. It applies native source-context resolution to Guided Merge Related preparation and rechecks reviewed decisions before and during execution.

The twenty-ninth pass on `fix/merge-concept-redirect-content` starts from checkpoint `1de69c8`. It preserves source Concept Markdown and custom YAML when retiring the note as a redirect.

The thirtieth pass on `test/native-merge-acceptance` starts from checkpoint `c192e8f`. It performs native Obsidian Merge acceptance and fixes stale Concept details exposed by the completion action.

The existing `mneme` self-link, `release-artifacts/`, recordings, and acceptance Vaults were preserved. No remote push, publication or version change was performed. Pass 30 updated the plugin in the disposable release-candidate Vault after backing it up; personal Vaults and the recorded-acceptance Vault were not updated.

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
- `15ad40c` — bind conflict-Merge loads, AI, confirmation and completion to their original session.
- `72edadb` — isolate Guided Merge scans, AI, selection and confirmation, and wait for started commits during transitions.
- `223494d` — compensate Markdown writes applied before process rejection, with exact-content rollback guards and fault-injection regressions.
- `6a61b59` — validate current Merge Card associations, incoming write ownership, and frontmatter identity using shared scalar inspection.
- `d93c26f` — block Merge writes that invalidate pending authoring recovery paths, hashes or Card ownership.
- `5909142` — preserve former Card Group notes/custom properties and reject ambiguous Card migration.
- `1c3c23c` — guard moved Card references and recheck Wiki resolution before Guided Merge writes.
- `7261d28` — validate preserved Concept references, omit managed historical Card navigation, and preserve nested fence examples.
- `4b0fac4` — preserve additional Concept headings and synchronize managed navigation with adopted Card Groups.
- `2d9b958` — exclude literal examples from Related discovery and preserve them during deterministic edits.
- `ce9c8d0` — honor explicit Related directories and prevent root-level targets from matching qualified links elsewhere.
- `b6e2261` — preserve unresolved same-basename links and use resolved identities consistently for Guided Merge edits.
- `e13daa7` — resolve manual/deletion Related links in source context and preserve reviewed decisions through execution and recovery.
- `8380f2d` — resolve scanner Related relationships from the source note and remove guessed basename edges.

- `64472f3` — resolve Guided Merge Related links in source context, guard migrated spellings and recheck prepared decisions.

- `3d3affc` — preserve source Concept content and properties in redirect notes while retiring their active identity.

- `49f53d1` — resolve Concept details against the supplied current scan result after Merge.

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

### P1 — A previous conflict-Merge confirmation could execute after session replacement

The operation lock was released after preparing a preview, before awaiting its
confirmation dialog. Reopening the workspace could replace its session while that
dialog remained open. The old confirmation still executed its old plan and the
completion callback then read the new session. The baseline lifecycle test counted
one execution after switching, where zero was required.

The View now keeps preparation/confirmation/commit under one operation lock and
binds results to a session revision, including same-key and same-object reopening.
Execution receives the confirmed plan and original session directly. Switching or
closing waits for an already-started commit; closing invalidates UI work before
that wait. The original completion callback still runs, but a closed view is not
redrawn. Completed drafts are not saved again after the service clears them.

### P2 — Late AI and draft loads could overwrite a newer Merge session

AI drafting and saved-draft loads previously assigned their results without
checking whether the session had changed or closed. Old completion handlers could
also release a newer operation's lock. Every asynchronous boundary now verifies
the current session/revision before updating or saving results. Editor handlers
and delayed autosaves enforce the same boundary. A failed pre-switch draft save
retains the original in-memory text. These are View lifecycle changes, not durable
recovery for the underlying Merge transaction; see [ADR 0021](adr/0021-name-conflict-merge-defers-all-writes.md).

### P1 — Closed or reselected Guided Merge could still execute an old confirmation

Ordinary Guided Merge had its own unguarded confirmation and close path. Its lock
ended before the dialog resolved; closing only emptied the DOM. The baseline
regression executed a prepared plan after closing the workspace. Selection changes
from another entry point could also race with an already-started commit's success
rendering. The View now invalidates obsolete operations by revision, keeps the
confirmation lock through commit, and passes the exact plan/final Markdown to
execution. Close/refresh/selection transitions wait for a started commit, while
close immediately suppresses late UI updates. Successful completion clears the
in-memory draft and prevents repeat submission from old controls.

### P2 — Guided Merge AI and scans could replace newer selections and edits

AI drafting read the survivor after the response returned; inspection and scanner
responses updated fields without checking whether selection had changed. Revision
checks now guard reads, responses, preparation, errors and finalizers. AI uses the
survivor captured at request time. Controls and callbacks are locked together, and
obsolete original-Markdown rendering stops when its container or operation is no
longer current. A regular scan losing a selected Concept retains authored text
while missing targets prevent confirmation. See [ADR 0003](adr/0003-concept-merge-requires-guided-review.md).

### P1 — A Markdown write applied before rejection was omitted from rollback

The shared transaction appended each write to its rollback list only after
`await vault.process()` returned successfully. If the adapter applied a result
and then rejected, the failing file remained changed while earlier files rolled
back and plugin data stayed at its previous state. This affects Incoming Merge,
Guided Merge, Related updates, and Source provenance relink/removal.

The helper now records an attempt inside the transform after the exact `before`
check succeeds. Reverse compensation restores exact `after`, accepts an already
unchanged `before`, and preserves any other content with an explicit rollback
error. A transform precondition failure never registers the file, including when
another writer independently produced the planned `after`. State commit and
rollback sequencing is unchanged. See [ADR 0022](adr/0022-plugin-state-mutations-share-one-queue.md).

### P1 — Guided Merge could overwrite a Card association changed since scanning

The service read current Concept Markdown but selected Card files solely from the
cached `ConceptSummary.cardsPath`. A changed, removed, or newly added `cards`
link could therefore be overwritten with an obsolete association during Merge.
Preparation now compares the current frontmatter locator with the scanned locator
using the scanner's own path interpretation. A mismatch blocks before any write;
link aliases and omitted `.md` extensions remain supported. Existing exact
snapshot checks continue to reject changes after preview.

### P1 — Conflict Merge could take over a proposal with a pending write receipt

An approved new-Concept proposal can retain payload and a receipt after an
interrupted Inbox write. Incoming Merge previously accepted that state and could
mark it written against a different Concept while retaining the original receipt
and any original target Markdown. A delayed name-conflict choice can reopen Merge
with the latest proposal timestamp, so the timestamp guard alone is insufficient.
Any non-undefined receipt now blocks preparation, including malformed records.
A receipt acquired after preview is caught by the existing state snapshot check.
The proposal, authored Merge draft, Source state, and original target are retained.

### P1 — A body line could satisfy Incoming Merge's Concept identity check

The old full-document regex accepted an expected `mneme_id` line in prose or a
code fence even when the actual frontmatter ID had changed. It also omitted type
and duplicate-field validation. The check now uses leading frontmatter only and
requires a unique Concept type and ID. ID repair's conservative scalar inspection
is extracted into `markdownScalar.ts` and shared with Merge. Guided Merge's setter
recognizes quoted keys so supported input does not create a second `cards` field.
This is scalar validation, not a full YAML parser. See the additions to
[ADR 0003](adr/0003-concept-merge-requires-guided-review.md) and
[ADR 0021](adr/0021-name-conflict-merge-defers-all-writes.md).

### P1 — Merge could invalidate another operation's pending recovery record

Guided Merge checked actionable proposals referencing the merged-away Concept,
but omitted pending Manual creation and receipt-bound writes targeting the
survivor or a Related neighbor. Once authoring Markdown was written and completion
saving failed, Merge could move its Card or change its Concept before Resume,
breaking the original path/owner/hash contract. Incoming's Manual-origin guard
also did not protect an Inbox-origin merge into a different pending creation or
pending Inbox update target.

Both services now use a shared preparation guard. Guided checks participant IDs,
all planned write paths and declared Card Group paths, including absent groups.
Incoming checks only its actual target Concept path; editing that Concept need
not block an otherwise independent pending Manual Card. Completed and unrelated
valid receipts are allowed. Malformed pending records are preserved and rejected.
Receipts acquired after preview remain covered by the queued state-snapshot check.
This preserves existing authoring recovery and does not make Merge itself durable.
See [ADR 0003](adr/0003-concept-merge-requires-guided-review.md) and
[ADR 0021](adr/0021-name-conflict-merge-defers-all-writes.md).

### P1 — Generated Card Group redirects discarded learner-authored content

When both Concepts had Card Groups, Guided Merge copied only source Card blocks
and replaced their entire original file with a generated redirect. Custom YAML,
callouts, references and notes before/between/after Cards disappeared. The former
group is now derived from the original Markdown by removing inspected block ranges
in reverse offset order. Its body and custom properties remain at the old path;
Mneme type/owner/navigation metadata is updated and a redirect notice is appended.
The actual Card blocks remain unchanged in the destination. A quoted type key is
normalized so the vacated file is still recognized as an empty Card Group.

### P1 — Duplicate IDs inside a single Card Group bypassed Merge preflight

The previous check compared IDs between the two groups but did not reject
repeated IDs within either group. Each group now requires unique explicit IDs,
including when the source group is adopted directly. Legacy section markers
outside complete Card blocks also stop preparation: retaining these markers in a
vacated group would otherwise create an unintended parser result. Marker examples
inside code fences are conservatively blocked as well. See the content-retention
addition to [ADR 0003](adr/0003-concept-merge-requires-guided-review.md).

### P1 — Moving unchanged Card bytes changed their reference context

Review renders Markdown using the Card's current group path. Copying a block to
another file could silently redirect local images/links, current-file anchors or
reference definitions. The new `cardRelocationSafety` helper rejects those known
dependencies before preview and reports the Card ID and both paths. Stable Wiki
links/embeds are allowed only when Obsidian resolves the same non-source file in
both contexts; common absolute external Markdown destinations remain allowed.
Execution repeats the guard after snapshot checks, detecting a new ambiguous or
unresolved Wiki target even when the participant Markdown/state is unchanged.
Adopting the original group in place remains supported. No Card bytes or schema
change. See [ADR 0003](adr/0003-concept-merge-requires-guided-review.md).

This conservative lexical check also blocks syntax in code examples and HTML
resource attributes. It is not a full Markdown parser or link migration. Incoming
backlinks, arbitrary plugin embeds, heading/block-ID collisions, and external edits
after the final metadata-cache observation remain separate concerns.

### P1 — Preserved Concept perspectives bypassed relocation checks

Guided Merge preserved the merged Concept body as a View at the survivor path,
but only Card relocation had reference guards. Relative attachments and local
anchors could therefore change target. Card and Concept checks now share
`markdownRelocationSafety`; the perspective is checked after deterministic Related
rewiring and again against final edited Markdown before execution. This also catches
new destination reference definitions and Wiki resolution changes after preview.
The preservation choice is carried only in the in-memory plan.

Generated Card navigation directly under Review Cards is omitted from the copied
perspective when it exactly matches the declared group. This prevents a missing,
not-yet-created group from blocking normal Concept merges; authored section notes
remain. The perspective extractor now respects fence character/length and closing
suffixes, keeping headings and navigation examples inside nested fences intact.
See [ADR 0003](adr/0003-concept-merge-requires-guided-review.md).

### P1 — Perspective extraction discarded additional H1 headings

The extractor omitted every H1, silently losing learner-authored section headings.
It now omits only a leading document H1 and retains later/preamble-following H1s.
A shared shift nests retained ATX headings under the generated H3 View, preserving
relative levels until the existing H6 ceiling. Fenced examples are excluded from
heading inspection. The logic moved into `conceptMergeMarkdown.ts`.

### P2 — Adopted Card Group navigation still pointed at the old path

Adoption updated the frontmatter locator but left the survivor's generated native
Review Cards link unchanged. The shared matcher now rewrites only navigation
matching the former declared path directly under the template section, preserving
aliases, whitespace and LF/CRLF. Other links, sections, subsections, comments and
code examples remain untouched. The same matcher removes navigation from the
historical perspective; no missing navigation section is generated. The integration
regression uses actual Concept rendering and draft application before execution.

### P1 — Related discovery and edits treated literal examples as relationships

The old fence tracker accepted a shorter closing run, and Related parsing did not
exclude comments or inline code. A note containing only an example could become a
Merge neighbor, and removal/rewiring could alter that example. Related heading
inspection and link operations now share `markdownLineInspector` with the Merge
body transforms. An equal-length masked view excludes literal spans; active ranges
are checked against original text and removed in reverse order. Frontmatter,
comments, nonmatching prose and code examples remain intact. Purely literal
sections are retained, and example links do not prevent adding a real relation.

Adding inside an unclosed fence/comment now fails before any service write. An
existing earlier Related section remains editable when a later section contains
the open block. Matching identities, path resolution, schemas and transaction
protocols are unchanged. See [ADR 0016](adr/0016-related-concepts-are-symmetric-links.md).

### P1 — Related path fallback could rewire or remove a different Concept's links

Guided Merge discarded the directory of an unresolved target before trying its
unique-basename map. `Missing/Beta` could therefore resolve to `Notes/Beta.md`,
rewire an unrelated reader, disappear as a survivor self-link, or pull a different
same-named neighbor into the merge. Resolution now tries the normalized exact path
and permits basename fallback only for an authored target without a directory.
Unknown qualified links remain unresolved and retain their authored text.

The shared Related matcher also treated shorthand symmetrically: removing root
`Beta.md` could remove `Archive/Beta`, and adding the root relation could be
incorrectly suppressed. Only an authored bare link may now be shorthand; a
qualified link must match the normalized full target path. Bare-link compatibility,
aliases and optional `.md` handling remain. See
[ADR 0016](adr/0016-related-concepts-are-symmetric-links.md).

### P1 — Merge edits used broader matching than relationship discovery

With both `Notes/Beta.md` and `Archive/Beta.md`, Merge discovery leaves `[[Beta]]`
unresolved. But removing a resolved `[[Notes/Beta]]` participant link then called
the default basename matcher and also removed `[[Beta]]`. The same mismatch in
addition suppressed explicit survivor/neighbor links, or unresolved qualified
source links, when a same-named ambiguous bare link already existed.

Related add/remove helpers now accept an optional matcher. Every Guided Merge
call uses one matcher backed by its existing resolver: identical normalized
spellings match; otherwise both targets must resolve to the same Concept path.
Unresolved authored links and their aliases survive, while explicit relationships
are added and actual participant links are removed. Unique resolved shorthand
continues to work. No persisted schema, plan fields or transaction protocol
changed. See [ADR 0016](adr/0016-related-concepts-are-symmetric-links.md).

### P1 — Manual Related edits and deletion guessed bare-link ownership

The default basename matcher treated a bare `[[Beta]]` as the selected Beta even
when Obsidian resolved it to another directory. This could remove an unrelated
relationship or suppress addition of the selected one. These workflows now share
`relatedConceptResolution.ts` and receive metadataCache at all production entry
points. Bare links use the owning note's path; resolved canonical targets must
match the selected file. Unresolved same-basename links stop rather than guess.
Qualified locators retain the preceding exact-path rule. Root-level additions
must also verify that the newly emitted bare link resolves to the selected file.

Manual execution recomputes both sides after all awaited reads and inside every
forward transform. This includes unchanged sides; a no-op regression caught a
resolution change while reading the second note. Compensation still restores
reviewed bytes with content guards independently of resolution.

Deletion plans keep optional in-memory checks for unchanged notes. Before saving
intent, verify snapshots and recompute all cleanup decisions. Recovery uses the
same matcher and original afterHash, then rechecks inside process. Applied hashes
are recognized before resolving links, so already-applied cleanup can finish even
if the target no longer resolves. No durable receipt fields changed. Older pending
receipts with different broad-matching results stop for inspection. See
[ADR 0016](adr/0016-related-concepts-are-symmetric-links.md) and
[ADR 0026](adr/0026-concept-deletion-resumes-from-durable-staging.md).

### P2 — The UI's shared scan result could show a different Related Concept

ConceptScanner discarded an unknown qualified target's directory before basename
lookup, creating a false symmetric relationship. It also preferred a root Concept
or a unique Concept basename over the actual file opened by a bare link. Regular
notes were absent from that index, and identical names could resolve differently
from each source note. These incorrect IDs fed detail navigation, relationship
counts and the manager's existing/addable lists.

The scanner now resolves bare links through its Obsidian adapter with the owning
note's path, then looks up the canonical target among identity-valid Concepts.
Unavailable resolution and ordinary/excluded files produce no edge; qualified
paths require the prior exact normalized match. The basename index is removed.
Symmetric presentation and self-link filtering remain. A scan after real manual
add/remove agrees with the selected relationship and preserves another same-named
bare relationship. No UI DOM or persisted schema change is needed. See
[ADR 0016](adr/0016-related-concepts-are-symmetric-links.md).

### P1 — Guided Merge could rewire ordinary-note links and change copied destinations

Merge's Concept-only basename index could treat Reader's bare `[[Topic]]` as a
link to the merged `Concepts/Topic.md`, even when native resolution opens ordinary
`Topic.md`. Copying a bare source relationship to the survivor could also change
its destination with the source context.

Related preparation now lives in `conceptMergeRelated.ts`. Bare links use the
native resolver with their owning path, and only actual scanned Concept targets
become neighbors. Missing resolvers block bare-link processing; unresolved results
remain unresolved. Copied ordinary/unresolved links must retain their destination
under the emitted spelling, including `.md` removal. Generated root-level Concept
links must resolve to the intended file in the receiving note.

An in-memory plan signature tracks the Markdown inventory, type/ID fields and
Concept relationship targets. All recorded native decisions, including skipped
readers, are checked after execution preflight reads and inside each forward
atomic transform. Changed decisions stop the operation; compensation preserves
the existing content guards without requiring the now-changed resolver result.
No durable receipt schema is introduced. See
[ADR 0016](adr/0016-related-concepts-are-symmetric-links.md).

### P1 — Source Concept redirects discarded custom YAML and original content

Guided Merge replaced the entire source note with a small redirect template.
Custom aliases, properties and comments were lost even when a perspective was
copied into Views; without that copy, the source body was lost as well.

`conceptMergeRedirect.ts` now edits only managed identity metadata, retaining the
original body and unrelated YAML at the original path. The active ID becomes
`former_mneme_id`, the type becomes `concept_redirect`, and a leading notice links
to the survivor before any original fence/comment. Historical Card links and
learning properties remain readable but do not activate a Concept association.
Existing redirect metadata collisions and unsupported managed fields block
preparation. The optional View copy retains its separate relocation checks.
Snapshot/transaction/compensation rules and plugin-data schemas are unchanged.
See [ADR 0003](adr/0003-concept-merge-requires-guided-review.md).

### P2 — Merge completion opened details with an obsolete Concept summary

Native acceptance found that View Merged Concept displayed zero Related Concepts
while refreshed Library details displayed the correctly written relationship.
The completion callback rescanned but still supplied the pre-merge survivor as
the modal's selected object. The shared detail entry now resolves ID and exact
path against the supplied list, and uses that object for the modal and actions.
Missing/moved/changed identities request a refresh instead of opening stale data.
This keeps one snapshot consistent; it is not a live-update subscription.

## Remaining boundaries

Manual Related edits and deletion now use source context for bare links. Scanner-provided UI discovery and Guided Merge now also follow source context for bare links. Merge rechecks its in-memory plan but does not provide an atomic Vault-wide snapshot; external identity/content changes after preflight remain possible. Qualified relative/suffix paths, existing qualified-path case folding, cache freshness and multiple sections remain separate work. Deletion no-op checks are only in-memory pre-intent checks: they do not reserve resolution after persistence or expand the saved receipt to newly discovered notes.

Relative-path and case-collision semantics, native cache freshness in Obsidian, and duplicate Related sections remain separate audits. Explicit-directory matching does not provide full Wiki resolution.

Incoming/Guided Merge still lack durable completion records. Process termination or conflicting/failed compensation can leave Markdown and state partially updated; this pass does not resolve those cases.

The confirmed findings above have implementation fixes. This is still a focused audit, not proof that every workflow is correct. Historical partial writes without recovery metadata, corrupted external state, conflicting target edits, and external writers remain outside automatic recovery. Pass 30 verifies a narrow macOS Merge UI/content/plugin-reload path; full Obsidian restart, broader UI rendering and cross-platform acceptance remain outstanding.

Card and Concept ID repairs now have durable recovery records. External edits, malformed records and historical partial repairs without receipts still stop automatic recovery. Completed provenance retains identity reservations; migrated fallback/orphan IDs cannot be silently reused. External writers do not participate in the queue or its ID reservations. Concept repair preserves existing Source/Proposal/history provenance rather than globally rekeying it. Resync now protects links associated with repair records, including historical identities later removed externally; explicit ownership resolution and history-reference coordination remain future work. Normal Review startup still clears legacy Concept pauses after pending repairs finish, as required by the existing review policy.

New Concept and single-Card deletions now have durable recovery metadata. Historical partial deletions without receipts still require manual inspection. External edits/moves or changed Related files deliberately stop recovery; there is no automatic conflict resolution or undo. Obsidian rename does not guarantee an atomic compare-and-rename, and local-trash semantics still need real-platform acceptance. Activities/proposals referring to a deleted Concept remain a separate reconciliation-policy question; their prose is preserved rather than silently discarded.

## Validation

Thirtieth-pass validation (2026-09-22/23): full tests, build, release check, diff
checks and independent review passed. A real macOS Obsidian 1.13.7 popout workflow
verified native same-name resolution, cancellation, successful Merge, preserved
redirect properties/body and navigation, and retired-source exclusion from Library.
A stale completion-detail bug was reproduced in UI and in a real-plugin-method
regression test; after repair, completion details and post-reload Library both
showed the two actual Related Concepts. Existing test Markdown and proposal/draft/
review data remained unchanged. See the bounded evidence and remaining limits in
[NATIVE_MERGE_ACCEPTANCE_2026-09-22.md](NATIVE_MERGE_ACCEPTANCE_2026-09-22.md).


Twenty-ninth-pass validation (2026-09-22): full tests, build, release and diff checks passed.
A pre-fix bundle reproduces missing aliases. Regressions cover LF/CRLF and both
View-preservation settings, exact custom YAML/body retention, local references,
retired identity, quoted values/comments, conflicting redirect metadata,
unsupported version values, unclosed fences/comments, missing EOF newline,
post-preview edits and state-save failure compensation. Independent production
review found no blocking issue. Logs: `/private/tmp/mneme-concept-redirect-all.log`
and `/private/tmp/mneme-concept-redirect-build.log`; pre-fix bundle:
`/private/tmp/mneme-concept-merge-redirect-red2.mjs`.


Twenty-eighth-pass validation (2026-09-22): full tests, build, release check and
diff checks passed. Regressions cover native Concept rewiring, ordinary same-name
notes left untouched, unresolved links, copied `.md` spellings, changed destination
contexts, absent resolvers, and correct/wrong/unresolved generated root links.
Execution cases cover changed resolution and relationships on unwritten readers,
ordinary-to-Concept identity changes, new files, allowed ordinary body edits, and
resolution changes at the first or second forward write with compensation.
Logs: `/private/tmp/mneme-merge-native-focused.log`,
`/private/tmp/mneme-merge-native-all.log`, and
`/private/tmp/mneme-merge-native-build.log`.


Twenty-seventh-pass validation (2026-09-21): full tests, build, release check and
diff checks passed. The pre-fix scanner creates an edge for `Missing/Beta` and
chooses root Beta when native resolution returns Archive/Beta. Regressions cover
native directory/root/ordinary/unresolved targets, absent resolvers even with a
unique Concept basename, symmetric results, and a real scan → manual Related
add/remove → rescan sequence preserving the other same-named relationship and
its original alias. Logs: `/private/tmp/mneme-related-scan-all.log`,
`/private/tmp/mneme-related-scan-focused.log`,
`/private/tmp/mneme-related-scan-directory-red.log`, and
`/private/tmp/mneme-related-scan-context-red.log`.

Twenty-sixth-pass validation (2026-09-21): full tests, build, release check and diff
checks passed. The original manual matcher suppressed an explicit addition despite
a bare link resolving elsewhere. Separate red/green checks caught resolution
changes before atomic transformation, incorrect root-level generated links, and
two no-op sides invalidated during the second read. Deletion regressions cover
mixed qualified/bare cleanup, unavailable resolution, both directions of changed
preparation decisions, real prepare/delete execution, uncertain intent-save
recovery and already-applied cleanup with an unavailable resolver. The independent
reviewer's no-op finding was fixed and reviewed again. After the interrupted turn's
temporary sessions/logs became unavailable, final verification was rerun; the
current full-suite log is `/private/tmp/mneme-related-context-all.log`.

Twenty-fifth-pass validation (2026-09-20): `npm run test:all`, `npm run build`,
`npm run check:release -- 1.0.0`, diff checks and focused review passed. Logs:
`/private/tmp/mneme-related-consistency-all.log`,
`/private/tmp/mneme-related-consistency-focused.log`,
`/private/tmp/mneme-related-consistency-remove-red.log`, and
`/private/tmp/mneme-related-consistency-add-red.log`. The original implementation
loses an unresolved bare link while removing a resolved participant. With only
removal fixed, a second regression independently demonstrates a suppressed
explicit addition. Five prepare/execute cases cover survivor and reader removal,
survivor/neighbor/unresolved-source additions, retained aliases and unchanged
unrelated same-named files. Existing unique bare-link rewiring coverage passes.
The primary thread ran all checks; the independent reviewer provided read-only
code analysis, not additional test evidence.

Twenty-fourth-pass validation (2026-09-20): `npm run test:all`, `npm run build`,
`npm run check:release -- 1.0.0` and diff checks passed. Logs:
`/private/tmp/mneme-related-paths-all.log`,
`/private/tmp/mneme-related-paths-focused.log`,
`/private/tmp/mneme-related-paths-red.log`, and
`/private/tmp/mneme-related-root-delete-red.log`. The old Merge counts one neighbor
for an unresolved qualified link where zero is expected. A deletion bundle
substituting only the old Related helper plans removal of `Archive/First` when
deleting root `First.md`. Regressions exercise successful Merge execution with
unknown, bare, exact and mixed links; survivor self-link preservation; unresolved
source relations with a same-named real neighbor; and root-target deletion,
addition and replacement without touching qualified links elsewhere.

Twenty-third-pass validation (2026-09-20): full tests, build, release check and diff
check passed. Logs: `/private/tmp/mneme-related-literals-all.log`,
`/private/tmp/mneme-related-literals-focused.log`,
`/private/tmp/mneme-related-literals-red.log`, and
`/private/tmp/mneme-related-merge-red.log`. The original helper reads Beta from a
fenced example; a bundle substituting only that helper from `da1028b` identifies a
literal-only note as a Merge neighbor. Tests cover LF/CRLF, fence character/length
and suffixes, fake headings/section ends, comments, single-line code spans,
escapes, indentation, Unicode range offsets, mixed active/literal links and
unclosed append targets. Real Merge execution preserves literal-only neighbors
byte-for-byte and retains examples while rewiring a real relation. Blocked
preparation preserves all files/state with zero writes. The full suite includes
existing relationship, deletion and Merge recovery checks.

Twenty-second-pass validation (2026-09-20): full tests passed; final comment and
indentation refinements passed the Concept suite, build, release check and diff
check. Logs: `/private/tmp/mneme-concept-structure-all.log`,
`/private/tmp/mneme-concept-structure-focused.log`,
`/private/tmp/mneme-concept-structure-red.log`, and
`/private/tmp/mneme-concept-navigation-red.log`. The original service loses an
additional H1; a separate baseline bundle from `fd968fd` leaves native Card
navigation at the old path after adopting another group. Regressions cover the
actual renderer/draft/service flow, LF/CRLF, aliases, exact navigation-only edits,
heading retention/nesting, preambles, no document title, comments, inline-code
comment examples, indented sections and fenced examples. Review state is preserved.

Twenty-first-pass validation (2026-09-20): full tests, build, release check and diff
checks passed; strengthened fence cases subsequently passed the focused suite and
build. Logs: `/private/tmp/mneme-concept-perspective-all.log`,
`/private/tmp/mneme-concept-perspective-focused.log`,
`/private/tmp/mneme-concept-perspective-red.log` and
`/private/tmp/mneme-concept-perspective-fence-red.log`. Bundles using the service
from `436bfa1` separately reproduce accepted relative-image relocation and modified
fenced examples. Tests cover LF/CRLF, local references/anchors/footnotes/HTML,
stable Wiki and external links, absent or existing declared Card Groups, retained
notes, short/mixed/trailing-text fence runs, post-preview Wiki changes and final
edited reference definitions. Blocked operations leave files/state untouched.
The earlier Card and pending-authoring recovery regressions still pass.

Twentieth-pass validation (2026-09-20): full tests, build, release check and diff
checks passed. Logs: `/private/tmp/mneme-card-relocation-all.log`,
`/private/tmp/mneme-card-relocation-focused.log` and
`/private/tmp/mneme-card-relocation-red.log`. A bundle substituting the service
from `8d6b0d6` returns ready for `![image](./asset.png)` where the new regression
requires blocked. Tests cover relative/root/anchor Markdown destinations, nested
labels, attachment paths with spaces, reference/shortcut/footnote forms, HTML
resources, unresolved/different/self Wiki targets, missing resolver, allowed external
URLs and stable Wiki links, unchanged raw blocks/IDs/review state after successful
Merge, and in-place adoption. Wiki target changes after preview return conflict
with no file or state writes. These are service tests with a resolver double;
real Obsidian metadata-cache/rendering and restart acceptance remain outstanding.

Nineteenth-pass validation (2026-09-20): full tests, build, release check and diff
checks passed. Logs: `/private/tmp/mneme-merge-card-content-all.log` and
`/private/tmp/mneme-merge-card-content-focused.log`. The original renderer failed
the custom-property assertion in `/private/tmp/mneme-merge-card-content-red.log`;
after the retention fix alone, within-group duplicates still returned ready in
`/private/tmp/mneme-merge-card-duplicate-red.log`. Regressions cover LF/CRLF and
zero/one/multiple source blocks, custom YAML lists, exact retained body segments,
raw block retention, final Card IDs, unchanged review state, empty redirect parsing,
source/target/adopted-source duplicates, legacy outside markers and quoted type
keys. Full checks include the existing rollback and pending-write suites. These
are service/parser tests, not real Obsidian UI or process-restart acceptance.

Eighteenth-pass validation (2026-09-19): full tests, build, release metadata check
and diff checks passed. Full log: `/private/tmp/mneme-merge-pending-all.log`.
`mergePendingWrites.test.ts` uses the real Manual Card/Concept coordinators and
ApprovedProposalWriter with cloned storage. It fails Card creation before Markdown
or at completion save, Concept creation at completion save, and Inbox updates of a
survivor/Related neighbor at completion save. Blocked preparation preserves full
files/state and performs no writes. Resuming does not repeat already applied
Markdown; completed receipts permit Merge, and the Card ID appears once after
successful Merge. Unrelated pending writes, path normalization, malformed records,
Incoming with an independent pending Card, and receipt acquisition after preview
are also covered. Bundles substituting either service from `83c729f` fail because
preparation incorrectly returns ready. Logs:
`/private/tmp/mneme-merge-pending-conceptMergeService-red.log` and
`/private/tmp/mneme-merge-pending-incomingConceptMergeService-red.log`.
These are in-process fault tests, not real Obsidian restart/platform acceptance.

Seventeenth-pass validation (2026-09-19): full tests, build, release check and diff
checks passed. Full/focused logs: `/private/tmp/mneme-merge-input-all.log` and
`/private/tmp/mneme-merge-input-focused.log`. Old-source bundles failed the changed
Card-link and receipt guards; a bundle restoring only the old identity predicate
failed the body-ID regression. Logs are
`/private/tmp/mneme-merge-input-{cards,receipt,identity}-red.log`. Regressions cover
both Merge participants' changed/removed/added locators; normal alias, quoted key,
comment and CRLF forms with successful execution; valid and malformed receipts
with the original target present/absent; receipt acquisition after preview; body
and code-fence false identities, changed types and duplicate fields. Blocked cases
assert zero writes and complete file/plugin-data preservation. Receipt fixtures
are constructed with matching proposal/content hashes; this suite does not inject
an actual approved-writer crash or perform real Obsidian acceptance.

Sixteenth-pass validation (2026-09-10): `npm run test:all`, `npm run build`,
`npm run check:release -- 1.0.0`, and diff checks passed. Full output:
`/private/tmp/mneme-markdown-uncertain-writes-all.log`; writer-focused output:
`/private/tmp/mneme-markdown-uncertain-writes-focused.log`. The old helper left
`B.md` at `B after` instead of `B before` in the new direct regression:
`/private/tmp/mneme-markdown-transaction-red.log`. Tests cover failures before
transform, after transform but before application, and after application; reverse
rollback, untouched later files, concurrent edits (including content equal to the
planned result), normal state commit/rollback, and unchanged writes. Real service
fixtures cover single-file Incoming and second-file Guided failures with complete
Markdown and plugin-data equality, zero state commits, and learner edits retained
on rollback conflict. These are injected adapter failures within one process,
not crash/restart recovery or real Obsidian acceptance.

Fifteenth-pass validation (2026-09-10): full tests, build, release check and diff
check passed. A final completion-state adjustment also passed the Markdown-writer
suite and build. Full/focused outputs:
`/private/tmp/mneme-guided-merge-lifecycle-all.log` and
`/private/tmp/mneme-guided-merge-lifecycle-focused.log`. The new View suite bundled
with `8c0a112` failed because a confirmation still executed after close; temporary
log: `/private/tmp/mneme-guided-merge-lifecycle-red.log`. Tests cover pair and
same-pair changes, refresh/close while confirming, operation locking, late AI and
inspection, reverse scan completion, close during read/prepare/scan, waiting for
started commits, successful submission guards, and retaining text when a scan
loses the current selection. These are actual View methods with service/DOM
doubles, not real Obsidian or process-termination acceptance.

Fourteenth-pass validation (2026-09-10): full tests, build, release check, and diff
check passed. Full output: `/private/tmp/mneme-conflict-merge-lifecycle-all.log`.
The real View test bundled against `57bdc2f` failed because the previous session's
confirmation still executed; temporary log:
`/private/tmp/mneme-conflict-merge-lifecycle-red.log`. Deterministic barriers cover
session/key/object replacement, duplicate requests while confirming, interleaved
AI, reversed load completion, close during reads/responses/preparation/dialogs,
commit waiting, original-session callbacks, completed-draft retention rules and
save-failure preservation. Tests run the actual confirmation function with a Modal
stub and replace DOM rendering; they do not exercise real Obsidian windows.

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

Fourteenth-pass manual checks in a disposable Vault:

1. Leave Confirm Merge open, reopen the same conflict Merge with a changed incoming revision, then accept the old dialog. It must not write or complete the newer session. Repeated Merge clicks while confirming must produce one request.
2. Start AI drafting, then close or reopen the workspace before the response arrives. The late response must not replace saved/current text. Repeat with slow draft loading and confirm that the latest session wins.
3. Delay an already-confirmed commit and close or switch the workspace. The transition must wait, completion must refresh the original source, and the closed view must not redraw or recreate its completed draft.

Ordinary Guided Merge lifecycle and durable recovery of Incoming/Guided Merge state commits remain separate audit work.

Fifteenth-pass manual checks in a disposable Vault:

1. Open Guided Merge confirmation, then close the workspace or reopen it with another pair. Accepting the old dialog must not execute its plan. Reopening the same pair must also invalidate the old dialog.
2. Start AI drafting/shortlist inspection, then change selection from another entry point. The old response must not replace the new draft, selection or operation state. Refresh with a now-missing Concept and verify authored text remains visible.
3. Delay a confirmed commit and close, refresh or select another pair. The transition must wait for completion, and a closed workspace must not render success. Completed draft controls must not submit the same Merge again.

Incoming/Guided Merge durable completion, rollback behavior and real Obsidian process-restart acceptance remain follow-up work.


Sixteenth-pass manual checks in a disposable Vault with an instrumented adapter:

1. Inject a one-shot error immediately after applying Incoming Merge Markdown, then repeat after the second changed file in Guided Merge. The operation must report failure; all touched files must return to their prior contents, and Proposal/draft/Source state must remain unchanged.
2. Add a learner edit after that write and before rejection. The edit must survive; the error must include the rollback conflict. Inspect the partial result before retrying. These checks require fault injection; terminating Obsidian is a different, still-open recovery scenario.


Seventeenth-pass manual checks in a disposable Vault:

1. Select two Concepts for Merge, externally change/add/remove one Card Group link before requesting preview, and confirm Merge requests a refresh without modifying either group. Refresh the selection and review the new association before retrying.
2. Leave a name-conflict choice open while another window starts an Inbox write that leaves a recovery receipt. Choose Merge from the old conflict UI: preparation must direct the learner back to the Inbox write, preserving its target, payload, evidence and drafts.
3. Change the existing Concept's frontmatter ID or type while retaining its former ID on a line in the body/code fence. Incoming Merge must report an identity change and leave Markdown/state untouched.

Durable Merge intent/completion, process termination, and rollback-conflict recovery
remain open. These guards do not scan for duplicate IDs introduced externally
after selection or coordinate other processes.


Eighteenth-pass manual checks in a disposable Vault with fault injection:

1. Interrupt Manual Card or Concept creation at its completion-state save after Markdown has been written. Guided Merge involving that Concept must request completion first. Resume Creation, then Merge: the Card must appear once with its original ID and the Concept draft must complete normally.
2. Leave a pending Inbox update on the intended survivor or a Related neighbor. Guided Merge must preserve that file and receipt until the Inbox write is completed. An Inbox-origin conflict Merge targeting the same pending Concept file must also stop.
3. Repeat with an unrelated pending target: normal Merge should remain available. Incoming Merge that edits only a Concept should still allow a pending Manual Card in its separate group.

Merge's own durable recovery and other operations' overlap guards remain separate
work; this pass adds no persisted intent or external-process coordination.


Nineteenth-pass manual checks in a disposable Vault:

1. Add custom YAML and notes before, between and after Cards in the source Card Group. Merge into a Concept with its own group. The original path must retain those notes/properties and a redirect; the destination must contain each Card once with its original ID/content.
2. Repeat with an empty source group and CRLF Markdown. Confirm Review does not discover a Card from the retained notes.
3. Duplicate a Card ID within either group, then try Merge. It must refuse before writing. Repeat with legacy section markers outside a Card block and review the explicit repair message.

Non-Card notes remain at the original path. Resolving path-dependent Markdown
references and durable Merge recovery remain separate audits.


Twentieth-pass manual checks in a disposable Vault:

1. Put a relative image, same-file heading/block link or reference-style link in a source Card, then request Merge into a different existing group. The preview must stop and identify the Card and paths without modifying files/state.
2. Replace it with an explicit Wiki link to a fixed third-party note/attachment. Verify both locations resolve to the same file, complete Merge, and compare Review rendering and the unchanged Card ID/content. Repeat by introducing a same-named file after preview so the two locations resolve differently; confirmation must stop.
3. Merge when only the source group exists. Its path and relative references must remain intact. Syntax examples may be conservatively blocked and require manual review.

This pass does not rewrite references, validate every Markdown/plugin construct,
repair incoming backlinks or implement durable Merge recovery.


Twenty-first-pass manual checks in a disposable Vault:

1. Merge two Concepts when the merged-away body contains a relative attachment, same-file anchor or reference definition. Preparation must stop before showing a writable preview and identify the Concept and both paths.
2. Repeat with a stable explicit Wiki target or external URL, then verify the preserved View resolves to the intended resource. Introduce a same-named target after preview; differing resolution must stop confirmation without writes.
3. Merge ordinary newly created Concepts before creating any Cards. Template Card navigation must not block the merge; authored notes in Review Cards must remain in the preserved View. Use four-character fenced examples containing shorter/different fence runs and headings; their text must stay intact.

Next structural audit candidates: extra H1 headings discarded by perspective
extraction, fence handling in other section helpers, native survivor Review Cards
navigation after adopting another group, and custom source Concept YAML retention
in redirects. No real Obsidian rendering/restart acceptance or durable Merge
recovery was added in this pass.


Twenty-second-pass manual checks in a disposable Vault:

1. Add an extra H1 and H2 subsection to the merged-away Concept, merge it, and inspect the preserved View. Both headings and their text must remain nested under Merged from. Repeat with a preamble before the first H1.
2. Leave the survivor's declared Card Group absent while the other Concept has Cards. Complete a normal manual Merge and click the survivor's native Review Cards navigation; it must open the adopted group and agree with frontmatter. Its display alias and authored notes must remain intact.
3. Put matching links in other sections, a subsection, fenced examples and comments. Those links must remain unchanged. Repeat with CRLF content.

Other section parsers and Related preprocessing still need separate fence/comment
review. Setext headings, complex Markdown containers, custom source YAML retention,
real Obsidian acceptance and durable Merge recovery remain outstanding.


Twenty-third-pass manual checks in a disposable Vault:

1. Put Wiki-link examples inside four-character code fences containing shorter runs, HTML comments and inline code under Related Concepts. They must not appear as real relationships or make the note a Merge neighbor.
2. Add one real relationship beside those examples and merge its target. Only the real relation should point to the survivor; example text and other sections must remain unchanged. Repeat with CRLF and a real link plus example on the same line.
3. Add a relation where the insertion point is inside an unclosed fence/comment. The operation must request closure without writing either Concept. A closed Related section before an unrelated unclosed later section should still work.

Path-resolution ambiguity, duplicate Related headings and other section helpers
remain separate audits. The shared inspector does not provide complete Setext,
container/HTML or multiline code-span parsing. Real Obsidian acceptance, custom
source Concept YAML retention and durable Merge recovery remain outstanding.


Twenty-fourth-pass manual checks in a disposable Vault:

1. Keep `Notes/Beta.md` and an unrelated reader linking only to `Missing/Beta`. Merge Beta into Alpha; the reader must remain unchanged and must not count as a rewired neighbor. Repeat with both a real Beta link and the unresolved link; only the real relationship should change.
2. Keep root `Beta.md` and `Archive/Beta.md`. Remove the root relationship or delete the root Concept; a link explicitly targeting `Archive/Beta` must remain. Adding the root relationship must create a separate link.
3. Preserve an unresolved qualified link on the survivor and on the merged-away Concept. Verify it stays unresolved after Merge and does not create a relationship with a same-named file in another directory.

Bare-link ambiguity, relative paths, case collisions and source-context Wiki
resolution remain outstanding, alongside real Obsidian acceptance and durable
Merge recovery. No persisted schema or transaction protocol changed in this pass.


Twenty-fifth-pass manual checks in a disposable Vault:

1. Create `Notes/Beta.md` and `Archive/Beta.md`. Put both `[[Beta|Ambiguous]]` and `[[Notes/Beta]]` under Related Concepts on the survivor or a reader. Merge Notes/Beta into Notes/Alpha: retain the ambiguous spelling and alias, remove the explicit participant link, and add the reader's explicit Alpha relationship.
2. Repeat with two Alpha or Reader files. A bare ambiguous link must not suppress an explicit survivor or neighbor relationship added by Merge.
3. Add `[[Missing/Reader|Authored reader]]` to the source while the survivor has ambiguous `[[Reader]]`. Both authored relationships must remain after Merge; unrelated same-named Concept files must remain unchanged.

Native source-context interpretation and manual relationship/deletion behavior
remain the next audit boundary. The automated tests validate Merge text/state
behavior, not real Obsidian rendering or restart recovery.


Twenty-sixth-pass manual checks in a disposable Vault:

1. Create two Beta Concepts in different directories. From a reader whose bare `[[Beta]]` opens the other file, add/remove a relationship with the selected Beta. Keep the bare link and add/remove only the correct explicit relationship. Verify aliases remain intact.
2. Remove the resolver's target or alter same-name resolution between preparation and execution. A changed cleanup/deduplication decision must stop without writing. An unresolved same-name bare link must request an explicit locator; a root-level addition resolving elsewhere must stop.
3. Delete a Concept when another note contains both a bare link to a different same-named Concept and an explicit link to the deleted Concept. Retain the bare link. Inject an intent-save-after-write failure and Resume Concept Deletion; verify the same result. Repeat after the Related edit applied but process rejected, with resolution unavailable; recovery must recognize afterHash and finish.

No real Obsidian cache/restart acceptance is claimed by these fixtures. Do not
rewrite a conflicting saved deletion hash or use broad fallback matching to force
recovery. Merge's native-resolution audit and durable recovery remain outstanding.


Twenty-seventh-pass manual checks in a disposable Vault:

1. Create root Beta and Archive/Beta Concepts plus a reader whose bare Beta opens Archive/Beta. Refresh Concept Library and open the reader's details/relationship manager: show Archive/Beta, with symmetric navigation from it. A bare link opening an ordinary note must not display an unrelated same-named Concept.
2. Add `[[Missing/Beta]]` to Related Concepts and refresh: it must not create an Archive/Beta relationship. Unresolved bare links also must not be guessed from the Concept list.
3. Add another explicit Beta relationship through the manager, refresh, then remove it. Keep the original bare relationship and alias; the other Concept remains available for addition afterward.

The following Guided Merge fixture identified in pass 27 is automated in pass 28.
The fixture merges `Concepts/Topic.md` while root `Topic.md` is an
ordinary note: Reader's bare Topic must not be rewired when it opens the ordinary
note. Pass 28 also checks source/destination contexts of migrated bare spellings.
Open UI snapshots require refresh after external changes. No native rendering,
cache-freshness or real Obsidian restart acceptance is claimed by these tests.


Twenty-eighth-pass manual checks in a disposable Vault:

1. Merge `Concepts/Topic.md` into `Concepts/Alpha.md` with ordinary `Topic.md` present. A reader's bare Topic opening the ordinary note must remain unchanged; a reader actually opening the merged Concept must be rewired to Alpha.
2. Copy a source bare Related link whose native target differs in the survivor's directory. Preparation must stop. With the same target in both contexts, the copied link must keep its alias and destination. Include an authored `.md` suffix and root-level Concept targets.
3. After preview, change a skipped reader's Related targets or native resolution, change an ordinary target into a Concept, or add a Markdown file. Execution must request a new preview without writing. An ordinary-note body edit alone must survive a successful Merge.

These automated adapter fixtures do not constitute real Obsidian cache/rendering
acceptance. Qualified relative/suffix paths, case collisions, multiple Related
sections, source custom YAML preservation and durable Merge recovery remain work.


Twenty-ninth-pass manual checks in a disposable Vault:

1. Give a source Concept aliases, nested properties, multiline YAML, extra headings and authored notes. Merge it and open its old path: the leading notice must navigate to the survivor, with original properties/body retained below. The old Concept must disappear from Concept Library.
2. Check the survivor's preserved View independently. Historical source Card navigation remains at the old path, while active Cards and FSRS state belong to the survivor as before.
3. Add an existing `redirect_to` field to an active source or edit it after preview. Preparation or execution must stop without discarding its contents. Confirm that cancelling the preview also leaves the original file unchanged.

Real Obsidian rendering/cache acceptance and durable Merge recovery remain pending.
