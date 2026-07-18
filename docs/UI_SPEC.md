# UI Spec

## Global UI Rule

All user-facing UI labels must be in English.

Fixed product chrome and field labels use English. Generated learning content follows the Source Note's detected dominant language. English Sources produce English learning content. Chinese Sources produce Chinese-first Concept titles, Core Meaning, Why It Matters, Views, and Card text; each technical concept or established proper term includes its standard English name in parentheses on first occurrence, such as `字典学习 (Dictionary Learning)`. Evidence excerpts remain exact and untranslated.

Concept titles use the shortest unambiguous canonical name. They identify the reusable knowledge itself and do not include note-specific applications, domains, tools, courses, or lesson wording unless the complete phrase is an established distinct term. Application context belongs in Why It Matters or Views; for example, use `Bayes Theorem` with a `Hypothesis Evaluation` View rather than `Bayes Theorem for Hypothesis Evaluation`. Reusable relationships use a direct relational title such as `Least Squares as Maximum Likelihood`, not a copied conjunction heading such as `Maximum Likelihood and Least-Squared Error`.

AI generation is single-flight per file. While Concept generation is running for a Source Note, another Analyze Current Note request for that note is rejected with an in-progress notice. While Card generation is running for a Concept, another Generate Cards request for that Concept is rejected. The Concept Library button is disabled and reads `Generating...` until the request finishes. Success, invalid responses, configuration errors, and provider failures all release the lock so the user can retry.

Current-note commands are context-aware. `Analyze Current Note` appears only for ordinary Markdown Source Notes, never for Concepts or files inside Mneme's Concepts/Cards folders. `Generate Cards from Current Concept` appears only for reviewable Concepts. `Open Cards for Current Concept` appears for any written Concept, including exploratory Concepts that may already have a Card Group. Runtime checks enforce the same rules even when an action is invoked outside the command palette.

AI settings label the per-request limit as `AI chunk size`. Longer Source Notes are analyzed completely across Markdown-aware chunks rather than truncated. A completed capture reports `Analyzed {analyzed}/{total} characters across {count} chunks.` so the student can verify coverage; a failed chunk reports its chunk position and no proposal from that capture is written.

AI settings expose optional `Concept style guidance` and `Card style guidance` text areas. These are advanced preference fields for writing style, concept-selection preference, question difficulty, and learning emphasis. Their helper text must state that Mneme's required JSON format, proposal kinds, field names, evidence rules, language contract, and enum values remain fixed. Users may tune content inside fields; they may not rename, remove, reorder, or replace fields such as Core Meaning, Why It Matters, Front, Back, Rubric, Learning Mode, Importance, Tags, evidence, or `cardType`.

AI-generated Concept tags must be stable English lowercase slugs. During Concept generation, Mneme supplies existing approved English tags as `existingTags`; AI must prefer those tags whenever they reasonably fit, choose at most three broad domain/course/topic-family tags, and avoid near-duplicates, Concept-title tags, isolated adjectives, and overly generic tags such as `learning`, `theory`, `model`, `method`, `concept`, or `optimal`. User-approved and manually entered tags in other scripts remain valid; Mneme does not silently rewrite historical Concept Markdown.

Generated and manually edited mathematical notation uses Obsidian MathJax Markdown. Use `$...$` for short inline formulas inside a sentence. Use `$$...$$` on separate lines for standalone, long, emphasized, or multi-line equations. Primary Concept and Review Card surfaces render this Markdown through Obsidian; selecting a rendered formula opens the corresponding raw Concept or Card editor.

The product should feel low-pressure. Avoid debt-like language.

User experience is the first requirement. Primary UI should present concise review content, not AI/provider internals.

User-visible failures must include a short actionable reason rather than requiring the console. If the primary Markdown or review-state write succeeded but a dependent View refresh failed, the UI must say that the action succeeded and identify only the refresh as failed. It must never invite a duplicate Accept, Save, Reject, or Resync because of a secondary UI failure.

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
- Concept Composer View
- Concept Library
- Settings View or Settings Tab

## Review View

### Purpose

Review due Cards grouped by Concept.

FSRS schedules Cards. Mneme groups due Cards by Concept.

Mneme Review and Concept Library are Mneme workspace surfaces, not ordinary note tabs. Opening either surface focuses an existing instance when available; otherwise Mneme opens a popout window when the desktop app supports it, falling back to a normal workspace tab only when popout windows are unavailable.

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
- After a rating, Mneme advances without showing the previous Card ID or a persistent previous-card status message.
- Skip does not update FSRS state.
- Edit opens Card Edit Modal.
- View Concept opens Mneme's Concept detail/editor surface for the approved Concept that grounds the Card. Source Notes remain reachable from that Concept. Open Concept Markdown is reserved for the raw Markdown source file.
- Review Later, Suspend Card, Retire Card, and Delete Card are available from `More`, not the main review controls.

Card Edit and Repair re-read the latest Card Group before writing. If the selected Card's Front, Back, or Rubric changed after the editor opened, Save stops and asks the student to reopen the latest content. Changes to other Cards or surrounding Markdown are preserved and do not block the targeted edit. A duplicated stable Card ID must be repaired before content editing can choose a target.

## Today’s Focus

The review home should emphasize Concepts, not raw Card debt.

