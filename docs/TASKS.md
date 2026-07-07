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
