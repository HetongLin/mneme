# Native Merge recovery acceptance — 2026-09-24

Environment: macOS, Obsidian 1.13.7, disposable Vault `Mneme_Release_Candidate`.
Branch: `test/native-merge-recovery`, starting at `497dd36`.
Recovery implementation tested: `47fcbd6`; conflict-message fix: `0f7d97d`.

## Isolation and method

The active native window and CLI Vault path were checked before changes. The only
Obsidian renderer observed during process termination belonged to the test Vault.
No personal Vault content or recorded-acceptance Vault was modified.

Evidence is retained under `release-artifacts/native-recovery-20260924/`:

- `plugin-before/`: existing plugin bundle, manifest, styles and data backup.
- `markdown-before.json`: SHA-256 hashes of all pre-existing Markdown.
- `fixtures-before.json`: 17 new files under `Recovery Acceptance 20260924/`.
- `arm-guided.js`, `arm-incoming.js`: guarded, test-only in-memory fault injection.
- Expected writes, pending/completed/conflict results and `final-results.json`.
- `Manual-draft-before.json`: the original test-Vault draft, restored after testing.

Production services ran inside Obsidian against actual `Vault.process`, metadata
cache, plugin storage and disk journals. The harness called service preparation
and confirmation directly with explicitly constructed test inputs; it did not
click through AI, authoring or confirmation UI. Recovery commands were invoked
through the official Obsidian CLI, with additional direct service calls to inspect
returned conflict/not-applied results. Fault hooks existed only in process memory;
no failure injection was added to the shipped bundle.

At the selected boundary, a wrapper awaited the actual file write or intercepted
the upcoming completion save, then returned an unresolved promise. Disk assertions
confirmed the intended pending state before terminating the process. A fresh
process loaded the persisted receipt/journal with no hook present. This tests
termination between completed adapter operations, not torn writes or power loss.

Each Guided fixture has two Concepts, two Card Groups and a Related neighbor
whose bare `[[Beta]]` resolves natively to that fixture's source. Its expected
five-file write set and review state/events were captured before confirmation.
Synthetic Card scheduling values verify preservation; no user rating was simulated
or submitted through the Review UI.

## Observed results

| Scenario | Persisted interruption point | Process boundary | Result |
| --- | --- | --- | --- |
| Guided Partial | One file after; four before; pending receipt and journal | CLI restart changed renderer 76933 → 63261; main remained 772 | Formal Resume command completed all five files exactly; scheduling/events preserved; journal removed. |
| Guided Completion | All five files after; completion save blocked; pending receipt | Main 772 → 63865 | Formal Resume command completed state, with exact file contents and unchanged review data. |
| Guided Conflict | One file after; external sentence added to source Concept; pending receipt | Main 63865 → 64377 | Resume returned conflict and changed no files/state/journal. After preserving evidence and removing only the injected sentence, the formal command completed the reviewed operation. |
| Incoming Inbox | Concept after; Proposal still edited; pending receipt | Main 64377 → 75162 | Formal Resume command recorded completion without rewriting content. The added View text occurs once. Inbox refresh subsequently removed the completed test Proposal. |
| Incoming Manual | Intent saved; Concept still before; test draft retained | Main 75162 → 75673 | Resume returned not-applied and retained the draft; replaying the old confirmation returned conflict and left Markdown unchanged. |

The first CLI `restart` did **not** establish a main-process restart: PID checking
showed only renderer replacement. For the remaining four cases, the observed main
PID was terminated with SIGKILL and Obsidian reopened. SIGTERM had not terminated
the first main process. Reports must not count the first case as a full application
restart. The conflict case supplies partial-write coverage across a main-process
termination as well as the external-edit boundary.

An initial Incoming Inbox smoke operation completed normally before its interruption
hook was corrected to use `plan.receipt.operationId`. That smoke result is retained
separately. The actual restart trial used a new Proposal ID, verified pending state
and its own expected snapshot before termination; it is the trial reported above.

Repeated terminal recovery returned merged for Guided and not-applied for Incoming,
with byte-identical serialized plugin data. Final disk checks found:

- All pre-existing Markdown hashes unchanged.
- Original authoring state, settings, review entries and provenance preserved.
- All three Guided fixtures exactly match their approved after contents.
- Test Card scheduling values and events unchanged across migration/restart.
- No pending Merge operations and no remaining Guided journals.
- The temporary Manual test draft removed by restoring the backed-up original.

The current bundle remains installed only in the disposable test Vault. Its
SHA-256, matching the repository build, is:

`76a0cc986118a09ee04a7050a745495ffcf17b8b18c338dc5e77d1e058baa0b2`

## Defect found and fixed

A pending Guided recovery conflict reused the generic “Rebuild the preview” error.
A pending operation blocks new previews, so that instruction could not be followed.
Commit `0f7d97d` retains the conflict path and formats a recovery-specific message:
current files and snapshots were preserved; review the conflict before resuming.
Pre-intent conflicts retain their existing preview behavior.

The fix was checked against the same native conflict fixture, and it continued to
preserve the complete conflict state. Regression tests assert preservation wording
and the absence of the impossible rebuild-preview instruction. Final validation:
`npm run test:all`, `npm run build`, `npm run check:release -- 1.0.0`, and
`git diff --check` passed. Temporary logs are
`/private/tmp/mneme-native-recovery-{all,build,release,focused}.log`.

## Remaining limits

This is a bounded macOS restart matrix, not full release acceptance. It does not
exercise every Incoming origin/write boundary in the native app, a fresh user
rating through FSRS, all creation/deletion/ID-repair restart cases, UI confirmation
and open-view recovery transitions, provider quality, Windows/mobile, sync races,
filesystem durability or torn journal/data writes. Startup notification rendering
was not captured as an acceptance assertion. These remain separate work; do not
mark the full release checklist complete from these results.

Conflict evidence and original backups remain available. No recovery hash was
edited to force completion, no original user text was removed, and no history was
reset or pushed remotely.
