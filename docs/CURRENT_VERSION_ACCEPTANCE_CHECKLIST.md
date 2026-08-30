# Mneme Current Version Acceptance Checklist

Updated: 2026-08-09
Acceptance target: current working tree (`package.json` remains `1.0.0`)

## Purpose

This is the learner-facing product acceptance checklist for the current Mneme
implementation. It validates whether the complete product works in a real
Obsidian vault, including the changes made after the original v1.0 artifact was
recorded:

- opaque random Concept and Card identities;
- optional English Alias behavior;
- controlled Tag suggestions and reuse;
- direct Manual Concept and Card authorship;
- exact-name conflict handling with zero-write draft Merge;
- two-written-Concept Guided Merge;
- optional FSRS scheduling and low-pressure review controls.

`V1_RELEASE_CHECKLIST.md` remains the publication gate for packaging, clean
installation, restart, macOS, and Windows evidence. Passing this document means
the current product behavior is accepted; it does not by itself approve a
release artifact for distribution.

## Result Convention

Mark every row with one result:

- `[x]` Pass
- `[ ]` Not tested
- `[!]` Fail — create an issue and record reproduction steps
- `[-]` Not applicable — record why

For every failure, record:

| Field | Value |
| --- | --- |
| Severity | P0 data loss/security/core loop; P1 major feature; P2 recoverable UX; P3 cosmetic |
| Vault and platform | |
| Mneme build/commit | |
| Reproduction steps | |
| Expected result | |
| Actual result | |
| Screenshot/log/file path | |

## Exit Rule

Current-version product acceptance passes only when:

- all **P0 Core Gate** checks pass;
- no open P0 or P1 defect remains;
- every other section is completed or has an explicit `Not applicable` reason;
- the automated gate passes from the same source used for manual acceptance;
- plugin reload and full Obsidian restart preserve all approved content and
  state.

Publication readiness additionally requires every remaining item in
`V1_RELEASE_CHECKLIST.md`, including clean artifact installation and Windows
validation.

## Recommended Execution Order

Do not test strictly by document order. Use these rounds so a core failure stops
later dependent work:

1. **Smoke round:** sections 0–3. Stop on any P0 failure.
2. **Current-change round:** sections 8, 10, 11, and 14.2. These cover random
   identities, optional English Alias, Tag control, and zero-write conflict
   Merge.
3. **Full product regression:** sections 4–7, 9, and 12–19.
4. **Persistence round:** section 20 after the vault contains accepted and
   pending data from the earlier rounds.
5. **Distribution round:** section 21 only when preparing a public artifact.

When one check depends on an earlier artifact, reuse the same Concept, Card
Group, Inbox Proposal, or Composer draft rather than manufacturing unrelated
state.

## 0. Acceptance Record

| Field | Value |
| --- | --- |
| Date | |
| Tester | |
| Git commit / working-tree identifier | |
| `package.json` version | `1.0.0` |
| Obsidian version | |
| Mneme installation path | |
| OS | |
| Test vault path | |
| AI provider and model | |
| Scheduled Review | Enabled / Disabled / Both tested |
| Final result | Pass / Fail / Blocked |

## 1. Test Vault and Sample Material

Use a disposable vault. Keep the generated Markdown available as evidence until
acceptance is complete.

- [ ] Install or copy the current `main.js`, `manifest.json`, and `styles.css`.
- [ ] Enable Mneme and confirm the plugin loads without console errors.
- [ ] Create one ordinary English Source Note containing at least three durable
  ideas, one inline formula, one display formula, and headings.
- [ ] Create one ordinary Chinese Source Note containing at least two durable
  ideas and Chinese titles.
- [ ] Create one long Source Note longer than 6,000 characters with important
  ideas near both the beginning and end.
- [ ] Prepare two different Concept candidates with the same Title but different
  Core Meaning for conflict testing.
- [ ] Keep a copy of the vault or use version control so unexpected writes can
  be compared and recovered.

## 2. Automated Gate

Run from the Mneme repository root and attach the terminal output.

- [ ] `npm run test:all` passes.
- [ ] `npm run build` passes.
- [ ] `git diff --check` reports no whitespace errors.
- [ ] `npm run check:release -- 1.0.0` passes if testing a release candidate.
- [ ] The built plugin loads in the disposable vault.

