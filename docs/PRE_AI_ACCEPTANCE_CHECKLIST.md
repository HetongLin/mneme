# Mneme Pre-AI Acceptance Checklist

## Scope

This validates:

- Source Analysis
- Inbox proposal acceptance lifecycle
- Proposal Detail editing
- explicit Concept/Card acceptance
- readable/identifiable `Concept.md`
- parser-compatible Card Group Markdown
- ConceptSourceLink indexing
- Concept Library scanning
- Review/FSRS regression

This does not validate:

- AI concept extraction quality
- AI card generation quality
- duplicate detection by AI
- API key handling
- real model/token behavior

## Setup

1. Reload/enable Mneme.
2. Confirm Git is clean except the known untracked `mneme` symlink.
3. Open Mneme settings and enable Developer Tools.
4. Reload Mneme if command palette visibility does not update immediately.
5. Run test commands if desired.

## Acceptance Flow

1. Run `Mneme: Create Pre-AI Acceptance Fixture`.
2. Open the generated source note.
3. Run `Mneme: Analyze Current Note`.
4. Run `Mneme: Open Inbox`.
5. Confirm only the Concept proposal appears initially.
6. Confirm Inbox summary uses `To Review`, `Concept Proposals`, `Card Proposals`, and `Invalid`.
7. Confirm lifecycle counters such as approved, rejected, stale, and written are not primary Inbox UI.
8. Review the concept proposal.
9. Confirm payload is readable and editable.
10. Make a small edit without looking for a separate save action.
11. Click `Accept & Next` and confirm the edit is auto-saved into the accepted Concept.
12. Open generated `Concept.md`.
13. Confirm `Concept.md` is readable and has minimal frontmatter.
14. Run `Mneme: Generate Pre-AI Acceptance Cards`.
15. Run `Mneme: Open Inbox`.
16. Confirm the Card proposal now appears under Card Proposals.
17. Review the card proposal.
18. Click `Accept & Next`.
19. Open generated `Cards.md`.
20. Confirm the Card Group links back to `Concept.md` and remains parseable.
21. Run `Mneme: Log Concept-Source Links`.
22. Run `Mneme: Log Source Analysis State`.
23. Run `Mneme: Open Concept Library`.
24. Search for `Pre-AI Acceptance Pipeline`.
25. Open Concept from Concept Library.
26. Open Cards from Concept Library if `cardsPath` exists.
27. Open Review View and confirm Daily Review behavior is unchanged.

## Concept Retention Policy

1. In Concept Library, open `More` → `Edit Concept` for a reviewable Concept.
2. Confirm blank `Retention Target` identifies the current global value through its placeholder.
3. Enter `0.94`, save, and confirm `retention_target: 0.94` appears in Concept frontmatter.
4. Open Review and confirm Details reports `Retention Target: 0.94 (Concept override)`.
5. Rate one Card and confirm the normal FSRS review advances once.
6. Reopen Edit Concept, clear Retention Target, and save.
7. Confirm the frontmatter field is removed and Review Details reports the global target.
8. Confirm changing Importance never adds or changes `retention_target` and changing Retention Target does not immediately change an existing Card due date.

## Card Edit Conflict Safety

1. Open a Card in Edit Card and leave the editor open.
2. Change that Card's Back directly in its Card Group Markdown.
3. Return to Edit Card and save; confirm Mneme reports a conflict and preserves the direct Markdown change.
4. Reopen Edit Card, then change a different Card in the same Card Group directly.
5. Save the selected Card and confirm both edits survive.

## Pass Criteria

Pass:

- fixture source note exists
- initial fixture creates only the Concept proposal
- Card proposal can only be generated after `Concept.md` exists
- Card proposal references the written Concept
- Developer Tools hides fixture and logging commands when disabled
- Inbox main summary stays product-facing
- Concept and Card approval remain separate
- invalid JSON is rejected
- valid edited payload can be saved
- `Accept & Next` creates readable `Concept.md`
- `Accept & Next` appends parser-compatible Card Group content
- accepted proposals move out of Active Inbox
- rejected proposals move out of Active Inbox
- Inbox Refresh removes stale proposals whose source note was deleted
- `Mneme: Resync Mneme Index` removes stale plugin index state without deleting Markdown
- concept-source link is indexed after Concept write
- Concept Library shows the Concept
- deleted `Concept.md` files disappear from Concept Library after refresh
- stale approved Source links appear in Concept Library and require a reviewed Guided Relink
- Guided Relink preserves relation/evidence and does not mark the replacement as AI-captured
- Reviewed Removal deletes only the selected stale relation and preserves shared Source entries
- Review View behavior is unchanged

