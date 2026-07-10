# Tasks

## Rule

Each task should be small, testable, and scoped.

Codex should not implement future roadmap features unless the task explicitly asks for them.

## Task 001: Clean Plugin Skeleton

Goal:

Make the sample plugin identity cleanly represent Mneme.

Acceptance criteria:

- manifest.json uses id: mneme
- package.json uses name: mneme
- npm run dev succeeds
- npm run build succeeds
- No unrelated feature implementation

## Task 002: Create Project Structure

Goal:

Create stable source folders under src/.

Suggested folders:

- src/models
- src/services
- src/views
- src/modals
- src/utils

Acceptance criteria:

- Folder structure exists
- main.ts remains small
- No feature logic implemented yet

## Task 003: Card Marker Parser

Goal:

Implement a parser for Card.md MNEME markers.

Requirements:

- Parse FRONT
- Parse BACK
- Parse RUBRIC
- Return structured result
- Return validation errors for missing FRONT or BACK
- Do not throw on malformed input

Acceptance criteria:

- Valid card parses correctly
- Missing FRONT returns error
- Missing BACK returns error
- Extra Markdown outside markers is ignored
- Invalid card does not crash

## Task 004: Static Review View

Goal:

Implement a Review View using one hardcoded card.

Requirements:

- Open Review View command
- Show Front
- Show Answer button
- Show Back and Rubric after clicking Show Answer
- Show Again / Hard / Good / Easy after answer is revealed

Acceptance criteria:

- Review View opens
- Front is visible initially
- Back is hidden initially
- Back appears after Show Answer
- Rating buttons appear only after Show Answer

## Task 005: Read Card.md from Vault

Goal:

Load a Card.md file from the vault and render it in Review View.

Requirements:

- Read Markdown file using Obsidian Vault API
- Parse frontmatter and markers
- Render Front / Back / Rubric
- Handle invalid cards safely

Acceptance criteria:

- Valid Card.md renders
- Invalid Card.md shows error state
- UI does not crash

## Task 006: FSRS Service

Goal:

Add FSRS scheduling for cards.

Requirements:

- Initialize card review state
- Apply Again / Hard / Good / Easy rating
- Persist review state in data.json
- Query due cards

Acceptance criteria:

- Rating updates state
- State persists after plugin reload
- Due cards can be queried
- FSRS state belongs to Cards, not Concepts

## Task 007: Concept Grouping

Goal:

Group due cards by concept_id.

Requirements:

- Read concept_id from card frontmatter
- Group due cards by concept
- Display Today’s Focus as concepts first

Acceptance criteria:

- Due cards are grouped by Concept
- UI shows Concept title/header
- UI does not emphasize overdue debt

## Task 008: Edit Card Modal

Goal:

Allow users to edit Card.md marker content.

Requirements:

- Edit Front
- Edit Back
- Edit Rubric
- Save back to Card.md
- Do not update FSRS state when editing

Acceptance criteria:

- Edited content is written to Card.md
- Review View refreshes after save
- Broken marker format is handled safely

## Task 009: Source Hash Service

Goal:

Skip unchanged Source Notes before AI analysis.

Requirements:

- Compute hash of current note
- Store lastAnalyzedHash in data.json
- Skip if unchanged
- Allow Analyze Anyway later

Acceptance criteria:

- Changed note is detected
- Unchanged note is skipped
- No token-costly AI call for unchanged notes

## Task 010: ConceptSuggestion Schema

Goal:

Define Zod schema for AI Concept Suggestions.

Requirements:

- New Concept
- Update Existing Concept
- Possible Duplicate
- Ignore
- Source references
- No Card payloads in initial Source Note analysis

Acceptance criteria:

- Valid JSON passes
- Invalid JSON fails with useful errors
- No Markdown is written before user approval
- Initial Source Note analysis cannot create Card proposals

## Task 011: Inbox MVP

Goal:

Show pending Concept Suggestions for approval.

Requirements:

- Display suggestion type
- Display concept title
- Display source excerpt
- Display Concept-stage meaning, evidence, and readiness
- Actions: Accept, Edit, Reject

Acceptance criteria:

- User can accept suggestion
- User can reject suggestion
- Accepted Concept suggestions can create or update `Concept.md`
- Card proposals are reviewed later after a separate Generate Cards action from a written Concept
- Rejected suggestion is not committed

## Task 012: Proposal Markdown Writers