## 3. P0 Core Gate

These checks determine whether Mneme's primary learning loop is complete and
safe enough for further acceptance.

### 3.1 AI-assisted core loop

- [ ] Run `Analyze Current Note` on an ordinary Source Note.
- [ ] Concept suggestions enter Inbox; no Concept Markdown is written before
  learner acceptance.
- [ ] Open one Concept Proposal, edit it, and use `Accept & Next`.
- [ ] The accepted edit—not the original AI text—is written to Concept Markdown.
- [ ] Generate Cards from that written Concept.
- [ ] Card suggestions enter Inbox; no Card block is written before acceptance.
- [ ] Edit and accept at least one Card Proposal.
- [ ] The Card appends to the Concept's canonical Card Group.
- [ ] Start `Review Cards`, use `Show Answer`, then submit one of
  `Again / Hard / Good / Easy`.
- [ ] The rating advances exactly once and survives plugin reload.

### 3.2 Direct-authorship core loop

- [ ] `Create Concept` writes a learner-authored Concept directly without an
  Inbox Proposal.
- [ ] `Create Card` writes a learner-authored Card directly to an approved
  Concept's canonical Card Group without an Inbox Proposal.
- [ ] Both outputs appear in Concept Library and normal Concept Review.
- [ ] Closing and reopening either Composer restores meaningful unsaved draft
  content.

### 3.3 Content ownership and safety

- [ ] Concept content is readable and editable in Concept Markdown.
- [ ] Card Front, Back, and Rubric exist only in Card Group Markdown, not as the
  content source of truth in `data.json`.
- [ ] AI/provider failure never creates partial Concept or Card Markdown.
- [ ] Reloading Mneme and restarting Obsidian do not lose approved Markdown,
  Inbox work, Composer drafts, or FSRS state.
- [ ] No tested cancellation, Back, close, conflict, or failed write silently
  discards learner content.

## 4. Product Scope and Primary Navigation

- [ ] The main product loop is understandable as Source Note → Concept → Card →
  Review → Concept Library.
- [ ] Fixed UI and structural labels are English.
- [ ] The primary product UI contains no Course Context, Exam Mode, Exam
  Attempts, Use Mode, Use Projects, project recommendation, or AI answer grading.
- [ ] Normal browsing, search, organization, and review do not trigger AI calls.
- [ ] Normal Review uses learner self-rating rather than AI grading.
- [ ] Developer commands are hidden when `Developer Tools` is disabled.

## 5. Settings and Provider Behavior

- [ ] Mock, OpenAI, or DeepSeek can be selected according to available setup.
- [ ] Missing credentials produce an actionable Notice and no proposal/write.
- [ ] Invalid provider JSON is rejected and produces no proposal/write.
- [ ] Timeout or HTTP failure is recoverable and produces no partial write.
- [ ] `Analyze Current Note` is an explicit action; Mneme does not scan the vault
  automatically.
- [ ] AI Card Types expose only built-in types and do not force every enabled
  type into the output.
- [ ] Changing settings survives plugin reload.

## 6. Source Analysis and Concept Capture

### 6.1 Grounding and language

- [ ] English Source Notes produce learning prose in English.
- [ ] Chinese Source Notes produce learning prose in Chinese.
- [ ] Every Concept Proposal has visible Source Evidence grounded in the Source
  Note.
- [ ] Multiple independent durable ideas can become multiple Concept Proposals;
  the result is not merely one document summary.
- [ ] An invalid or unsupported AI payload never appears as approved knowledge.

### 6.2 Complete long-note coverage

- [ ] The long Source Note is processed in multiple bounded chunks.
- [ ] Important ideas near both its beginning and end can appear in proposals.
- [ ] The UI never presents a partially processed remainder as complete coverage.
- [ ] Re-running unchanged analysis is skipped or blocked by the source hash.
- [ ] Concurrent duplicate analysis does not create duplicate proposal rounds.
- [ ] Editing meaningful Source content unlocks a new analysis.

### 6.3 Source lifecycle

- [ ] Accepted Concept provenance points to the correct Source Note.
- [ ] Moving or deleting a Source Note never deletes approved Concept knowledge.
- [ ] Missing approved Source provenance becomes stale and visible for
  maintenance.