Fail:

- proposal bypasses approval
- initial fixture creates a Card proposal before the Concept is written
- proposal writes Markdown without an explicit Review Gate `Accept & Next`
- `Concept.md` shows raw `sourceHash`, `proposalId`, `fsrsState`, `dueAt`, `stability`, `difficulty`, or raw JSON
- Card Group Markdown contains FSRS state
- index reconciliation deletes generated `Concept.md` or Card Group Markdown
- deleted source notes leave stale proposals visible after Inbox Refresh
- deleted `Concept.md` files remain visible after Concept Library refresh
- Concept Library cannot find the generated Concept
- Review View breaks or Daily Review behavior changes

## Cleanup

The fixture creates files under:

```text
Mneme/Acceptance/
```

Mneme does not automatically delete these files. Remove them manually only when you no longer need the validation fixture.

## Acceptance Run — 2026-08-24

Environment: macOS, vault `Mneme_ob`, Obsidian 1.13.6 followed by a full restart into 1.13.7.

Passed in the current build:

- Developer Tools commands appear after Mneme is reloaded.
- The fixture Source Note is created under `Mneme/Acceptance/Source Notes/`.
- Source Analysis indexes the note locally with AI Capture disabled; the original AI Capture setting is restored afterward.
- Inbox shows product-facing `To Review`, `Concept Proposals`, `Card Proposals`, and `Invalid` counters.
- The fixture starts with a Concept proposal and no Card proposal.
- Concept fields are readable and editable; `Accept & Next` auto-saves the edit and writes readable Concept Markdown with minimal frontmatter.
- Card generation remains a separate action after the Concept exists; `Accept & Next` writes parser-compatible Card Group Markdown.
- `Scan Card Files` reported 3 valid files and 0 invalid files during the run.
- Concept Library finds `Pre-AI Acceptance Pipeline`, renders its edited Core Meaning, and exposes `Review Cards`.
- Review displays the accepted Card, accepts a `Good` rating, and persists one FSRS review event/state.
- Concept Retention Policy passed end to end: the blank editor showed `Global 0.90`; a `0.94` override was written to frontmatter and reported as `0.94 · Concept`; one `Good` rating advanced the Card exactly once (`reviewCount` 1 → 2); clearing the override removed the field and diagnostics reported `Retention Target: 0.90 (global)`.
- Retention and Importance remained isolated: setting or clearing the retention override did not immediately change the existing due date, and changing Importance from Normal to High and back did not add a retention override or change the due date. The temporary advanced-diagnostics setting was restored afterward.
- Card Edit Conflict Safety passed with a two-Card acceptance group. A direct Markdown change to the same open Card caused `Card changed while the editor was open` and was preserved. A direct change to the other Card in the same group did not block saving the selected Card; both edits survived and the existing review schedule was unchanged.
- Source provenance maintenance passed with two approved relations sharing the acceptance Source. After the Source Note was renamed, index resync exposed both as stale. Guided Relink previewed the old/new paths and one readable-link replacement, then preserved the selected relation/hash/evidence as approved without creating an AI-analysis record. Reviewed Removal deleted only the sibling relation and readable entry; the relinked Concept and its Source entry remained intact.
- A Mneme disable/enable reload preserves Concept Markdown, Card Markdown, settings, and review state.
- A complete Obsidian quit/relaunch preserves the same files and state; Library and Review remain available after restart.
- A post-fix Source Link regression Concept written immediately after creation retained an approved `conceptSourceLinks` record with the analyzed Source hash.
- `npm run build`, `npm run test:all`, `npm run check:release -- 1.0.0`, and `git diff --check` pass.

Issues found and fixed during the run:

- Concept scanning now falls back to the just-written Markdown frontmatter while Obsidian's metadata cache is still catching up. This prevents an immediate Inbox refresh from discarding the new Concept's Source Link.
- Card ID replacement now normalizes the start marker to exactly one `id` attribute.

Run artifact note:

