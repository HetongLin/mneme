# Native Card Review and Creation Recovery — 2026-09-26

Round 36 starts at `06295e6` on `test/native-card-review-recovery`. No product-code
change was needed. This round verifies one actual Good rating and recovery of a
confirmed Manual Card append after a real Obsidian process interruption.

## Setup

- macOS Obsidian 1.13.7; isolated `release-artifacts/Mneme_Release_Candidate`.
- Before testing, plugin/data copied and all 47 existing Markdown files hashed in
  `release-artifacts/card-review-recovery-20260926/` (local, untracked evidence).
- New fixture folder `Card Native Acceptance 20260926/` contains one Concept and
  its declared `Cards.md`. No personal Vault or earlier recording Vault changed.
- Installed bundle matches the repository build, SHA-256
  `6aa7777393d8735456612a9c2ba8de72dcc0a9ed5dcd09ad263daa35380c0da4`.

Official commands open the Concept, Create Card and Concept Library. CLI eval
interacts with actual renderer controls: Card Type/Front/Back, Create Card,
Review Cards, Show Answer, Good, and Resume Creation. No service call substitutes
for the user's creation/rating/resume click. This is DOM-driven acceptance, not
physical keyboard/mouse or screenshot visual acceptance; no provider was called.

## Actual rating

The first Card was authored in Composer as a Definition Card:

- ID `card-6aafvkca`.
- Front: “What connects a Card to its review history?”
- Back: “Its stable Card ID connects it to its review history.”

Creation produced a new Card Group and a written receipt. Concept Library → Review
Cards opened this Concept's manual review session; Show Answer exposed the rating
buttons and Good recorded a real FSRS transition. The completion page showed one
card reviewed and an automatically updated schedule.

The persisted state had reviewCount 1, lastRating `good`, FSRS `Learning`,
learningSteps 1, difficulty 2.11810397 and stability 2.3065. The review timestamp was
`2026-09-26T14:34:28.726Z` and dueAt `2026-09-26T14:44:28.726Z`. Exactly one matching
review event was recorded. The entire state/event objects were compared across
both subsequent process restarts; they remained identical.

An initial harness wait searched for “Card created” rather than the actual
“Created: <id>” completion text and timed out. The Card had successfully been
created. Its written receipt and actual completion page were captured before
rating, and subsequent waits used real button/receipt state. The timeout is not a
product failure or a passed UI wait.

## Pending append and first process restart

A second Definition Card was entered through the same Composer:

- ID allocated by production code: `card-7ngz9bgx`.
- Front: “What must recovery preserve when a Card is already written?”
- Back: “Recovery must preserve the existing Card ID and avoid appending a duplicate Card.”

A test-only `saveData` wrapper held the promise immediately before the second
Card's written-receipt save. The pending intent and draft were already on disk,
and the Card had been appended to the existing group. This is a controlled
completion-before-save interruption, not an exception followed by normal cleanup.

After checking the main executable and renderer-parent relationship, the main
process was terminated with SIGKILL. Obsidian was reopened to the same isolated
Vault. Main/renderer PIDs changed from **75673 / 75679** to **91317 / 91323**.
This was a main-process restart, not the CLI's renderer-only restart command.

Disk and native checks confirmed:

- First Card's exact rating state and one event survived.
- Second Card's pending receipt, draft, ID and target path survived.
- Reopened Create Card showed Resume Creation and disabled draft fields.
- Clicking Resume Creation completed the receipt and rotated the empty draft ID.
- The receipt changed only from pending to written; Cards.md stayed byte-for-byte
  identical to its pre-termination contents.
- Concept Library Review Cards showed exactly two distinct Card IDs, each once.
  No second rating was submitted in that inspection session.

Manual Card creation has no separate Resume command or pending startup Notice in
this build; the tested recovery entry is the reopened Card Composer.

## Completed-state restart and preservation

After completion, another verified SIGKILL/reopen changed main/renderer PIDs to
**91890 / 91894**. The receipt remained written; reopened Composer had an empty form
and Create Card, with no Resume Creation. No completed append or rating replayed.
Both restarts discarded the temporary runtime wrappers.

`verify-final.py` and `final-results.json` in the evidence directory confirm:

- All 47 original Markdown hashes unchanged; exactly two new Markdown files.
- Both Card IDs appear once; exact Card Group bytes preserved across recovery.
- One new review state/event; every pre-existing review state/event preserved.
- Only `manualCardDraftId`, `manualCardWrite`, `reviewStates`, and `reviewEvents`
  differ from the baseline. Settings, other authoring state, source records,
  proposals, Merge records, and unrelated state remain unchanged.
- No pending Manual Card draft; receipt written and draft identity rotated.

Focused Markdown writer (including Manual Card recovery), review-state/concurrency
and FSRS integration-contract suites passed. Build, release metadata/artifact
checks and `git diff --check` passed. Logs are
`/private/tmp/mneme-card-native-{writer,review,fsrs,build,release}.log`.
The previous full-suite result remains separate; this documentation-only round
did not rerun every unrelated suite.

## Remaining work

This covers a successful new-group creation, one actual Good rating, an existing
Card Group append interrupted before completion save, and completed-state restart.
It does not cover all ratings/FSRS phases, scheduled queue eligibility after time
elapses, interrupted rating persistence, new-group creation interrupted before or
after its first write, external edits during recovery, deletion/ID-repair restart
cases, Windows/mobile, sync races, torn writes, or power-loss durability. These
remain separate checks; the complete release checklist is not finished.