- [ ] Guided Relink previews and updates the relationship without rewriting
  unrelated learning content.
- [ ] Reviewed Removal removes only the selected stale relationship.

## 7. Inbox Review Gate

- [ ] Inbox summary uses product-facing concepts such as `To Review`, Concept
  Proposals, Card Proposals, and Invalid items.
- [ ] Inbox list items do not offer direct acceptance; acceptance requires
  opening Proposal Review.
- [ ] Proposal Review shows readable structured fields and Source Evidence.
- [ ] Concept Title, Core Meaning, Why It Matters, Learning Mode, Importance, and
  Tags are editable where applicable.
- [ ] AI Card Type is read-only during Proposal Review; Front, Back, and optional
  Rubric remain editable.
- [ ] `Accept & Next` saves current field edits before writing.
- [ ] `Reject & Next` resolves only the selected Proposal and advances correctly.
- [ ] Written and rejected Proposals leave the active Inbox.
- [ ] Malformed proposals are marked invalid and cannot be accepted.
- [ ] Closing Proposal Review leaves the Proposal actionable in Inbox.

## 8. Concept Identity, Title, Alias, and Paths

### 8.1 Opaque identities

- [ ] A newly accepted Concept receives an opaque ID shaped like
  `concept-k7m3p9qx`, not an ID derived from Title.
- [ ] A manually created Concept receives the same class of opaque ID.
- [ ] Renaming Title or moving the Markdown file does not change Concept ID.
- [ ] Existing legacy readable Concept IDs remain valid.
- [ ] A generated ID collision retries with another ID rather than overwriting an
  existing identity.

### 8.2 Optional English Alias

Test once with `Suggest English aliases` disabled and once enabled.

- [ ] The setting defaults off for a fresh installation.
- [ ] When disabled, English Alias is not shown and AI does not need to generate
  it.
- [ ] When enabled, an English/Latin-script Title does not show English Alias.
- [ ] When enabled, a non-Latin Title shows `English Alias (optional)`.
- [ ] A non-Latin Concept can be created or accepted with the alias empty.
- [ ] `Generate with AI` is explicit and sends only Title and Core Meaning.
- [ ] Changing Title clears a stale alias and does not call AI automatically.
- [ ] Alias never controls Concept ID or Markdown path allocation.

### 8.3 Path collision

- [ ] A genuinely separate Concept whose path is occupied keeps its requested
  Title and opaque ID while only its locator becomes `-2`, `-3`, and so on.
- [ ] Existing Concept and Card Group files are never overwritten.
- [ ] The Concept's declared Card Group path remains the authority after Title
  edits.

## 9. Manual Create Concept

- [ ] `Create Concept` opens a dockable Composer and keeps the Source Note
  visible.
- [ ] An ordinary current note initializes Source Note only when no meaningful
  draft already exists.
- [ ] A Mneme Concept/Card file is never selected as the automatic Source Note.
- [ ] `Use Current Note` and `Clear` behave explicitly.
- [ ] Title and Core Meaning are required; Why It Matters is visibly optional.
- [ ] Learning Mode defaults to Reviewable and Importance defaults to Normal.
- [ ] `Cmd/Ctrl+Enter` uses the same guarded write as the button.
- [ ] A source-free Concept omits Source Notes/provenance rather than creating an
  empty or fake source.
- [ ] After successful creation, learning fields clear while the Source Note may
  remain selected.
- [ ] `View Concept` opens the rendered Concept; `Open Concept Markdown` opens
  its source file.

## 10. Tags and Long-term Taxonomy Control

- [ ] AI proposes no more than three broad, stable English lowercase-slug Tags
  per Concept.
- [ ] Generic Tags such as `learning`, `theory`, `model`, `method`, `concept`, or
  `optimal` are not encouraged as standalone categories.
- [ ] Existing exact Tags are reused through the local Tag Catalog.
- [ ] Near-duplicate Tags show a visible `Use existing` suggestion and are not
  silently replaced.
- [ ] Manual Concept creation can search and select existing Tags.
- [ ] Creating a new Tag is explicit.
- [ ] Concept Library search/filter remains usable with approved Tags.
- [ ] Historical user-approved Tags remain valid after reload.