Goal:

Generate Markdown files only from approved proposal types.

Requirements:

- Accepted Concept proposals write `Concept.md`.
- Accepted Card proposals write `Card.md` only after the separate Card-generation flow.
- Use stable frontmatter
- Use MNEME markers for cards
- Initialize FSRS state only for accepted active Cards with explicit stable Card IDs

Acceptance criteria:

- Files are created in configured folders
- Card parser can parse generated Card.md
- Concept.md remains human-editable
- Initial Source Note analysis cannot bypass the Concept-first approval flow by writing Cards

## Task 027: Analyze Current Note to AI Concept Proposals

Goal:

Connect Source Note analysis to the approved AI proposal boundary without bypassing Inbox.

Requirements:

- Keep source indexing when AI Capture is disabled
- Skip provider calls only when the current source hash was already captured
- Send concise existing Concept summaries to the selected provider
- Validate and normalize all provider output
- Accept Concept-stage proposals only
- Store valid proposals as active Inbox items
- Never generate Cards or write Markdown from this command

Acceptance criteria:

- Mock capture creates deterministic Concept proposals
- Invalid provider configuration creates no proposals
- Unchanged captured notes make no provider call
- Previously indexed but uncaptured notes can still run their first capture
- Card-stage and source-mismatched responses are rejected

## Task 028: Generate Card Proposals from Written Concept

Goal:

Complete the missing bridge from an approved `Concept.md` to reviewable Card proposals.

Requirements:

- Run only from a written Mneme Concept
- Use the selected Mock, OpenAI, or DeepSeek provider
- Accept only `new_card` output in the first Card-generation slice
- Validate and normalize every response
- Add Card proposals to Inbox without writing Markdown
- Skip a repeated request while matching active Card proposals are already in Inbox

Acceptance criteria:

- Mock generation creates deterministic Card proposals
- Concept-stage output is rejected in Card-generation mode
- Invalid provider configuration creates no proposals
- Accept Card remains the only action that writes `Card.md`
- Review and FSRS behavior remain unchanged

## Task 029: Review Navigation Actions

Goal:

Let students continue a review without forced scoring and return to the learning source when needed.

Requirements:

- Add Skip before and after answer reveal
- Skip advances to the next Card without updating FSRS
- Add View Source before and after answer reveal
- Resolve the first Source Note link from the written Concept
- Fall back to opening Concept.md when no Source Note can be resolved
- Show reviewed and skipped counts separately at completion

Acceptance criteria:

- Skip never calls the review-state writer
- View Source opens the Source Note when available
- Missing Source Note navigation does not break the review
- Existing rating behavior remains unchanged

## Task 030: Edit Current Review Card

Goal:

Allow a student to repair or improve Card content while reviewing without changing its schedule.

Requirements:

- Edit Front, Back, and Rubric from Review View
- Update only the selected Card block in a multi-Card file
- Re-read the latest Card.md before saving
- Validate marker structure before writing
- Keep FSRS state unchanged
- Refresh Review View after save

Acceptance criteria:

- Single-card and multi-card files update safely
- Missing Rubric markers can be added
- Empty Front or Back is rejected
- Other Card blocks and surrounding Markdown remain unchanged
- Saving never records a review rating

## Task 031: Generate Cards from Concept Library

Goal:

Make the Concept-to-Card bridge discoverable where students browse learned Concepts.

Requirements:

- Add Generate Cards to reviewable Concept Library items
- Reuse the same validated Card-generation service as the command
- Do not show the action for exploratory Concepts
- Keep the command available for the current Concept
- Reject Card generation when Concept frontmatter is exploratory

Acceptance criteria:

- Reviewable and legacy Concepts can generate Card proposals
- Exploratory Concepts cannot generate Cards
- Generated proposals still enter Inbox and require acceptance

## Task 032: Accept Add View Proposals

Goal:

Let a student approve an AI-proposed perspective and append it to an existing written Concept.

Requirements:

- Show `Accept View` for valid `add_view` proposals in Inbox
- Resolve the target Concept by its stable Mneme concept id
- Append the approved content under `## Views`
- Preserve every other Concept section
- Treat an identical existing View as an idempotent successful retry
- Reject same-title Views with different content instead of overwriting the student's note

Acceptance criteria:

- No Concept Markdown changes before explicit acceptance
- Acceptance updates only the resolved Concept file
- Missing or duplicate Concept ids fail safely
- Conflicting View content is never overwritten
- Successful proposals leave the active Inbox queue as `written`