- The first `Pre-AI Acceptance Pipeline` Concept was written before the Source Link cache-race fix and remains in the disposable acceptance vault as evidence of that failure. The post-fix regression Concept verifies the corrected behavior; the original artifact was not silently rewritten.

Still requires a separate manual/platform pass:

- Windows real-vault core loop.
- clean install using only `main.js`, `styles.css`, and `manifest.json`.

## End-to-End Scenario Acceptance — 2026-08-25

Environment: macOS, vault `Mneme_ob`, Obsidian 1.13.7, real DeepSeek-backed AI Capture and Card Generation.

Scenario source: `E2E Acceptance - Adaptive Learning.md`, containing mixed Chinese and English material about adaptive learning, spaced repetition, retrieval practice, opaque IDs, duplicate handling, and tag governance.

Passed in the current build:

- AI Capture produced six editable Concept proposals from the stable source path.
- With `Suggest English aliases` disabled, Proposal Review did not show an English Alias field. With it enabled, a non-English title showed `English Alias (optional)`, while an English title did not show the field. The setting was restored to disabled after the check.
- Approving the edited proposal wrote one readable Concept at `Mneme/Concepts/E2E-自适应学习.md`, with opaque ID `concept-ywzf9xrw`, no `english_alias`, two reusable tags, and an approved Source relation.
- Concept Library found `E2E 自适应学习` and rendered its title and Core Meaning after both refresh and full Obsidian restart.
- Generate to Review produced three Card proposals. Approving one definition Card wrote parser-compatible Card Group Markdown at `Mneme/Cards/E2E-自适应学习/Cards.md` with opaque ID `card-hbkp8tkf` and no FSRS state in Markdown.
- Review found the accepted Card after refresh. Rating it `Good` created one FSRS event with `reviewCount: 1`, `lastRating: good`, and state `Learning`.
- After a complete Obsidian quit/relaunch, Concept Library still found the Concept and Review showed the same Card as `Reviewed 1 time`; the Concept ID, Card ID, Markdown files, and review state persisted.
- Standalone Merge Concepts was closed before confirmation. Both source Concept hashes remained unchanged and no additional duplicate path was created.
- Incoming name-conflict Merge rendered both Existing and Incoming titles and Core Meanings. `Back to Conflict Options` returned to the decision modal; closing the merge tab behaved like Back, preserved the proposal in Inbox, and wrote neither a merge nor a `-2` duplicate.
- Reopening the incoming merge restored its saved draft without changing vault content.
- Manual Create Concept retained its title, Core Meaning, Why It Matters, and Source after switching pages, closing the Composer tab, and reopening the command. No Concept Markdown was written before explicit creation.
- The accepted Concept used two tags, providing a real-vault check that AI output stayed within a small reusable tag set rather than creating an unbounded taxonomy.
- Card scan reported 5 valid files and 0 invalid files after restart.
- `npm run test:all`, `npm run build`, `npm run check:release -- 1.0.0`, and `git diff --check` pass after the scenario.

Follow-up implemented after the run:

- AI Capture now performs a final Source identity/content check before committing proposals. A pure rename migrates the Source record and remaps the generated proposal/source-link paths. A concurrent edit marks the current Source record stale and discards the outdated response; deletion removes the old record. None of these invalidation paths writes proposals.
- Concept generation uses an in-memory key tied to the same Obsidian `TFile`, so renaming a note cannot start a duplicate request under a new path.
- Analyze Current Note and Card Generation now share persistent operation feedback: a stage Notice and an accessible status-bar item move through preparation, AI request, validation, and saving, then clean up in `finally` on success or failure.
- Unit coverage verifies pure rename, rename plus content change, deletion, duplicate generation after rename, path migration, progress stages, and non-persistent Source analysis preparation.
- An apparent checkbox-state mismatch seen through macOS accessibility output could not be reproduced after restart. The persisted setting and actual alias-field behavior agreed, so this is recorded as an automation-tool observation, not a confirmed Mneme defect.

Result:

- The macOS end-to-end learning loop passes: Source → AI proposals → explicit Concept approval → Concept Library → Card generation/approval → Review/FSRS → restart recovery.
- Merge rollback, Inbox retention, conditional English Alias UI, and manual draft retention pass.
- Release-wide acceptance is not yet complete until the existing Windows real-vault and clean three-artifact install passes are performed.
