# Native Merge Recovery UI Acceptance — 2026-09-24

Round 34 continues from `da38eaf` on `test/native-merge-recovery-ui`.
Native checks ran on September 24; the fix was committed as `183cb1d` and this
report finalized on September 26.
This round verifies actual Obsidian renderer controls and completion pages through
CLI-driven DOM interaction. It also fixes Incoming Merge's residual busy state
when recovery completes while an older UI operation is waiting.

## Environment and evidence

- macOS Obsidian 1.13.7, disposable `Mneme_Release_Candidate` Vault under
  `release-artifacts/`. No personal Vault or previous recording Vault changed.
- Plugin/data backup, the 38 pre-existing Markdown hashes, four initial Guided
  fixtures, captured previews/results, Incoming fault harness, and final checks:
  `release-artifacts/native-recovery-ui-20260924/` (local, untracked).
- Six new Markdown fixtures under `Recovery UI Acceptance 20260924/`: two Guided
  pairs (`OpenView`, `Startup`) and two Incoming targets (`Baseline`, `Fixed`).
- The starting build was round 33. The final installed `main.js` SHA-256 is
  `003b4deb701770d80a3c0fc44639689cd8e15417da745a3649dfdeda10b0e5b1`.
- Renderer PID 75679 / main PID 75673 remained unchanged. Plugin reloads in this
  round are not process restarts. Round 33's separate report records process tests.

The harness sets picker values and dispatches change events, clicks the actual
rendered draft/preview/confirmation buttons, invokes formal Resume commands, and
reads the resulting DOM. It does not substitute a service call for confirmation.
Incoming setup seeds a dedicated test Proposal and uses the production
`openInboxConflictMerge` entry to open its editor; it does not exercise the entire
Inbox navigation/conflict-selection flow. This is not physical mouse, keyboard,
accessibility, or screenshot-based visual acceptance.

## Results

| Scenario | Fault / action | Observed result |
| --- | --- | --- |
| Guided cancel | Actual preview, then Cancel | All four initial fixture contents and `data.json` bytes unchanged; cancellation status shown |
| Guided open view | Throw once after first of two Markdown writes | Pending receipt and Resume instruction shown; original view remains available |
| Guided resume | Formal Resume Guided Merge | Both files equal confirmed final content; original view shows Merge Complete, no draft, `isWorking=false` |
| Guided repeat | Repeat formal Resume command | Same completion page and no extra Markdown process call |
| Guided startup | Reload plugin with another pair pending after first write | Actual notice says “Mneme: A Guided Merge is pending. Run Resume Guided Merge to finish it.” |
| Guided after reload | Formal Resume command | Remaining write completed; both files match confirmation; completion notice recorded |
| Incoming baseline | Reject completion save after Markdown; start controlled delayed AI draft; Resume | Merge Complete rendered, receipt written, but `isWorking=true` before and after old AI settles |
| Incoming fixed | Repeat with new fixture on fixed build | Merge Complete rendered with `isWorking=false`; old AI result does not overwrite page or recreate consumed draft |

Guided confirmation appeared in another active popout while its editor was in a
separate popout. The harness found the real modal across open window documents
and clicked it there. It did not assume the modal belonged to the editor's DOM.

After plugin reload, Guided selection was empty; recovery did not falsely claim
that empty view as the original session. A MutationObserver captured startup and
completion notices from the actual DOM. No claim is made that an in-memory
selection survives a restart.

Incoming `Fixed` initially encountered an empty restored conflict view before the
new active session in `getLeavesOfType()`. A test click could not find a button and
made no write. The harness then selected the view by its exact session key and
continued; the initial diagnostic is retained as
`IncomingFixed-empty-restored-view.json`. Formal recovery left the unmatched empty
view unchanged.

## Fix and regression coverage

`MnemeConceptConflictMergeView.completeRecoveredMerge()` now clears `isWorking`
after validating the receipt's written status, target ID/path, and origin. It
still invalidates the old session revision and cancels queued draft saves.
Guided recovery already performs this cleanup.

Before the fix, an AI operation's old `finally` correctly refused to change a
newer session revision, but no recovery code released its busy flag. This was a
state consistency defect: the completion page still displayed correctly, and a
later `setSession()` resets the flag. We did not establish a blocked new session
or a Markdown/data corruption consequence.

The regression invokes the actual AI-draft method with its Markdown read delayed,
completes recovery, then releases the old operation. It verifies the completion
page, idle flag, and no resurrected draft. It also checks that a mismatched receipt
does not unlock an active operation, and retains the queued-save regression. A
render spy replaces its output so an accidental editor rerender would fail the
test. Removing the cleanup line made the busy-state regression fail.

For native reproduction, the AI provider method was replaced with a controlled
local promise; no external provider request occurred. The delayed result's test
text did not enter Markdown or persistent drafts. Fault/AI hooks were removed by
a final plugin reload.

## Validation and preservation

- `npm run test:all` passed, including the updated recovery regression.
- `npm run build` and `npm run check:release -- 1.0.0` passed.
- Separate TypeScript checking of the changed test and `git diff --check` passed.
- Logs: `/private/tmp/mneme-recovery-ui-{all,build,release,test-types}.log`.
- All 38 original Markdown hashes remained unchanged; all six new final fixture
  contents equal their confirmed results.
- Only three top-level data fields changed: `conceptMergeRecords` (two new Guided
  records; all old records preserved), `guidedConceptMerge`, and
  `incomingConceptMerge`. Settings, original authoring state, proposals, conflict
  drafts, review state/events, and provenance were unchanged at the end.
- Completed test Proposals were removed by ordinary Inbox cleanup. Both terminal
  receipts are written; no pending Merge or journal remains.

## Remaining acceptance

This adds Guided confirmation/cancellation/startup notice and open Guided/Incoming
completion UI evidence. Incoming startup notice and full Inbox/Manual UI entry
paths remain unverified. There was no new process kill/restart, Card rating, Card
creation, deletion or ID-repair restart matrix, real provider content assessment,
Windows/mobile test, torn-write/power-loss test, or synchronization-race test.
Do not mark the complete release checklist as passed.