Record any observed near-duplicate or taxonomy-explosion case here:

| New Tag | Existing candidate | Expected handling | Actual handling |
| --- | --- | --- | --- |
| | | | |

## 11. Exact-name Conflict Decisions

Run this section once from an Inbox Concept Proposal and once from Manual Create
Concept.

### 11.1 Conflict comparison

- [ ] `Concept Name Conflict` appears only at the final write gate.
- [ ] Existing Concept and Incoming Concept both show rendered Title and Core
  Meaning.
- [ ] The UI offers `Merge`, `Refine Name`, `Keep Both`, and `Cancel`.

### 11.2 Refine, Cancel, and Keep Both

- [ ] `Refine Name` returns focus to Title and preserves all other source data.
- [ ] Changing Title clears any stale optional English Alias.
- [ ] `Cancel` performs no Concept/Card/provenance write.
- [ ] `Keep Both` is the only decision that may allocate a `-2/-3` path.
- [ ] `Keep Both` creates a separate opaque Concept ID and preserves the original
  Concept unchanged.

### 11.3 Zero-write conflict Merge

- [ ] Choosing `Merge` opens Existing and Incoming content without first
  creating a temporary Concept, Card Group, ID, Redirect Note, or `-2` file.
- [ ] Inbox-origin Merge leaves the Proposal actionable in Inbox until final
  confirmation.
- [ ] Manual-origin Merge leaves all authored data in Create Concept until final
  confirmation.
- [ ] `Back to Conflict Options` returns to the four conflict decisions.
- [ ] Closing the Merge tab/window behaves like Back.
- [ ] Back, Cancel, and close create no Concept Markdown or `-2` path.
- [ ] Editing the Merge draft, closing, and reopening restores the compatible
  draft.
- [ ] `Merge Concepts…` performs no write before opening a compact confirmation
  dialog and states that no duplicate or Redirect Note will be created.
- [ ] Cancel or closing the confirmation dialog returns to the editor without
  writing; only the dialog's `Confirm Merge` action writes.
- [ ] Confirm updates the existing Concept in place and preserves its ID.
- [ ] Inbox confirmation completes the Proposal only after the existing Concept
  write succeeds.
- [ ] Manual confirmation clears the completed Create Concept draft only after
  the existing Concept write succeeds.
- [ ] Incoming Views and Source Notes are preserved on the surviving Concept.
- [ ] A changed Concept, Proposal, Composer draft, or plugin state after preview
  blocks stale confirmation and preserves both sources.
- [ ] A simulated persistence failure rolls back the Concept Markdown and leaves
  the Proposal/Composer draft recoverable.

## 12. Concept Library and Concept Editing

- [ ] Concept Library loads all valid Concepts without requiring AI.
- [ ] Each card shows rendered Title and Core Meaning.
- [ ] Search finds Concept Title and relevant approved metadata.
- [ ] Selecting a Concept opens a rendered editable Concept surface.
- [ ] Reviewable Concepts with valid Cards show `Review Cards`.
- [ ] Concepts without valid Cards show `Generate to Review`.
- [ ] Exploratory Concepts do not offer Card generation or Today’s Focus entry.
- [ ] Edit Concept safely changes Core Meaning, Why It Matters, Learning Mode,
  Importance, Tags, and optional Retention Target.
- [ ] Inline and display MathJax render while editors retain raw Markdown syntax.
- [ ] Concurrent Concept Markdown changes block stale saves.
- [ ] Importance changes priority only and never directly changes Card due dates.
- [ ] Retention Target affects only future normal ratings.

## 13. Related Concepts

- [ ] Add Related Concept writes a symmetric link to both Concept files.
- [ ] Remove Related Concept removes the symmetric link from both files.
- [ ] Related navigation opens the correct Concept.
- [ ] Concurrent edits abort rather than overwriting either file.
- [ ] Related links do not affect FSRS scheduling or create AI calls.

## 14. Card Generation and Manual Create Card

### 14.1 AI Card generation

- [ ] Cards can be generated only from a written Reviewable Concept.
- [ ] Source Notes and Exploratory Concepts cannot directly generate Cards.
- [ ] Existing accepted Card fronts are treated as a Coverage Map.
- [ ] Repeating generation for unchanged assessable content is blocked after a
  successful proposal round, even after its proposals are accepted/rejected.