## Task 033: Accept Existing Concept Source Links

Goal:

Let a student approve AI evidence that an existing Concept is supported by the current Source Note.

Requirements:

- Show `Accept Source Link` for `link_existing_concept` proposals
- Resolve the target Concept by stable Mneme concept id
- Append a readable Obsidian link under `## Source Notes`
- Persist the approved many-to-many Concept-source index record
- Update the Source Note analysis record when it exists
- Make repeated acceptance idempotent

Acceptance criteria:

- No Markdown or index changes before explicit acceptance
- The source path, relation type, and evidence remain traceable
- An existing Markdown source link is not duplicated
- Missing or duplicate Concept ids fail safely
- Successful proposals leave the active Inbox queue as `written`

## Task 034: Preserve Add View Provenance

Goal:

Keep every approved Concept View traceable to the Source Note that supported it.

Requirements:

- Derive a supporting Concept-source link from `add_view` source metadata
- Write the View and Source Note reference in one Concept Markdown update
- Persist evidence and source hash in the runtime link index
- Update the Source Note analysis record when present
- Keep retries idempotent across Markdown and plugin state

Acceptance criteria:

- A sourced View appears under `## Views` and its note under `## Source Notes`
- The approved runtime link uses the target Concept id
- Views without source metadata remain valid
- No source reference is duplicated on retry

## Task 035: Accept Existing Concept Updates

Goal:

Let students approve targeted AI improvements to a written Concept without replacing the whole note.

Requirements:

- Show `Accept Update` for valid `update_concept` proposals
- Provide structured editing for proposed Core Meaning and Why It Matters
- Resolve the target by stable Mneme concept id
- Replace only the approved `## Core Meaning` and `## Why It Matters` sections
- Append proposed Views and Source Notes through the existing safe writers
- Persist approved provenance links and keep retries idempotent

Acceptance criteria:

- At least one proposed change is required
- Unrelated Concept sections and custom Markdown remain intact
- Invalid Views or Source Links are rejected before writing
- Missing or duplicate target Concept ids fail safely
- Successful proposals become `written` and leave the active Inbox queue

## Task 036: Basic Concept Edit Modal

Goal:

Give students a concise way to maintain a written Concept from Concept Library without exposing plugin internals.

Requirements:

- Add `Edit Concept` to each Concept Library item
- Edit Core Meaning and Why It Matters
- Edit learning mode and importance through constrained selectors
- Re-read the latest Concept before saving
- Preserve frontmatter identity, custom fields, Views, Cards, Sources, and unrelated Markdown
- Detect targeted-field changes made while the modal is open and refuse a stale overwrite

Acceptance criteria:

- Core Meaning cannot be saved empty
- Why It Matters may be cleared intentionally
- Unspecified learning mode or importance removes only that optional field
- External changes to edited sections or metadata produce a conflict notice
- Editing a Concept never changes Card or FSRS state

## Task 037: Bounded Today’s Focus

Goal:

Make daily review feel like a chosen focus instead of an unlimited debt queue.

Requirements:

- Add configurable daily Concept, daily Card, and Cards-per-Concept limits
- Apply limits after Concept priority ranking
- Prefer due Cards before new Cards within a Concept
- Count distinct Cards and Concepts already reviewed on the current local day
- Keep cards outside the focus available later without changing FSRS state or due dates
- Keep the complete queue visible only through Advanced Diagnostics

Acceptance criteria:

- Refreshing cannot reset the same day’s consumed limits
- Today’s Focus never exceeds any configured limit
- Reviewed-today Cards are not selected again
- Hidden Cards remain unchanged in review state
- Primary summary uses low-pressure focus language rather than overdue debt language

## Task 038: Review Later

Goal:

Let a student remove a Card from Today’s Focus without rating it or changing its memory schedule.

Requirements:

- Add `Review Later` before and after answer reveal
- Persist a Card deferral separately from FSRS review state
- Resume automatically at the next local-day boundary
- Exclude active deferrals from Today’s Focus across refresh and plugin reload
- Keep deferred Cards visible in Advanced Diagnostics
- Clear a Card deferral if the Card is subsequently rated

Acceptance criteria:

- Review Later never invokes the scheduler
- Due date, stability, difficulty, review count, and lapse count remain unchanged
- The current review advances after a successful deferral
- A failed persistence write leaves the current Card in place
- The Card becomes eligible again when the deferral expires