Preferred display:

Today’s Focus  
5 Concepts · 16 Cards

Do not display a scary overdue queue by default.

When FSRS scheduling is enabled, Today’s Focus contains all valid due and new Cards that are not explicitly deferred, paused, suspended, retired, deleted, or otherwise ineligible. Concept priority orders the queue but does not truncate it. The primary UI does not display debt-style overdue totals.

When Scheduled Review is disabled, the Review View subtitle says `Scheduled review is off`. The view shows no Today’s Focus Concept queue, `Show Answer`, or rating controls. It explains that Today’s Focus is hidden, while manual Concept Review from Concept Library still updates Card memory.

Settings contains `Show Today’s Focus` before the retention, fuzz, and maximum-interval controls. There are no Daily Concept Limit, Daily Card Limit, or Cards per Concept settings.

## Concept Library Quick Review

Concept Library is primarily a visual quick-review surface, not a metadata dashboard. Its default body is a responsive wall of Concept cards. Each card's primary face contains only:

- Concept title
- Core Meaning

Selecting the card opens Mneme's Concept detail/editor surface, not the raw Markdown source. File paths, tags, learning mode, importance, Source counts, Card counts, and Why It Matters do not appear on the card face. The collapsed `More` control starts with daily learning actions: `View Concept` and `Review Cards`.

`View Concept` uses the rendered editable Concept surface. The student can read the Concept first and edit only when needed.

`Review Cards` starts Concept-scoped Mneme card review for that Concept. It must not open Card Markdown source files. It uses all valid Cards in the Concept, including Cards that are not due in Today’s Focus, and ratings still update FSRS memory. If the Concept has no Card group yet, Mneme shows a `No cards yet` prompt with `Generate to Review` when the Concept is eligible for Card generation.

Raw file operations are second-level actions under `Source Files`, including `Open Concept Markdown` and `Open Cards Source`. Source files are maintenance/debug affordances, not the daily learning path.

View Concept contains an optional numeric `Retention Target` field under Concept metadata. Blank means the current global target; values must be between `0.70` and `0.98`. The helper text states that it affects only future rated FSRS reviews and does not rewrite existing due dates. Review `Details` and Advanced Diagnostics identify whether the effective target is global or a Concept override; it is not shown on the Concept Library card face.

Core Meaning is rendered with Obsidian Markdown, including MathJax formulas delimited by `$...$` or `$$...$$`. Selecting a rendered formula opens Concept detail/editor so the student can inspect and change the original Markdown/LaTeX source.

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

1. Source / Target metadata when applicable
2. Editable Concept or Card content
3. Source Evidence for Concept proposals, or Concept Grounding for Card proposals
4. Validation status
5. Advanced / Raw JSON
6. Bottom actions

For a new Concept proposal, editable learning fields appear in this order: Concept title, Core Meaning, Why It Matters, Learning Mode, Importance, and Tags. `Core Meaning` explains what the Concept is and its defining mechanism. `Why It Matters` explains why it is useful, when it matters, or what problem it helps solve. The corresponding proposal fields are `coreMeaning` and `whyItMatters`.

Do not show a separate `Proposed Change` overview above editable Concept fields when it merely duplicates Why It Matters or Core Meaning. For Card proposals, the editable Front / Back / Rubric fields are the primary review content.

Do not add a generic `Edit` heading, interaction instructions, duplicated proposal title, or success text such as `Proposal payload is ready for review`. Editable fields should be self-evident. Validation UI appears only when there is an actionable error or warning.

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

## Concept Composer View

`Create Concept` is available from the command palette and Concept Library. It opens a dockable right-sidebar View so the student can keep the Source Note visible while writing. When the Composer has no meaningful saved draft, the ordinary Markdown note active at opening becomes Source Note by default. Mneme Concept and Card files are never default sources. The selected source is a draft value and does not silently follow later active-file changes; `Use Current Note` explicitly replaces it and `Clear` creates a source-free Concept.

The primary form shows Source Note, Title, Core Meaning, Why It Matters, and Create Concept. Learning Mode, Importance, and tags live under `More`, with Reviewable and Normal defaults. Draft fields auto-save in plugin data and survive closing the View. `Cmd/Ctrl+Enter` invokes the same guarded creation action as the button. After creation, learning fields clear while Source Note remains selected for extracting another Concept from the same note. The Source Note stays open; a success row offers `Open Concept` instead of navigating automatically.

Title and Core Meaning are required. An exact normalized title blocks creation and links to the existing Concept. A possible duplicate must be reviewed before `Create Anyway` becomes available. Saving writes immediately approved user-authored knowledge with a stable ID and Card Group link; it does not create an Inbox proposal.

Manual and AI-accepted Concepts use the same Markdown renderer. `Source Notes` is optional in that canonical format: a selected source writes the standard section and approved provenance index; no source omits the section entirely rather than writing an empty heading or placeholder.

The creation action is single-flight from preflight duplicate scanning through the committed Markdown/provenance write. Once that commit succeeds, draft-reset or dependent-view refresh failures are reported as secondary UI errors and must never tell the student that Concept creation itself failed.

## Settings

Current settings:

- Concepts folder
- Cards folder
- Show Today’s Focus
- Global Retention Target
- Enable fuzz
- Maximum interval
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