- [ ] Metadata-only changes do not unlock another round.
- [ ] Meaningful assessable-content or enabled-Card-Type changes can unlock a new
  round after active proposals are resolved.
- [ ] Long Concepts are processed through multiple bounded chunks.
- [ ] When Definition is enabled and missing, the generated set includes one
  grounded Definition Card.

### 14.2 Card identities and Card Group

- [ ] Each new accepted or manually created Card receives an opaque ID shaped
  like `card-gjsl5r2n`.
- [ ] Card ID is independent of Concept ID, Card Type, Front, and Back.
- [ ] Editing Front, Back, or Rubric does not change Card ID.
- [ ] Multiple Cards append to one canonical Card Group per Concept.
- [ ] Existing Card blocks and unrelated Markdown survive append/edit operations.
- [ ] Legacy valid Card IDs remain valid.
- [ ] Historical/tombstoned Card IDs are never reused.

### 14.3 Manual Card Composer

- [ ] `Create Card` requires an approved target Concept.
- [ ] Card Type appears before Front/Back/Rubric and uses a built-in type.
- [ ] Front and Back are required; Rubric is optional.
- [ ] Rubric does not introduce knowledge absent from Back.
- [ ] Draft auto-save and `Cmd/Ctrl+Enter` work.
- [ ] After success, Concept remains selected and content fields clear.

## 15. Review and FSRS

### 15.1 Scheduled Review enabled

- [ ] Today’s Focus contains every eligible due/new Card without secondary daily
  or per-Concept caps.
- [ ] Non-due Cards remain Later and are not promoted by Concept ranking.
- [ ] Review initially shows Front and `Edit / Show Answer / More`.
- [ ] `Show Answer` reveals Back and one row of
  `Again / Hard / Good / Easy`.
- [ ] Each rating changes only the current Card's FSRS state and advances once.
- [ ] Normal Review makes no AI request.
- [ ] The Card body scrolls independently while the action bar remains usable.
- [ ] `Card Info` contains Rubric and technical details without crowding the main
  review surface.

### 15.2 Card controls

- [ ] `Skip for Now` advances without changing FSRS.
- [ ] `Review Tomorrow` defers until the next local day without changing FSRS.
- [ ] `Suspend Card` removes it until explicit resume and preserves history.
- [ ] `Archive Card` preserves Markdown/history and can be restored.
- [ ] `Delete Card` removes only the selected Card block after confirmation.
- [ ] Default deletion preserves anonymous historical review counts and prevents
  ID reuse.
- [ ] `Delete History Too` requires separate confirmation and erases only the
  selected deleted Card's history as specified.

### 15.3 Scheduled Review disabled

- [ ] Today’s Focus and scheduled rating controls are hidden.
- [ ] Existing FSRS state/history remains unchanged.
- [ ] Manual `Review Cards` from Concept Library still performs real self-rated
  Card review and updates memory.
- [ ] Re-enabling Scheduled Review resumes using real elapsed time without
  resetting or shifting stored history.

## 16. Card and Concept Edit Conflict Safety

- [ ] Edit a Card, change that same Card directly in Markdown, then Save; Mneme
  reports conflict and preserves the direct change.
- [ ] Edit one Card while changing a different Card in the same group; both
  changes survive.
- [ ] Editing a Card from an active Review session returns to the same Card and
  preserves reveal state and queue position.
- [ ] Removing/changing the current Card ID while editing reports that the Card
  cannot be restored instead of advancing silently.
- [ ] Concept editing follows the same no-stale-overwrite rule.

## 17. Two-written-Concept Guided Merge

This is distinct from the incoming exact-name conflict Merge in section 11.

- [ ] Select Concept A, Concept B, and the surviving stable identity manually.
- [ ] Both Concept choices show rendered Title and Core Meaning.
- [ ] `Start Manual Draft` works without AI.
- [ ] Optional `Draft with AI` changes only reviewable learning prose fields.
- [ ] `Merge Concepts…` writes nothing before showing the compact impact and
  affected-Markdown confirmation dialog.