## Task 039: Pause Concept

Goal:

Let a student remove an entire Concept from daily review without altering or deleting its Cards.

Requirements:

- Add `Pause Concept` to Today’s Focus Concept actions
- Persist pauses by stable Concept id outside FSRS state
- Exclude paused Concepts before applying daily limits
- Keep paused Concepts and their Cards visible in Advanced Diagnostics
- Add `Resume Concept` in the paused Concept's diagnostics
- Re-read latest plugin data before pause/resume writes

Acceptance criteria:

- Pausing or resuming never invokes the scheduler
- All Card due dates, review counts, difficulty, stability, and lapse counts remain unchanged
- Pause state survives refresh and plugin reload
- Resuming makes eligible Cards available to ranking again
- Pause/resume writes preserve unrelated Inbox, source, settings, and review data

## Task 040: Suspend Card

Goal:

Let a student remove a single low-value or unsuitable Card from review without deleting its Markdown or schedule history.

Requirements:

- Add `Suspend Card` before and after answer reveal
- Persist suspension by stable Card id outside FSRS state
- Clear any temporary Review Later deferral when suspending
- Exclude suspended Cards from Today’s Focus and focus counts
- Keep suspended Cards visible in Advanced Diagnostics
- Add `Resume Card` beside suspended Card diagnostics

Acceptance criteria:

- Suspend/resume never invokes the scheduler
- Existing due date, review count, lapse count, difficulty, and stability remain unchanged
- Suspending advances the current review safely
- Completion summary distinguishes suspended Cards from reviewed or skipped Cards
- Resume restores normal eligibility without changing FSRS state

## Task 041: Importance-aware Review Priority

Goal:

Make Concept importance influence which eligible Concepts enter Today’s Focus first.

Requirements:

- Load `importance` from written Concept frontmatter into the Review Concept model
- Map low, normal, high, and critical to explicit priority weights
- Use normal weight when importance is absent or invalid
- Include importance as one explainable component of Concept review priority
- Show importance in Today’s Focus details and Advanced Diagnostics
- Keep FSRS Card scheduling independent from Concept importance

Acceptance criteria:

- With equal memory state, a critical Concept ranks above a low Concept
- Importance never makes a non-reviewable Card eligible
- Changing importance does not alter Card due dates or FSRS state
- Primary Concept metadata avoids overdue-debt wording
- Legacy Concepts without importance retain normal behavior

## Task 042: Exploratory Concept Review Policy

Goal:

Guarantee that exploratory Concepts remain useful notes without creating FSRS review pressure.

Requirements:

- Load `learning_mode` from written Concept frontmatter into the Review Concept model
- Mark exploratory Concepts non-reviewable even when Card.md exists
- Exclude valid exploratory Cards from Today’s Focus as `exploratory-concept`
- Keep their Cards visible in Advanced Diagnostics
- Preserve Card Markdown and any existing FSRS state
- Keep legacy and reviewable Concepts unchanged

Acceptance criteria:

- New and due Cards under an exploratory Concept never enter daily review
- Invalid exploratory Cards remain visible as invalid diagnostics
- Switching a Concept back to reviewable restores ordinary eligibility
- No scheduler call or review-state write occurs during policy evaluation
- Card generation remains unavailable for exploratory Concepts

## Task 043: Domain Contracts And Architecture Decisions

Goal:

Turn the product design review into one consistent domain language and implementation boundary.

Requirements:

- Define canonical Mneme terms in root `CONTEXT.md`
- Record hard-to-reverse trade-offs as concise ADRs
- Make Concept and Card atomicity explicit
- Keep FSRS Card-level and Concept Learning State aggregate-only
- Separate Importance from Retention Target
- Define Guided Merge, stable identity, stale provenance, AI Review Gate, Card Grounding, and deletion semantics
- Define isolated Anki export and project-based Use Mode through a neutral Knowledge Context Pack
- Reconcile PRODUCT_SPEC, DATA_MODEL, and ROADMAP with the accepted decisions

Acceptance criteria:

- Existing design documents no longer describe per-importance retention mapping
- Existing design documents no longer use Concept mastery as a product claim
- The canonical Card layout is one Card Group file per Concept
- Deleted Sources retain approved provenance as stale
- New modes cannot silently mutate FSRS
- AI knowledge changes remain individually reviewed

