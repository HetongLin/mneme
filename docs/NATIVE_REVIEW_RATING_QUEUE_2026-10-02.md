# Native Review Rating Queue — 2026-10-02

Round 45 starts at `3622c65` on `test/native-review-rating-queue`.
Acceptance began October 1 and finished October 2 in macOS Obsidian 1.13.7.
The round-44 queue validation fix passed the exercised native cases without
additional product-code changes. The larger fixture also exposed variable scan
latency that remains a performance follow-up.

## Setup and method

Only `release-artifacts/Mneme_Release_Candidate` was modified. Its installed
plugin/data were backed up and all 65 existing Markdown files hashed in
`release-artifacts/native-review-queue-20261001/` (local, untracked).
The prior installed bundle was `a6f5f90cccb97f1b3345a43d18f5b9fa3b754b65e62094d23fa15f793fae0714`.
The newly built and installed bundle is
`f1c9b9823b79b88e044dc0da4ecfc52480d8fa2b70483b98aefe44c334924fd6`.

Three fixtures were added under `Rating Queue Native Acceptance 20261001/`:
Concept.md (`r45-owner`, reviewable, retention 0.87), custom-named Prompts.md
(`r45-one` and `r45-two`), and an ordinary Extra.md note. Custom YAML and prose
outside Card blocks are included. `fixtures.json` stores their exact bytes.

To hold the real shared Store queue, the harness temporarily paused the first
`loadData` call of `clearConceptPauses`. The Vault had no pauses or pending
Concept ID repairs, so releasing this operation returned zero without saving.
The wrapper restored the original load method before waiting. Native Library →
Review Cards → Show Answer → Good clicks then submitted a real rating behind
this operation. The harness confirmed `recordReview` had been called, while
the validation scan, FSRS scheduler, and save had not yet run.

All UI actions used native accessibility controls. CLI diagnostics modified only
new fixtures and observed the actual loader, queue, scheduler, and persistence
methods. The barriers are controlled test instrumentation, not naturally observed
queue contention. No old-bundle native rating was submitted; the old-code failure
comparison remains the preceding round's automated evidence.

## Native blocked and cancelled ratings

Each modification occurred after the native Good click had enqueued its rating:

| Queued change | Result after release | Evidence |
| --- | --- | --- |
| Current Card Back changed | Content/location error; no FSRS or save | queued-back.json |
| Card owner changed | Ownership error; no FSRS or save | queued-owner.json |
| Concept retention 0.87 → 0.81 | Review-settings error; no FSRS or save | queued-retention.json |
| Extra became an uncached duplicate Card group | Ambiguous-identity error; no FSRS or save | queued-duplicate.json |
| Native Back to Concept Library | Cancelled before scanning; no FSRS or save | queued-back-to-library.json |
| Native Review tab close | Detached View; cancelled before scanning; no FSRS or save | queued-close.json |

All six attempts called `recordReview` once but saved nothing. Entire data.json
bytes remained unchanged. The four content/policy cases kept Card index 0 and
the answer visible with “Could not record review”; the two cancellation cases
performed no scan. Returning to Library retained its normal session-reset status;
closing left the detached Review container empty. Each fixture edit was restored.
The duplicate case deliberately returned no metadata cache for Extra.md only;
this does not establish a naturally occurring cache race.

## Larger-Vault timing and successful recovery

A read-only diagnostic probe used the real `recordReview` validation callback
to run the native loader under the Store queue, then deliberately rejected before
FSRS or persistence. A following no-op `clearConceptPauses` operation was enqueued
when validation began. It never completed before validation finished. Neither
probe nor follower changed data.json.

Five probes ran before and after creating 2,000 synthetic ordinary Markdown
notes (8,559,780 bytes total, no additional Cards). Thus Card count remained 20
while the total Markdown count increased from 68 to 2,068.

| Files | Loader scan times (ms) | Following queue-operation completion times (ms) |
| --- | --- | --- |
| 68 | 18.4, 12.4, 11.7, 11.1, 9.3 | 18.9, 12.7, 12.0, 11.5, 9.6 |
| 2,068 | 300.5, 301.8, 265.3, 244.6, 230.0 | 301.0, 302.4, 266.2, 245.0, 230.4 |

After reopening the Concept and revealing its answer, one actual native Good
click was enqueued and released without changing content. This invoked FSRS and
save exactly once, persisted a single state/event for `r45-one`, and rendered
Card 2 of 2 (`r45-two`). The scan took **1,548.1 ms** and release-to-finish took
**1,563.3 ms** (`recovered-rating.json`). The latter includes fixture verification
after the handler finishes and is not a screen-paint latency measurement.

The slower real-rating sample must not be hidden by the faster consecutive probes.
This is a local synthetic-file sample with uncontrolled cache/background workload,
not a cold-I/O benchmark, an isolated hardware comparison, or a latency bound.
The measured queue wait confirms that full scans delay later state operations.
No cause for the observed variability was established in this round.

## Preservation, reload, and validation

After removing per-case wrappers, the plugin was reloaded. Native diagnostics
confirmed both fixture Cards valid, exactly one `r45-one` state/event, and no
runtime wrappers remaining. The global helper was removed. No full application
process restart or interrupted-save recovery was exercised.

The primary-thread final `verify-final.py` run and `final-results.json` confirm:

- All 65 old Markdown hashes unchanged; all three new functional fixtures restored
  byte-for-byte, including their custom YAML and surrounding prose.
- Exactly 2,000 synthetic notes match `benchmark-fixtures.json`; the complete file
  set is exactly 2,068 Markdown files. Synthetic notes remain in the isolated Vault
  for repeatable follow-up measurements.
- Existing review states/events and all other data fields remain unchanged. The
  only additions are the intentional Good state/event for `r45-one`.
- Six native guard/cancellation cases, normal recovery, queue probe serialization,
  reload, and repository/installed plugin file hashes pass.

Build, release checks, Review navigation tests, and documentation diff checks
passed. Logs: `/private/tmp/mneme-native-queue-{build,release,focused}.log`.
The preceding code-change round's full suite remains the full-suite result;
unrelated tests were not repeated for this documentation-only acceptance commit.

Native window focus changed during testing; the active Vault was checked and
isolated windows selected before actions. A stale accessibility reference after
Library refresh was reacquired. These are harness navigation issues, not product
failures. No personal Vault edits or remote push occurred.

Next: instrument scan phases to explain the observed 1.55-second rating scan and
measure representative Card-heavy workloads before changing validation strategy.
External edits after a file read, unknown malformed/unreadable files, interrupted
first-group writes and rating persistence, earlier deletion/repair interruption
points, and cross-platform acceptance remain outside this run.