- [ ] Confirmed Merge preserves surviving Concept ID.
- [ ] All Card IDs and their FSRS histories survive.
- [ ] Tags, Source Notes, Related links, importance, and learning mode are merged
  deterministically.
- [ ] The removed written Concept becomes a Redirect Note only after confirmation.
- [ ] Missing optional Card Group files do not crash Merge.
- [ ] Concurrent changes abort; partial failures roll back.

## 18. Identity Repair, Malformed Markdown, and Deletion

- [ ] Missing Concept IDs appear in the Identity Repair queue rather than normal
  Library results.
- [ ] Duplicate Concept IDs are isolated and require reviewed repair.
- [ ] Valid legacy Cards missing IDs can receive stable IDs without content loss.
- [ ] Duplicate Card IDs can be repaired one block at a time without guessing
  ambiguous history ownership.
- [ ] A Card missing only FRONT or BACK can use the narrow repair flow.
- [ ] Duplicate markers, malformed wrappers, or unclosed markers do not crash the
  plugin and are not destructively auto-rewritten.
- [ ] Concept deletion has explicit confirmation and removes only intended
  Concept/Card Markdown.
- [ ] Concept deletion preserves anonymous historical review records as designed.

## 19. Export Utilities

- [ ] Anki export produces a readable UTF-8 TSV of independent Card copies.
- [ ] Export does not create synchronization state or mutate Mneme review state.
- [ ] Knowledge Context Pack contains selected/approved Concept knowledge as a
  neutral export.
- [ ] Export does not create Course, Use, Exam, Agent, or project state.
- [ ] Neither export calls AI unless an explicitly documented drafting action is
  selected elsewhere.

## 20. Reload, Restart, and Recovery Matrix

Complete the following matrix after creating real data in the previous sections.

| State before interruption | Plugin reload | Full Obsidian restart | Expected result |
| --- | --- | --- | --- |
| Active Inbox Proposal | [ ] | [ ] | Proposal remains actionable |
| Manual Concept draft | [ ] | [ ] | Draft is restored |
| Manual Card draft | [ ] | [ ] | Draft is restored |
| Conflict Merge draft | [ ] | [ ] | Compatible draft is restored; no write occurred |
| Accepted Concept/Card | [ ] | [ ] | Markdown and Library remain correct |
| Rated FSRS Card | [ ] | [ ] | State/history and next due data persist |
| Deferred/Suspended/Archived Card | [ ] | [ ] | Control state persists |
| Stale Source provenance | [ ] | [ ] | Maintenance state persists without knowledge loss |

## 21. Publication-only Gates

These do not block a current-working-tree product verdict, but they block public
distribution.

- [ ] Build final distribution artifacts from the accepted source.
- [ ] Install into a clean macOS vault using only `main.js`, `styles.css`, and
  `manifest.json`.
- [ ] Repeat the P0 Core Gate using that installed artifact.
- [ ] Install the same artifact in a clean Windows vault.
- [ ] Repeat the P0 Core Gate and path/restart checks on Windows.
- [ ] Verify release metadata and artifact hashes correspond to the accepted
  source rather than the earlier recorded artifact.
- [ ] Complete every remaining checkbox in `V1_RELEASE_CHECKLIST.md`.

## 22. Explicit Non-goals

Do not fail this version for lacking the following. Fail it if these appear as
partially supported primary product modes or silently create competing state:

- Course Context
- Exam Mode or Exam Attempts
- Use Mode or Use Projects
- AI answer grading
- project recommendation/discovery
- automatic vault scanning
- PDF/PPT ingestion
- Anki synchronization
- built-in autonomous learning agent
- full Concept graph or complex Concept split system

## 23. Final Sign-off

| Area | Result | Evidence / issue links |
| --- | --- | --- |
| Automated gate | | |
| P0 core loop | | |
| AI Review Gate | | |
| Direct authorship | | |
| Identity / Alias / Tags | | |
| Conflict handling | | |
| Concept Library | | |
| Cards / Card Group | | |
| Review / FSRS | | |
| Merge / repair / deletion | | |
| Reload / restart | | |
| macOS artifact install | | |
| Windows artifact install | | |
| Product acceptance | Pass / Fail / Blocked | |
| Publication readiness | Pass / Fail / Deferred | |

Tester signature: ____________________
Date: ____________________
