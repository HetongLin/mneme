# Mneme code review and refactoring — 2026-09-05

Updated: 2026-09-06 (third pass)

## Scope and checkpoint

Reviewed the handoff, repository instructions, product contracts, and relevant ADRs before editing. The existing handoff was committed as `83deb3f` (`docs: checkpoint acceptance handoff before code review`) after a successful build. Its parent `9cd98ad` contains the pre-review product code.

Work continued on `refactor/review-transaction-safety`. This audit focused on reviewed Markdown writes, Card append operations, Inbox acceptance, and asynchronous Review View actions. It was not an exhaustive review of every provider, parser, UI surface, or platform.

A second pass on `refactor/state-persistence`, based on documentation checkpoint `0377c60`, addresses shared plugin-state persistence and presentation refresh. It also applies the atomic Markdown contract introduced in the first pass to Source provenance writes.

The third pass on `refactor/approved-write-recovery` starts from committed checkpoint `30bcce7`. It addresses interrupted Inbox writes, receipt retention during reconciliation, and Card Composer lifecycle errors.

The existing `mneme` self-link, `release-artifacts/`, recordings, and acceptance Vaults were preserved. No remote push, publication, version change, or live Vault update was performed.

## Local implementation commits

- `04bc46f` — preserve concurrent edits in reviewed Markdown transactions.
- `4e16141` — append Cards atomically across authoring flows.
- `95cf030` — guard Review actions against duplicate and stale completion.
- `37d3533` — serialize plugin-data mutations, protect Source relink/removal writes, and preserve Review state on diagnostics refresh.
- `3100b9b` — durable Inbox write recovery, atomic completion, and protected reconciliation.
- `5617b23` — Card Composer input/close lifecycle and truthful completion warnings.

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

This protects Card Markdown. It does not make the accompanying proposal-state writes one transaction; see the open findings below.

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

Creation success, draft cleanup, and View refresh have separate outcomes. Cleanup/refresh failures now report that the Card exists rather than claiming its creation failed. The actual View method harness covers input locking, deferred preparation, close during creation, cleanup/refresh errors, and preservation after a failed Card write. Rendering is stubbed, so live Obsidian validation remains outstanding.

## Open findings

### P2 — Manual Card creation and Composer draft cleanup can diverge

Location: `src/views/cardComposerView.ts:createCard` and `persistCurrentDraft`.

The Card is still written before draft cleanup is persisted. If cleanup and subsequent retrying autosaves fail, the Card remains but the saved draft can return after reload, allowing duplicate creation. The third pass fixes misleading creation errors and close-time lifecycle handling, but does not give Manual Card creation a durable receipt. A later successful cleanup can still clear the draft.

A follow-up should coordinate draft completion with Card creation and distinguish a failed Card write from a failed cleanup/refresh. The acceptance test should inject cleanup failure, reload the draft store, and retry.

## Validation

First-pass commands and results:

- `npm run test:all` — passed.
- `npm run build` — passed.
- `npm run check:release -- 1.0.0` — passed.
- `git diff --check` — passed.

No existing test expectation was weakened to conceal a failure. Added test doubles implement the new atomic process contract. Baseline tests passed before refactoring.

Second-pass final validation (2026-09-06): `npm run test:all`, `npm run build`, `npm run check:release -- 1.0.0`, and `git diff --check` all passed. The full suite includes the new plugin-data/settings concurrency tests and Source provenance regressions. Import-time Obsidian test stubs do not run plugin startup, rendering, network requests, or real filesystem writes.

Third-pass final validation (2026-09-06): `npm run test:all`, `npm run build`, `npm run check:release -- 1.0.0`, and `git diff --check` all passed. The Markdown test runner now awaits each exported test promise, including receipt recovery and Composer lifecycle tests, rather than allowing unresolved asynchronous tests to exit successfully.

Focused manual checks still to run in a disposable Vault:

1. Reveal a Card and rapidly repeat a rating; only one review should be stored and only one Card advanced. Repeat with Review Tomorrow, Suspend, and Archive; verify the next Card's buttons work.
2. Trigger a rating, then leave/close the Review View while persistence is delayed; an old completion must not advance a new session.
3. Build a Merge preview, edit an involved Concept/Card Group, then confirm; expect a conflict and preserved edited Markdown. Also check successful Merge and Related add/remove.
4. Append Cards from separate authoring/Inbox entry points to the same existing group; confirm both Cards and any unrelated Markdown survive.
5. Rate Cards in separate Review Views while changing settings or saving a Composer draft. Reload the plugin and confirm that all states remain saved.
6. Reveal an answer, move to a later Card, then toggle `Show advanced diagnostics`; confirm the Card and answer remain visible. Check that `Show Today’s Focus` still applies its scheduling policy.
7. Preview a stale Source relink/removal, edit the Concept, then confirm; expect a conflict and preserved Markdown. Check a normal confirmation and its Source index update as well.
8. In a disposable test environment, inject completion-save failure after accepting a Concept/Card. Reload Mneme, resume the Inbox item, and verify one Concept path/Card ID plus complete provenance. Editing the target before retry should preserve the edit and report a conflict.
9. Start creating a Manual Card and close its Composer while the write is delayed. After success, reopening should show an empty draft when cleanup succeeds. Verify that a cleanup failure warns about the existing Card.

These checks do not replace the handoff's outstanding real-provider, restart, Windows, and mobile publication evidence. The old `9cd98ad` ZIP and recordings remain evidence for their original source revision only.
