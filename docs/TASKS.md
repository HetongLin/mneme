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
- Suggested Cards
- Source references

Acceptance criteria:

- Valid JSON passes
- Invalid JSON fails with useful errors
- No Markdown is written before user approval

## Task 011: Inbox MVP

Goal:

Show pending Concept Suggestions for approval.

Requirements:

- Display suggestion type
- Display concept title
- Display source excerpt
- Display suggested cards
- Actions: Accept, Edit, Reject

Acceptance criteria:

- User can accept suggestion
- User can reject suggestion
- Accepted suggestion can generate Markdown files
- Rejected suggestion is not committed

## Task 012: Concept.md and Card.md Writer

Goal:

Generate Markdown files from approved suggestions.

Requirements:

- Write Concept.md
- Write Card.md
- Use stable frontmatter
- Use MNEME markers for cards
- Initialize FSRS state for active Cards

Acceptance criteria:

- Files are created in configured folders
- Card parser can parse generated Card.md
- Concept.md remains human-editable

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
