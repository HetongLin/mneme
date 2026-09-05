# Mneme code review and refactoring — 2026-09-05

## Scope and checkpoint

Reviewed the handoff, repository instructions, product contracts, and relevant ADRs before editing. The existing handoff was committed as `83deb3f` (`docs: checkpoint acceptance handoff before code review`) after a successful build. Its parent `9cd98ad` contains the pre-review product code.

Work continued on `refactor/review-transaction-safety`. This audit focused on reviewed Markdown writes, Card append operations, Inbox acceptance, and asynchronous Review View actions. It was not an exhaustive review of every provider, parser, UI surface, or platform.

The existing `mneme` self-link, `release-artifacts/`, recordings, and acceptance Vaults were preserved. No remote push, publication, version change, or live Vault update was performed.

## Local implementation commits

- `04bc46f` — preserve concurrent edits in reviewed Markdown transactions.
- `4e16141` — append Cards atomically across authoring flows.
- `95cf030` — guard Review actions against duplicate and stale completion.

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

## Open findings

### P1 — Inbox write retries are not durable or idempotent after persistence failure

Location: `src/services/approvedProposalWriter.ts`, `writeApprovedProposal()` (Markdown writes followed by source indexing and `written` status persistence), and `src/services/inboxAcceptanceWorkflow.ts`.

If Markdown succeeds but a later source-index/status write fails, the file remains while the proposal can become actionable again. A retry may allocate another Concept path or a new random Card ID. The existing `proposal-link-fails` test in `tests/approvedProposalWriter.test.ts` explicitly establishes the partial state: the Concept exists while its Proposal remains approved.

The new atomic Card append prevents content loss, but intentionally does not claim to repair this separate failure-recovery contract. A complete repair needs one approved-write coordinator that controls Markdown plus all affected state, with retry/reload evidence and a recovery policy when rollback itself fails. Adding a local in-memory flag would not survive reload.

### P1 — Independent stores can overwrite concurrent changes to data.json

Location: `src/services/reviewStateStore.ts:recordReview`, `src/services/knowledgeProposalStore.ts:upsertProposals`, the other load/modify/save stores, and Merge persistence callbacks.

These operations independently read a complete plugin-data snapshot and later save a complete replacement. Two operations can read the same snapshot before either saves, and the second save can erase the first update. The View action guard prevents common repeated actions in one View; it does not serialize all stores, multiple View instances, settings saves, or Merge versus another state change.

This is an inspection-confirmed concurrency gap; the current suite does not establish a coordinated global transaction boundary. A follow-up should introduce a shared state-update coordinator across all writers, with deterministic interleaving tests for review + proposal, review + settings, and merge + state updates. Serializing only `saveData()` would still permit stale read/modify snapshots.

### P2 — Manual Card creation and Composer draft cleanup can diverge

Location: `src/views/cardComposerView.ts:createCard` and `persistCurrentDraft`.

The Card is written before draft cleanup is persisted. If cleanup and subsequent retrying autosaves fail, the Card remains but the saved draft can return after reload, allowing duplicate creation. The surrounding catch can also present a failure without making the successful Card write clear. The in-memory fields are reset, and a later successful autosave may clear the draft, so duplication depends on persistent cleanup failure or reload before recovery.

A follow-up should coordinate draft completion with Card creation and distinguish a failed Card write from a failed cleanup/refresh. The acceptance test should inject cleanup failure, reload the draft store, and retry.

### P2 — Changing advanced diagnostics resets an active review session

Location: `src/settings.ts` (`Show advanced diagnostics`) → `src/main.ts:refreshReviewViews` → `src/views/reviewView.ts:refreshCards`/`resetReviewState`.

A presentation toggle performs a full review reload and loses the current position and revealed answer. Preserve the session for presentation-only refreshes while keeping the existing scheduled-review policy for `Show Today’s Focus`. This behavior was identified by tracing the code and was not changed in this patch.

## Validation

Final commands and results are recorded after the implementation review:

- `npm run test:all` — passed.
- `npm run build` — passed.
- `npm run check:release -- 1.0.0` — passed.
- `git diff --check` — passed.

No existing test expectation was weakened to conceal a failure. Added test doubles implement the new atomic process contract. Baseline tests passed before refactoring.

Focused manual checks still to run in a disposable Vault:

1. Reveal a Card and rapidly repeat a rating; only one review should be stored and only one Card advanced. Repeat with Review Tomorrow, Suspend, and Archive; verify the next Card's buttons work.
2. Trigger a rating, then leave/close the Review View while persistence is delayed; an old completion must not advance a new session.
3. Build a Merge preview, edit an involved Concept/Card Group, then confirm; expect a conflict and preserved edited Markdown. Also check successful Merge and Related add/remove.
4. Append Cards from separate authoring/Inbox entry points to the same existing group; confirm both Cards and any unrelated Markdown survive.

These checks do not replace the handoff's outstanding real-provider, restart, Windows, and mobile publication evidence. The old `9cd98ad` ZIP and recordings remain evidence for their original source revision only.
