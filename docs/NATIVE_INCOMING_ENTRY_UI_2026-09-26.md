# Native Incoming Merge Entry UI Acceptance — 2026-09-26

Round 35 starts at `dc35abd` on `test/incoming-merge-entry-ui`; fix commit
`74e021b`. It exercises Inbox
and Manual conflict-Merge entry paths, pending startup notification, cancellation,
return/reentry, and recovery completion in macOS Obsidian 1.13.7.

## Method and preservation

The isolated Vault is `release-artifacts/Mneme_Release_Candidate`. Before changes,
its plugin/data were copied and all 44 existing Markdown files hashed into
`release-artifacts/incoming-entry-ui-20260926/`. Test fixtures and recorded DOM,
confirmed plans, fault harness, and final checks live there as untracked evidence.
No personal Vault or older recording Vault was changed.

The official Obsidian CLI opens Inbox/Create Concept and invokes Resume Incoming
Concept Merge. Its eval endpoint drives actual rendered inputs and buttons across
main/popout documents. A synthetic Inbox proposal substitutes for an AI provider
response; opening, acceptance, name-conflict choice and confirmation all use their
real UI handlers. Manual input is entered in the real Composer. No private
`openInboxConflictMerge` or `openManualConflictMerge` call substitutes for entry.
This is DOM-driven acceptance, not physical mouse/keyboard or visual-layout QA.

## Inbox path

1. Open Inbox → Open the dedicated proposal → Accept & Next → Concept Name
   Conflict → Merge. The target keeps its identity and no extra Concept appears.
2. Merge Concepts… → Cancel: target/other Markdown unchanged, proposal and editable
   Merge draft retained. Back to Conflict Options returns to the actual conflict
   modal, whose Merge button creates a new view and restores the saved text.
3. Confirm Merge with a one-shot failure on the written-receipt save: reviewed
   Markdown lands, intent remains pending, proposal remains available.
4. Reload plugin: a DOM MutationObserver captures exactly
   `Mneme: An Incoming Concept Merge is pending. Run Resume Incoming Concept Merge to finish it.`
   Startup keeps the pending receipt/proposal; it does not complete automatically.
5. Formal Resume command completes the receipt and ordinary Inbox refresh removes
   the consumed proposal and conflict draft. Target equals confirmed `after`.

One harness wait initially retained the detached old view after Back to Conflict
Options and timed out. The conflict modal had opened and Merge had succeeded;
re-querying by session key found the new view. Subsequent confirmation used that
new view. This timeout is not reported as a product failure or a passed wait.

## Manual path

1. Create Concept → enter title/Core Meaning → Create Concept → name-conflict
   Merge. The source draft is saved before entering Merge.
2. Cancel preview and Back → Merge preserve the authored text and target Markdown;
   no temporary Concept, redirect, or Card Group is created.
3. Confirm with the same one-shot completion-save failure. The source draft stays
   available while the receipt is pending.
4. Formal Resume updates the open Merge view to Merge Complete, with no busy flag.
   The open Composer switches to an empty draft with a new identity and the status
   `Merged into the existing Concept. Ready to create another Concept.`
   The consumed conflict draft is removed.

The Composer automatically selected the active test Source Note,
`Manual Acceptance/00-手动验收指南.md`. The confirmed Manual operation therefore also
adds its provenance relationship/index for the dedicated target. This is an
expected state change; the Source Note's Markdown bytes remain unchanged.

## Issue found and bounded fix

An unedited Manual draft displayed the changed-input warning on return/reentry.
Each Composer flush refreshes `updatedAt`; the UI restoration fingerprint hashed
that timestamp as part of the entire draft.

The fingerprint now reuses `manualConceptDraftHash`, excluding autosave time and
using the same trimmed fields as Manual creation. Draft identity, content,
metadata, tags, source path, target Concept ID and Source Note content hash still
participate. The actual origin draft retains its timestamp; receipt hashes,
preview snapshots and recovery/write guards are unchanged.

The production entry-method regression checks time-only changes, substantive
fields, identity, target and source changes, normalized whitespace, and preservation
of the actual origin input. An older persisted fingerprint may show the existing
conservative warning once after upgrade; authored text is retained.

## Fixed-build native reentry and final validation

A third fresh target, `Reentry.md`, was tested after installing the fix. Through
Composer → conflict Merge → Cancel preview → Back → Merge, the timestamps changed
but fingerprints stayed equal and the page said
`Saved Merge draft restored. No vault content has changed.`

Returning again, canceling conflict options and editing Composer Core Meaning
changed the fingerprint. Reopening Merge showed the expected changed-input warning
and retained the earlier Merge text. After explicitly combining the old/new text
in the Merge editor and confirming, normal completion succeeded. No fault was
injected in this final scenario, and Source Note was cleared before entry.

The harness initially attempted Create before the cancel handler had finished
updating the button. Its enabled-button guard stopped the click; after waiting for
the actual button to become enabled, the test continued. No extra operation ran.

- Full `npm run test:all`, build and release checks passed. After tightening the
  new test's TypeScript union narrowing and simplifying its harness, its focused
  execution and standalone typecheck passed. Independent review found no blocker.
- Logs: `/private/tmp/mneme-incoming-entry-{all,build,release,focused,test-types}.log`.
- All 44 original Markdown hashes are unchanged. Exactly three test Markdown files
  were added; their final bytes equal the confirmed plans, with no extra files.
- Final data differs only in `incomingConceptMerge`, `manualConceptDraftId`,
  `conceptSourceLinks`, and `sourceAnalysisRecords`. One link and one analysis
  index were added for the automatically selected test Source Note; all older
  source records, settings, review state/events, proposals and other state remain
  unchanged. Manual drafts were consumed normally and identities rotated; the
  final empty draft without a source was cleared on close.
- No pending Merge or Guided journal remains. Final plugin reload removed the
  temporary service wrappers. This reload did not restart the app process.
- Installed `main.js` equals the repository build, SHA-256
  `6aa7777393d8735456612a9c2ba8de72dcc0a9ed5dcd09ad263daa35380c0da4`.

## Scope limits

Plugin reloads here are not process restarts. This round makes no claim about new
process-kill coverage, real provider quality, Card ratings/creation/deletion/ID
repair, Windows/mobile, power loss, torn writes or synchronization races. The
Incoming service interruption matrix and prior native process evidence remain
separate reports. The full release checklist remains incomplete.