## Task 044: Bounded Grounded Card Generation

Goal:

Prevent Card generation from producing bulk or ungrounded review content.

Requirements:

- Limit each Card generation response to at most five proposals
- Encode the limit in provider prompts, structured output schema, and runtime validation
- Require at least one grounding evidence item for every Card proposal
- Require grounding evidence to quote the current approved Concept
- Reject the complete response before Inbox persistence when the contract is violated

Acceptance criteria:

- Six or more Card proposals produce an invalid response and write nothing
- Empty evidence produces an invalid response
- Evidence from another path or text absent from the approved Concept produces an invalid response
- Valid grounded proposals retain the existing Inbox approval flow

## Task 045: Preserve Stale Source Provenance

Goal:

Keep approved Concept origins intact when a Source Note disappears.

Requirements:

- Mark approved Concept-source links `stale` when their Source path is missing
- Preserve relation type, Source hash, evidence, timestamps, and Concept association
- Keep stale links idempotently on later Resync runs
- Continue pruning unactioned proposals, transient Source analysis records, and links whose Concept no longer exists
- Report marked-stale links separately from removed index items

Acceptance criteria:

- Deleting a Source does not erase approved provenance
- A second Resync does not rewrite or remove an already-stale link
- Missing Concepts still remove orphaned links and remain diagnostic
- Resync notices distinguish reconciliation from deletion
- Unrelated settings and review state remain unchanged

## Task 046: Repair Missing Card Sections

Goal:

Let students recover a common Invalid Card without rewriting unrelated Markdown or review history.

Requirements:

- Show `Repair Card` in Advanced Diagnostics when FRONT or BACK is entirely missing
- Reuse the Card editor fields with explicit repair language
- Add absent canonical marker sections while replacing valid existing sections
- Preserve Markdown outside the repaired marker sections
- Re-read the latest Card file before saving
- Leave FSRS and queue-control state untouched
- Refuse automatic repair for duplicate, unclosed, orphaned, or malformed marker structures

Acceptance criteria:

- Missing FRONT or BACK can be repaired into a valid Card
- Missing RUBRIC is added during repair
- Multi-Card repair changes only the selected Card block
- Legacy single-Card Markdown keeps surrounding user content
- Unsafe marker structures return an error without a write

## Task 047: Guided Stable Card ID Repair

Goal:

Replace path/index fallbacks and duplicate Card IDs without corrupting Markdown or guessing state ownership.

Requirements:

- Offer `Assign Stable ID` for valid Cards without an explicit ID
- Offer `Replace Duplicate ID` for a selected duplicate block
- Wrap only the marker span of a valid legacy single Card
- Rewrite only the selected CARD start marker in a Card Group
- Re-read the latest file and verify expected Card content and ID before writing
- Reject invalid, in-file duplicate, and vault-known duplicate target IDs
- Migrate fallback FSRS state, Review Later, and suspension to an assigned stable ID
- Do not migrate ambiguous state when replacing a duplicate ID
- Roll back the Markdown write if unambiguous state migration fails

Acceptance criteria:

- Frontmatter, headings, unrelated Card blocks, and user Markdown remain unchanged
- Missing-ID Card state moves to the new key without invoking the scheduler
- Duplicate repair leaves the original shared state with the unchanged ID
- Concurrent Card content or ID changes stop the write
- Stable IDs use a validated portable character set and are never reused within the known vault

## Task 048: Guided Stable Concept ID Repair

Goal:

Keep missing and duplicate Concept identities out of normal learning surfaces until the student repairs them safely.

Requirements:

- Report missing and duplicate Concept IDs instead of silently skipping or accepting them
- Exclude every ambiguous Concept from the normal Concept Library result
- Offer `Assign Stable ID` and `Replace Duplicate ID` in an Identity Repair section
- Rewrite only identity frontmatter in Concept.md and its explicitly linked Card.md
- Re-read both files and verify their current types and IDs before writing
- Reject invalid or vault-known target IDs
- Roll back both Markdown files if a write or unambiguous aggregate-state migration fails
- Migrate only a uniquely attributable Concept pause; never migrate state shared by a duplicate ID

Acceptance criteria:

- Missing and duplicate IDs produce actionable diagnostics
- Repair preserves headings, note content, and unrelated frontmatter
- Concept.md and its linked Card Group finish with the same Concept ID
- Duplicate repair leaves shared aggregate state with the unchanged original ID
- A concurrent identity edit stops the transaction
- Normal Concept consumers see only unique stable identities

