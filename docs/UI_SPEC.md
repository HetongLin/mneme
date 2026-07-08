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
- Weak Concepts

Avoid:

- Debt
- Failed
- Missed
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

## Inbox View

### Purpose

Show AI-generated Concept Suggestions before committing them.

Inbox is a review surface, not a JSON/debug surface. Primary Inbox cards should show clear proposal titles, short previews, source context, and readiness. Raw structured AI output and lifecycle metadata belong under Advanced / Raw JSON only.

### Suggestion Types

- New Concept
- Update Existing Concept
- Possible Duplicate
- Ignore

### Actions

- Accept
- Edit
- Reject
- Merge
- Create Concept
- Update Concept

### Suggested Layout

For each suggestion, show:

- Suggestion type
- Concept title
- Importance
- Learning mode
- Source note
- Source excerpt
- Core understanding
- Common mistakes
- Suggested cards
- Actions

## Card Edit Modal

### Purpose

Allow users to edit Card.md marker content safely.

Editable fields:

- Front
- Back
- Rubric
- Targets
- Status

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
- Desired Retention default
- Desired Retention by importance
- LLM provider settings

Default retention mapping:

- low: 0.80
- normal: 0.85
- high: 0.90
- critical: 0.92

## Exploratory Concepts

Exploratory concepts:

- Generate Concept.md
- Do not generate Cards
- Do not enter FSRS
- Do not enter Today’s Focus
- May enter future Random Concept Draw

v0.1 does not need to implement Random Concept Draw.
