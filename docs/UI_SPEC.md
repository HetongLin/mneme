# UI Spec

## Global UI Rule

All user-facing UI labels must be in English.

The product should feel low-pressure. Avoid debt-like language.

User experience is the first requirement. Primary UI should present concise review content, not AI/provider internals.

Do not expose these in primary UI surfaces:

- AI schema fields
- diagnostics
- confidence scores
- provider metadata
- prompt text
- raw evidence arrays
- lifecycle metadata
- validation internals

Machine-oriented data belongs in plugin data, diagnostics, proposal internals, Developer Tools, or Advanced / Raw JSON.

Prefer:

- Today’s Focus
- Later
- Needs Attention
- Needs Work Signals

Avoid:

- Debt
- Failed
- Missed
- Weak Concepts
- Overdue overload

## Main Views

v0.1 includes:

- Review View
- Inbox View
- Card Edit Modal
- Settings View or Settings Tab

## Review View

### Purpose

Review due Cards grouped by Concept.

FSRS schedules Cards. Mneme groups due Cards by Concept.

### Front State

Display:

- Mneme Review
- Concept title
- Card progress
- Source note
- Front content
- Actions

Labels:

- Show Answer
- Edit
- View Source
- Skip

Example:

Mneme Review

Concept: Information Gain  
Card 1 / 3  
Source: Decision Tree.md

Front:

Why does information gain tend to favor attributes with many values?

Actions:

- Show Answer
- Edit
- View Source
- Skip

### Back State

After clicking Show Answer, display:

- Front
- Back
- Rubric
- Rating buttons

Labels:

- Again
- Hard
- Good
- Easy
- Edit
- View Source

### Rating Behavior

- Again updates FSRS state.
- Hard updates FSRS state.
- Good updates FSRS state.
- Easy updates FSRS state.
- Skip does not update FSRS state.
- Edit opens Card Edit Modal.
- View Source opens the Source Note.

## Today’s Focus

The review home should emphasize Concepts, not raw Card debt.

Preferred display:

Today’s Focus  
5 Concepts · 16 Cards

Do not display a scary overdue queue by default.

## Concept Library Duplicate Diagnostics

Possible Duplicate is a review signal, not merge permission. Each candidate shows both Concept titles, concise Core Meaning previews, and human-readable triggering reasons. Internal similarity scores may order candidates but are not presented as confidence. The student can open either note, mark the pair `Not a duplicate`, or enter Guided Merge. Detection and dismissal never write Markdown.

Guided Merge first asks which Concept survives and whether to preserve the other narrative as a View. It then shows an editable final survivor note plus Before/After previews for every other affected file, Card and Source migration counts, and a review-confirmation checkbox. Only `Confirm Guided Merge` writes. Any file or plugin-state change after preview requires rebuilding the preview.

## Concept Library Stale Source Repair

Stale Source Provenance is a review queue for approved relationships whose Source file is missing. Each item shows the Concept, last known Source path, relation, and evidence count. `Relink Source` asks for the replacement Markdown path, then previews the Concept.md Before/After and preserved provenance. Only `Confirm Relink`, enabled after the student checks the review acknowledgement, writes. A changed Concept, replacement Source, or plugin state invalidates the preview.

`Remove Provenance` is a destructive but scoped alternative. Its preview shows the exact relation/evidence and Concept.md Before/After, explains when a readable Source entry must remain for another relation, and requires a separate acknowledgement before `Confirm Removal` is enabled.

## Inbox View

### Purpose

Show AI-generated Concept Suggestions before committing them.

Inbox is a queue, not the acceptance surface. Primary Inbox cards should show only proposal titles and the queue actions needed to continue review. Raw structured AI output and lifecycle metadata belong under Advanced / Raw JSON only.

### Suggestion Types

- New Concept
- Update Existing Concept
- Possible Duplicate
- Ignore

### Actions

- Open
- Reject

### Suggested Layout

For each suggestion, show:

- Concept title
- Open
- Reject

Concept-stage Inbox cards must not show or create Suggested Cards. Cards are generated later from written Concepts through a separate Card-generation action and then reviewed as Card proposals.

Inbox must not expose an `Accept` action. Acceptance requires opening the proposal detail surface first.

## Proposal Detail Review Modal

### Purpose

The proposal detail modal is the Review Gate. It lets the student read, edit, and approve or reject one proposed knowledge change.

Preferred order:

1. Title / Source / Target metadata
2. Editable Concept or Card content
3. Source Evidence
4. Validation status
5. Advanced / Raw JSON
6. Bottom actions

`Proposed Change` summaries should not appear above editable Concept fields when they merely duplicate Summary or Core Meaning. For Card proposals, the editable Front / Back / Rubric fields are the primary review content.

Source Evidence must show concrete evidence excerpts, not only an evidence count. It may show the first few excerpts and place the full structured payload under Advanced / Raw JSON.

Bottom actions:

- Accept
- Reject
- Close

## Card Edit Modal

### Purpose

Allow users to edit Card.md marker content safely.

Editable fields:

- Front
- Back
- Rubric

Actions:

- Save
- Cancel

Rules:

- Saving updates Card.md markers.
- Editing content does not update FSRS state.
- FSRS state only changes after a review rating.
- If marker format is broken, show validation error.

## Settings

v0.1 settings:

- Concepts folder
- Cards folder
- Daily Concept Limit
- Daily Card Limit
- Cards per Concept
- Global Retention Target
- Explicit manual retention override, if implemented later
- LLM provider settings

Importance does not silently change FSRS desired retention. Mneme may use Importance to rank already-eligible Concepts, but FSRS keeps a global Retention Target unless the student intentionally chooses a separate scheduling override.

## Exploratory Concepts

Exploratory concepts:

- Generate Concept.md
- Do not generate Cards
- Do not enter FSRS
- Do not enter Today’s Focus
- May enter future Random Concept Draw

v0.1 does not need to implement Random Concept Draw.