## Task 049: Reversible Card Retirement

Goal:

Let a student permanently remove an obsolete Card from active learning without deleting its content or FSRS history.

Requirements:

- Require an explicit stable Card ID before retirement
- Persist retirement separately from suspension and FSRS state
- Clear temporary Review Later and suspension controls on retirement
- Exclude retired Cards from Today’s Focus and focus counts
- Exclude retired Cards from Concept Learning State risk and ranking
- Preserve Card Markdown and all FSRS history
- Keep retired Cards visible in Advanced Diagnostics
- Restore a retired Card with its existing FSRS schedule
- Move retirement state when an unambiguous Card ID is repaired

Acceptance criteria:

- Retiring a Card immediately removes it from the active session
- Refresh does not return it to Today’s Focus
- Its Concept statistics no longer count the retired Card
- Advanced Diagnostics shows retirement time and `Restore Card`
- Restore removes only the retirement control and preserves review history
- Suspension, deferral, Markdown, and scheduler history have clear non-overlapping semantics

## Task 050: Card Deletion, Tombstones, and History Erasure

Goal:

Delete Card content without silently destroying statistical history or allowing immutable identity reuse.

Requirements:

- Require a valid explicit Card ID and a complete CARD wrapper
- Show a destructive confirmation before changing Markdown
- Re-read the latest Card.md and verify expected Front, Back, and unique ID
- Remove only the exact selected CARD block
- Roll back Markdown if state persistence fails
- Clear active FSRS, deferral, suspension, and retirement state
- Record a content-free tombstone with deletion time and historical counts
- Preserve content-free review events by default
- Reject review or ID repair against a tombstoned Card ID
- Offer separately confirmed `Delete History Too` from Advanced Diagnostics
- Clear review events and tombstone counts when global Review History is cleared

Acceptance criteria:

- Other Card blocks, frontmatter, headings, and user Markdown remain byte-for-byte unchanged
- Concurrent edits and duplicate IDs stop deletion
- Deleted Cards disappear from Concept learning state and Today’s Focus
- Default deletion leaves a tombstone so deleted Card IDs cannot be reused
- Default deletion leaves no Front, Back, Rubric, or rationale in plugin data
- `Delete History Too` removes both events and the tombstone only after separate confirmation and is not a routine ID-reuse path
- New generated Card IDs differ across proposal identities without exposing internal proposal IDs

## Task 051: Explainable Possible Duplicate Detection

Goal:

Surface likely duplicate Concepts for student review without treating similarity as permission to merge knowledge.

Requirements:

- Compare only valid Concepts with unique stable IDs
- Use deterministic normalized title and Core Meaning signals
- Support word-token and CJK bigram comparison
- Keep thresholds conservative and report the exact triggering reasons
- Precompute text fingerprints once per scan
- Emit each unordered Concept pair at most once
- Sort stronger candidates first with deterministic tie-breaking
- Show both Core Meanings and direct links in Concept Library
- Persist `Not a duplicate` decisions by stable pair identity
- Allow dismissed pairs to be shown and reconsidered
- Do not modify Concept Markdown, source links, Cards, or learning state

Acceptance criteria:

- Same normalized titles are surfaced
- Highly overlapping Core Meanings can be surfaced despite different titles
- Merely related Concepts with weak overlap are not surfaced
- Pair keys cannot collide when IDs contain delimiters
- Refresh preserves dismissal decisions
- The UI explicitly states that a reviewed Guided Merge is still required

## Task 052: Transactional Guided Concept Merge

Goal:

Let a student reconcile a Possible Duplicate without losing Markdown, provenance, Card identity, or review history.

Requirements:

- Require the student to choose the surviving Concept identity and path
- Build a zero-write preview before confirmation
- Preserve the merged note's narrative as an editable View by default
- Let the student edit the final surviving Concept.md
- Preview every affected Markdown file with Before and After content
- Require explicit confirmation that all affected Markdown was reviewed
- Keep the survivor's `mneme_id` and validate its final Card Group link
- Move complete stable-ID Card blocks without changing Card IDs or FSRS state
- Adopt the merged Card Group when the survivor has none
- Replace a vacated Card Group with a valid empty redirect
- Replace the merged Concept with a non-Concept Redirect Note
- Migrate and deduplicate Concept-source links and Source analysis associations
- Migrate Concept pause and duplicate-dismissal state when ownership is clear
- Block while actionable Inbox proposals still target the merged Concept
- Reject shared Card Groups, malformed Cards, missing Card IDs, duplicate Card IDs, or changed associations
- Detect file or plugin-data changes after preview
- Roll back all written Markdown if any write or data persistence step fails
- Record a permanent Concept Merge Record so the old ID cannot be reused

