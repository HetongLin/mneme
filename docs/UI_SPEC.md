# UI Spec

## Global UI Rule

All user-facing UI labels must be in English.

Fixed product chrome and field labels use English. Content that comes from the student's notes follows the Source Note's dominant language, so a Chinese note may produce Chinese Concept summaries, Core Meaning, Card prompts, and evidence excerpts. Technical terms should include English names in parentheses when helpful, such as `字典学习 (Dictionary Learning)`.

AI should prefer stable English lowercase tag slugs, but user-approved and manually entered tags may use any language already meaningful in the vault. Mneme normalizes whitespace and punctuation without deleting non-Latin text.

Generated and manually edited mathematical notation uses Obsidian MathJax Markdown. Use `$...$` for short inline formulas inside a sentence. Use `$$...$$` on separate lines for standalone, long, emphasized, or multi-line equations. Primary Concept and Review Card surfaces render this Markdown through Obsidian; selecting a rendered formula opens the corresponding raw Concept or Card editor.

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
- Create Concept Modal
- Concept Library
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
- Front content
- Primary action
- Collapsed Card details

Labels:

- Show Answer

Example:

Mneme Review

Concept: Information Gain  
Card 1 / 3  

Front:

Why does information gain tend to favor attributes with many values?

Actions:

- Show Answer

Complex Card operations are isolated behind `More`, not mixed into the primary review action row.

### Back State

After clicking Show Answer, display:

- Front
- Back
- Rating buttons in one row
- Collapsed More actions

Labels:

- Again
- Hard
- Good
- Easy

The Back should use the same typography and visual treatment as the Front. Rubric / scoring hints such as “1 point for...” are hidden under `More` by default.

Primary back-side actions are only the FSRS rating buttons, arranged like an Anki answer screen. Again, Hard, Good, and Easy stay on one row. Complex actions stay behind `More`; when expanded, those actions are displayed vertically.

### Rating Behavior

- Again updates FSRS state.
- Hard updates FSRS state.
- Good updates FSRS state.
- Easy updates FSRS state.
- Skip does not update FSRS state.
- Edit opens Card Edit Modal.
- Open Concept opens the approved Concept that grounds the Card. Source Notes remain reachable from that Concept.
- Review Later, Suspend Card, Retire Card, and Delete Card are available from `More`, not the main review controls.

## Today’s Focus

The review home should emphasize Concepts, not raw Card debt.

Preferred display:

Today’s Focus  
5 Concepts · 16 Cards

Do not display a scary overdue queue by default.

Today’s Focus is a curated subset of FSRS-eligible Cards. The UI shows a calm `available later` count so work is not silently hidden, and ranking includes a bounded rotation factor so lower-importance eligible Concepts are not starved indefinitely.

## Concept Library Quick Review

Concept Library is primarily a visual quick-review surface, not a metadata dashboard. Its default body is a responsive wall of Concept cards. Each card's primary face contains only:

- Concept title
- Core Meaning

Selecting the card opens the clean Concept note. File paths, tags, learning mode, importance, Source counts, Card counts, and Why It Matters do not appear on the card face. Concept management actions such as Edit Concept, Open Cards, and Generate Cards remain available under the card's collapsed `More` control.

Core Meaning is rendered with Obsidian Markdown, including MathJax formulas delimited by `$...$` or `$$...$$`. Selecting a rendered formula opens Edit Concept so the student can inspect and change the original Markdown/LaTeX source.

Search stays visible. Learning mode, importance, tag, and sort controls live under collapsed `Filters`. Identity Repair, Stale Source Provenance, and Possible Duplicates remain available below the card wall under collapsed `Library maintenance`, so diagnostics do not dominate quick review.

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
3. Source Evidence for Concept proposals, or Concept Grounding for Card proposals
4. Validation status
5. Advanced / Raw JSON
6. Bottom actions

`Proposed Change` summaries should not appear above editable Concept fields when they merely duplicate Summary or Core Meaning. For Card proposals, the editable Front / Back / Rubric fields are the primary review content.

Markdown-bearing editor fields use a Live Preview interaction: the inactive field is rendered with Obsidian Markdown, and selecting it reveals the original editable source, including `$...$` and `$$...$$` delimiters. Concept Library remains the dedicated read-only rendered Concept surface.

Concept proposals show concrete Source Evidence excerpts. Card proposals instead show Concept Grounding quoted from the approved Concept. Either surface may show the first few excerpts and place the full structured payload under Advanced / Raw JSON.

Bottom actions:

- Accept & Next
- Reject & Next
- Close

The modal advances within the same proposal stage after a successful action. This reduces approval ceremony without permitting unseen bulk acceptance.

There is no separate `Save Edits` action in the structured Review Gate. `Accept & Next` first snapshots and saves every current structured field, then validates and writes that exact saved payload. `Reject & Next` discards the proposal without saving draft edits. Advanced / Raw JSON keeps its explicit save escape hatch.

## Card Edit Modal

### Purpose

Allow users to edit one Card block inside a Card Group safely.

Editable fields:

- Front
- Back
- Rubric

Actions:

- Save
- Cancel

Rules:

- Saving updates only the selected Card Group block.
- Editing content does not update FSRS state.
- FSRS state only changes after a review rating.
- If marker format is broken, show validation error.

Back must contain the complete answer. Rubric is an optional scoring checklist and must not introduce knowledge absent from Back; keeping Rubric collapsed is safe only under this invariant.

## Create Concept Modal

`Create Concept` is available from the command palette and Concept Library. Title and Core Meaning are required; Why It Matters and tags are optional. The student may choose Learning Mode and Importance. Saving writes an immediately approved clean Concept with a stable ID and Card Group link; it does not create an Inbox proposal.

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