Acceptance criteria:

- Previewing performs no writes
- Successful merge leaves one active Concept and one Redirect Note
- Every moved Card keeps its stable ID and all Card-keyed FSRS/control/history state
- Source relationships are deduplicated by Concept, Source, and relation type
- The old Concept ID is reserved and plugin-generated Concepts cannot reuse it
- Refresh removes the merged pair from Possible Duplicates
- Concurrent edits abort without partial writes
- Persistence failure restores every modified Markdown file

## Task 053: Guided Stale Source Relink

Goal:

Let a student repair approved provenance after a Source Note moves without silently inventing a new relationship.

Requirements:

- Surface retained `stale` Concept-source links in Concept Library
- Require the student to identify a replacement Markdown Source
- Build a zero-write preview with the final Concept.md Before and After
- Preserve relation type, evidence, and original `addedAt`
- Recompute the replacement Source hash and refresh `lastSeenAt`
- Update readable links only inside Concept.md `## Source Notes`
- Migrate and deduplicate Source analysis and Concept-source indexes
- Keep `lastAiCaptureHash` independent; relinking is not AI approval or AI analysis
- Verify Concept identity, replacement Source content, and plugin state after preview
- Reject self-linking and concurrent changes
- Roll back Concept.md and plugin data when persistence fails

Acceptance criteria:

- Previewing performs no writes
- The stale relationship becomes approved only after reviewed confirmation
- Existing evidence and relation semantics survive the repair
- An existing equivalent target relationship is deduplicated without losing evidence
- Concept.md remains a readable note with no machine provenance fields added
- Concurrent edits abort without partial writes
- Persistence failure restores both Markdown and plugin data

## Task 054: Reviewed Stale Provenance Removal

Goal:

Let a student explicitly discard a stale approved relationship when no replacement Source exists.

Requirements:

- Start only from a retained `stale` relationship in Concept Library
- Build a zero-write Concept.md Before/After preview
- Show the relation and retained evidence being permanently removed
- Require an explicit reviewed confirmation
- Remove only the selected Concept-source record
- Remove the readable Source entry only when no other relationship uses that Concept and Source pair
- Remove the Concept association from the Source analysis index only when no relationship remains
- Verify Concept identity, Markdown, and plugin state after preview
- Roll back Markdown and plugin data after a persistence failure

Acceptance criteria:

- No removal occurs before confirmation
- Other relationships to the same Source preserve the readable note and index association
- Unrelated links and Source entries remain untouched
- Concurrent edits abort without partial writes
- Persistence failure restores Markdown and plugin data

## Task 055: Manual Concept Creation

Goal:

Let a student create an approved Mneme Concept directly instead of depending on AI Source Note scanning.

Rationale:

AI capture accelerates extraction, but it is not authoritative about what the student intends to learn. Students may want to create a Concept when AI misses it, proposes the wrong boundary, or when they prefer to write the Concept themselves. Manual creation is therefore a required Concept entry path, not an optional power-user shortcut.

Requirements:

- Provide a user-facing way to create a new Concept without first running AI analysis
- Produce the same readable Concept Markdown shape as an accepted `new_concept` proposal
- Assign a stable Concept ID and required Mneme frontmatter
- Let the student provide title, Summary, Core Meaning, learning mode, importance, and English slug tags
- Treat the resulting Concept as approved user-authored knowledge, not AI proposal data
- Keep Card generation separate: Cards are still generated later from the written Concept and reviewed through Inbox before Card Markdown is written
- Do not require Source Evidence when the Concept is manually authored, though optional Source Note links can be considered in a later design

Acceptance criteria:

- A student can create a valid Concept.md without AI Capture being enabled
- The created Concept appears in Concept Library after refresh/resync
- Reviewable manually created Concepts can use Generate Cards from Current Concept
- Exploratory manually created Concepts remain outside Today’s Focus and cannot generate Cards
- The manual path does not create KnowledgeProposal records or pretend that AI approved the Concept
