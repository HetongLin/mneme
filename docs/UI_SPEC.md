# UI Spec

## Global UI Rule

All user-facing UI labels must be in English.

Fixed product chrome and field labels use English. Generated learning content follows the Source Note's detected dominant language. English Sources produce English learning content. Chinese Sources produce Chinese-first Concept titles, Core Meaning, Why It Matters, Views, and Card text; each technical concept or established proper term may retain its standard English term in learning prose when useful. Concept Title stands alone by default. `Suggest English aliases` is off by default; when enabled, non-English titles may store an optional English Alias and the UI may compose `字典学习 (Dictionary Learning)`. English titles never show or store a redundant alias through ordinary editors. Evidence excerpts remain exact and untranslated.

Concept titles use the shortest unambiguous canonical name. They identify the reusable knowledge itself and do not include note-specific applications, domains, tools, courses, or lesson wording unless the complete phrase is an established distinct term. Application context belongs in Why It Matters or Views; for example, use `Bayes Theorem` with a `Hypothesis Evaluation` View rather than `Bayes Theorem for Hypothesis Evaluation`. Reusable relationships use a direct relational title such as `Least Squares as Maximum Likelihood`, not a copied conjunction heading such as `Maximum Likelihood and Least-Squared Error`.

`View Concept` shows a collapsible `Related Concepts (N)` area. Related Concepts use Obsidian-style navigation links rather than action-button styling, are sorted by title, and appear in an internally scrolling list capped at 240px. The area opens by default for zero to three relations and starts collapsed for four or more. `Manage Related Concepts` remains a visually separate secondary action below the link list; it lets the learner search approved Concepts, add one symmetric link, or remove one. Direct learner changes do not enter Inbox. Mneme reports a concurrent-edit conflict rather than overwriting either file. The MVP exposes no prerequisite, contrast, or application relation types.

AI generation is single-flight per file. While Concept generation is running for a Source Note, another Analyze Current Note request for that note is rejected with an in-progress notice. While Card generation is running for a Concept, another Generate Cards request for that Concept is rejected. The Concept Library button is disabled and reads `Generating...` until the request finishes. Success, invalid responses, configuration errors, and provider failures all release the lock so the user can retry.

Current-note commands are context-aware. `Analyze Current Note` appears only for ordinary Markdown Source Notes, never for Concepts or files inside Mneme's Concepts/Cards folders. `Generate Cards from Current Concept` appears only for reviewable Concepts. `Open Cards for Current Concept` appears for any written Concept, including exploratory Concepts that may already have a Card Group. Runtime checks enforce the same rules even when an action is invoked outside the command palette.

`Open Concepts Graph` opens Obsidian's official global Graph View. Mneme does not depend on private Graph APIs or silently alter Graph settings. A visible guide tells the learner to enter `[mneme_type:concept]` under Graph settings → Filters → Search files, which keeps approved Concept notes visible while excluding Source Notes, Card Groups, and Concept Redirect notes. If Graph View is already open, the command focuses that existing view.

AI settings label the per-request limit as `AI chunk size`. Longer Source Notes are analyzed completely across Markdown-aware chunks rather than truncated. For Concept capture, Mneme may use smaller internal extraction chunks, currently capped at 6,000 characters, so textbook notes are scanned for multiple independent Concepts instead of summarized into chapter-level Concepts. A completed capture reports `Analyzed {analyzed}/{total} characters across {count} chunks.` so the learner can verify coverage; a failed chunk reports its chunk position and no proposal from that capture is written.

Long approved Concepts use the same chunk-size setting for Card generation. The completed Card-generation notice reports approved Concept character coverage so the learner can see that the full Concept was analyzed rather than only the first request-sized slice.

AI settings must not expose free-form Concept/Card prompt or style guidance. Concept capture uses Mneme's fixed prompt. Card generation exposes only `Allowed AI card types` as nine checkbox/toggle options: Definition, Distinction, Procedure, Example, Trap, Proof, Application, Mastery, and Other. At least one type must stay enabled. Enabled types are allowed options, not required quotas; the UI copy must not imply Mneme will generate every enabled type. These nine options should live behind a collapsible settings section with an enabled-count summary so the settings page does not become a wall of card-type toggles.

AI provider settings are layered by selected provider. The provider dropdown is always visible, but Mneme should show only the currently selected provider's key/base URL/model fields. Unselected provider credentials and models stay stored but hidden. Mock mode should show a short no-key-required note instead of network-provider fields. Low-frequency request controls such as timeout and chunk size should live behind a compact `Request options` disclosure.

AI-generated Concept tags must be stable English lowercase slugs. During Concept generation, Mneme does not supply existing approved tags; AI must choose at most three broad domain/topic-family tags and avoid near-duplicates, Concept-title tags, isolated adjectives, and overly generic tags such as `learning`, `theory`, `model`, `method`, `concept`, or `optimal`. After the response, Mneme locally reconciles normalized exact matches against approved Concept tags. The Concept Review Gate uses the same picker as manual creation: it can reuse catalog tags, create an English slug, and show similar existing tags as explicit replacement suggestions. Mneme does not silently merge tags or rewrite historical Concept Markdown.

`Analyze Current Note` is context-free extraction. The UI must not imply that generation checks the Concept Library, Inbox, or existing tags before proposing Concepts. Duplicate or overlapping proposals are acceptable review items; Merge is an explicit Concept Library workflow.

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
- English Alias, only when one is stored
- Card progress
- Front content
- Fixed bottom action bar

Labels:

- Show Answer

Example:

Mneme Review

Concept: Information Gain  
Card 1 / 3  

Front:

Why does information gain tend to favor attributes with many values?

The Card body is the independently scrollable content region. The fixed bottom action bar shows `Edit` on the left, `Show Answer` in the center, and `More` on the right. Complex Card operations are isolated behind the `More` menu and never expand the Card body.

### Back State

After clicking Show Answer, display:

- Front
- Back
- Rating buttons in one row in the fixed bottom action bar

Labels:

- Again
- Hard
- Good
- Easy

The Back should use the same typography and visual treatment as the Front. Front remains visible above Back. Rubric / scoring hints such as “1 point for...” are available from `More` → `Card Info`, not shown in the recall body.

The fixed bottom bar retains `Edit` and `More`, and replaces `Show Answer` with the FSRS rating buttons. Again, Hard, Good, and Easy stay on one row. Complex actions stay in a compact vertical `More` menu.

When a Concept review completes, the completion summary remains in the scrollable content area. `View Concept` appears on the left side of the fixed bottom bar and `Review Next Concept`, when another scheduled Concept is available, appears in its center. Completion actions do not return to the Card body.

### Rating Behavior

- Again updates FSRS state.
- Hard updates FSRS state.
- Good updates FSRS state.
- Easy updates FSRS state.
- After a rating, Mneme advances without showing the previous Card ID or a persistent previous-card status message.
- Skip for Now does not update FSRS state or persist a schedule change.
- Edit opens Card Edit Modal.
- View Concept opens Mneme's Concept detail/editor surface for the approved Concept that grounds the Card. Source Notes remain reachable from that Concept. Open Concept Markdown is reserved for the raw Markdown source file.
- Review Tomorrow, Suspend Card, Archive Card, Card Info, and Delete Card are available from `More`, not the main review controls.

Card Edit and Repair re-read the latest Card Group before writing. If the selected Card's Front, Back, or Rubric changed after the editor opened, Save stops and asks the learner to reopen the latest content. Changes to other Cards or surrounding Markdown are preserved and do not block the targeted edit. A duplicated stable Card ID must be repaired before content editing can choose a target.

When `Save Card` is used from an active Mneme Review session, the editor closes back into that same review session. Mneme re-reads the Card Group, restores the current Card by stable Card ID, preserves its position, review counters, and whether the answer was revealed, and immediately renders the modified content. This path must not reset Review to Today’s Focus. If the edit makes the Card invalid or removes its stable identity, Mneme reports that it cannot restore the Card instead of silently advancing to another Card.

When `Delete Card` is used from an active Mneme Review session, the successful deletion stays inside that session and advances to the next Card. If the deleted Card was the last unreviewed Card in the Concept, the existing Review Complete state is shown and the background queue refresh runs normally. Deletion must not return directly to Today’s Focus, and the completion summary reports deleted Cards separately from reviewed Cards.

## Today’s Focus

The review home should emphasize Concepts, not raw Card debt.

Today’s Focus uses compact, equal-height Concept cards. Diagnostic information must not expand downward inside an individual grid card because it distorts the grid and leaves empty columns. Each card has a quiet information control beside its title. It opens a single non-modal Concept Details inspector at the right of the queue; selecting a different Concept replaces the inspector contents, while selecting the active information control or Close dismisses it. On narrow views the inspector becomes a fixed bottom sheet. The inspector contains Overview statistics, Card-type Coverage chips, and a bounded internally scrolling Card Status list. Importance and Card count remain on the card face and are not repeated in the inspector.

Preferred display:

Today’s Focus  
5 Concepts · 16 Cards

Do not display a scary overdue queue by default.

When FSRS scheduling is enabled, Today’s Focus contains all valid due and new Cards that are not explicitly deferred until tomorrow, suspended, archived, deleted, or otherwise ineligible. Concept priority orders the queue but does not truncate it. Concept-level pause is not available because Concept is an aggregate rather than a scheduling unit. The primary UI does not display debt-style overdue totals.

When Scheduled Review is disabled, the Review View subtitle says `Scheduled review is off`. The view shows no Today’s Focus Concept queue, `Show Answer`, or rating controls. It explains that Today’s Focus is hidden, while manual Concept Review from Concept Library still updates Card memory.

Settings contains `Show Today’s Focus` before the retention, fuzz, and maximum-interval controls. There are no Daily Concept Limit, Daily Card Limit, or Cards per Concept settings.

## Concept Library Quick Review

Concept Library is primarily a visual quick-review surface, not a metadata dashboard. Its default body is a responsive wall of Concept cards. Each card's primary face contains only:

- Concept title
- Core Meaning

Selecting the card opens Mneme's Concept detail/editor surface, not the raw Markdown source. File paths, tags, learning mode, importance, Source counts, Card counts, and Why It Matters do not appear on the card face. Concept Library does not show a top-level `More` menu on each Concept card; the card face itself is the View Concept action.

The rendered editable Concept surface is opened by selecting the Concept card. The learner can read the Concept first and edit only when needed. The Concept title is the first learning-content heading, displayed prominently above Core Meaning; the modal title `View Concept` and the source-file path remain secondary interface context rather than substitutes for the Concept name.

`View Concept` includes a destructive `Delete Concept` action separated by warning styling from routine editing. It always opens a confirmation surface that names the Concept and states how many Cards will also be deleted. Confirming deletes the Concept Markdown and its dedicated Cards Markdown, removes reverse `Related Concepts` links, removes active FSRS state for those Cards, and preserves Card tombstones and review events so deleted IDs cannot be silently reused. Source Notes are never deleted. The Concept Library and Mneme Review refresh automatically after completion.

Each Concept card shows one directly visible primary learning action. If the shared Card loader finds at least one accepted, valid Card block for the Concept, it reads `Review Cards` and starts Concept-scoped Mneme card review for that Concept. It must not open Card Markdown source files. It uses all valid Cards in the Concept, including Cards that are not due in Today’s Focus, and ratings still update FSRS memory. If there are no accepted, valid Card blocks, the action reads `Generate to Review`. Selecting it starts generation immediately without a second confirmation modal, shows `Generating Cards...` while the request is active, and opens Inbox scoped to only the generated Card batch for that Concept. A declared Card Group link, an empty Card Group Markdown file, or a Card Group containing only invalid blocks must not display `Review Cards` or navigate to Mneme Review.

In a scoped `Generate to Review` Inbox session, `Accept & Next` and `Reject & Next` advance only within that generated batch. Mneme waits until every proposal in the batch is resolved. Written/rejected proposal records remain available as the batch completion ledger until this scoped session resolves; ordinary Inbox reconciliation must not delete them mid-session. One or more accepted Cards automatically continue to Concept Review after the final decision; the continuation must read the newly written Card Group from current vault contents and briefly retry while Obsidian refreshes its indexes, rather than treating a stale cached file as an empty Card Group. An all-rejected batch remains in Inbox with `No Cards accepted` and `Back to Concept Library`. Ordinary Inbox sessions retain their existing cross-proposal behavior and cleanup behavior, and never acquire this automatic navigation implicitly.

Completing a Concept Card session automatically refreshes Card files, FSRS state, and the Review queue in the background. The `Review complete` surface remains visible and confirms that the schedule was updated; returning to Today’s Focus or Concept Library must not require another manual refresh. After that refresh, a scheduled Today’s Focus session shows `Review Next Concept` when another refreshed Focus Concept remains, allowing continuous Concept-grouped review without returning to the queue. It excludes the just-completed Concept and is not shown for a manual Concept Library session, whose scope remains the explicitly selected Concept. When nothing remains, the completion surface says `Today’s Focus is complete.` Revealing an existing Concept Library View performs a fresh scan so review-state and Card-count changes are visible immediately. Manual `Refresh Cards` remains available during the staged rollout as a recovery action for external edits or missed Obsidian events.

Raw file operations are second-level actions under `Source Files`, including `Open Concept Markdown` and `Open Cards Markdown`. Source files are maintenance/debug affordances, not the daily learning path.

View Concept contains an optional numeric `Retention Target` field under Concept metadata. Blank means the current global target; values must be between `0.70` and `0.98`. The helper text states that it affects only future rated FSRS reviews and does not rewrite existing due dates. Review `Details` and Advanced Diagnostics identify whether the effective target is global or a Concept override; it is not shown on the Concept Library card face.

Core Meaning is rendered with Obsidian Markdown, including MathJax formulas delimited by `$...$` or `$$...$$`. Selecting a rendered formula opens Concept detail/editor so the learner can inspect and change the original Markdown/LaTeX source.

Search stays visible. Learning mode, importance, tag, and sort controls live under collapsed `Filters`. Identity Repair, Stale Source Provenance, and Possible Duplicates remain available below the card wall under collapsed `Library maintenance`, so diagnostics do not dominate quick review.

## Concept Library Duplicate Diagnostics

Possible Duplicate is a review signal, not merge permission. Each candidate shows both Concept titles, concise Core Meaning previews, and human-readable triggering reasons. Internal similarity scores may order candidates but are not presented as confidence. The learner can open either note, mark the pair `Not a duplicate`, or enter Guided Merge. Detection and dismissal never write Markdown.

`Merge Concepts` is a dedicated single-column workspace. It first asks for Concept A, Concept B, and the surviving stable identity. Manual search and a local shortlist are primary; optional AI inspection labels only the local shortlist and never selects a pair. `Start Manual Draft` combines the two Core Meaning and Why It Matters sections. `Draft with AI` may propose Title, Core Meaning, Why It Matters, and—only when enabled—an English Alias for the selected pair. The editor never shows an alias for an English merged Title; for a non-English Title it shows the optional alias field only when `Suggest English aliases` is enabled. Original Concepts are collapsed below the editor. `Merge Concepts…` builds a zero-write preview and opens a compact confirmation dialog with the impact summary and collapsed Before/After Markdown. Cancel returns directly to the editor; only the dialog's `Confirm Merge` action writes. Any Markdown or plugin-state change after preview still blocks stale execution. Success offers `View Merged Concept`, `Review Merged Cards`, and `Merge Another Pair`.

## Concept Library Stale Source Repair

Stale Source Provenance is a review queue for approved relationships whose Source file is missing. Each item shows the Concept, last known Source path, relation, and evidence count. `Relink Source` asks for the replacement Markdown path, then previews the Concept.md Before/After and preserved provenance. Only `Confirm Relink`, enabled after the learner checks the review acknowledgement, writes. A changed Concept, replacement Source, or plugin state invalidates the preview.

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

The proposal detail modal is the Review Gate. It lets the learner read, edit, and approve or reject one proposed knowledge change. For a new Concept proposal, an English Title never shows a redundant alias field. A non-English Title shows the optional `English Alias` field only when `Suggest English aliases` is enabled, and a Title change clears a stale edited alias.

Preferred order:

1. Source / Target metadata when applicable
2. Editable Concept or Card content
3. Source Evidence for Concept proposals, or Concept Grounding for Card proposals
4. Validation status
5. Advanced / Raw JSON
6. Bottom actions

For a new Concept proposal, editable learning fields appear in this order: Concept title, Core Meaning, Why It Matters, Learning Mode, Importance, and Tags. Concept title uses the same block-like editable field family as Core Meaning and Why It Matters, but is visually larger to read as the Concept's heading rather than ordinary metadata. `Core Meaning` explains what the Concept is and its defining mechanism. `Why It Matters` explains why it is useful, when it matters, or what problem it helps solve. The corresponding proposal fields are `coreMeaning` and `whyItMatters`.

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

`Create Concept` is available from the command palette and Concept Library. It opens a dockable right-sidebar View so the learner can keep the Source Note visible while writing. When the Composer has no meaningful saved draft, the ordinary Markdown note active at opening becomes Source Note by default. Mneme Concept and Card files are never default sources. The selected source is a draft value and does not silently follow later active-file changes; `Use Current Note` explicitly replaces it and `Clear` creates a source-free Concept.

The primary form shows Source Note, Title, Core Meaning, Why It Matters (optional), Learning Mode, Importance, Tags, and Create Concept. English Alias is disabled by default and optional when enabled. An English Title always keeps it hidden; local script detection reveals it after Tags only for a non-Latin Title when `Suggest English aliases` is on. The learner may enter it manually. A right-aligned `Generate with AI` action becomes available only after Title and Core Meaning are complete and an AI provider is configured; clicking it sends only those two fields and fills an editable suggestion. Title changes never call AI automatically and clear the previous alias so a stale translation cannot silently survive. Alias availability never blocks manual Concept creation. Learning Mode, Importance, and Tags are basic Concept metadata and must remain directly visible, with Reviewable and Normal defaults. Tags use a local multi-select picker: approved tags are recommended by Title/Core Meaning relevance and existing usage, while the learner may search or create a new English lowercase slug. Selecting a new tag that resembles an existing tag shows an explicit `Use existing` suggestion; Mneme never replaces it silently. The UI recommends one to three useful tags without enforcing a manual-authoring quota. Draft fields auto-save in plugin data and survive closing the View. `Cmd/Ctrl+Enter` invokes the same guarded creation action as the button. After creation, learning fields clear while Source Note remains selected for extracting another Concept from the same note. The Composer scrolls to the top and shows one temporary success banner beneath its heading. `View Concept` is the primary action; `Open Concept Markdown` is a directly visible secondary action. The banner represents only the most recently created Concept and disappears when the learner starts editing the next one.

Title and Core Meaning are required. At the final write gate, an exact Title, optional English Alias, or Markdown-path match opens `Concept Name Conflict` with the existing and incoming names and four decisions: `Merge`, `Refine Name`, `Keep Both`, or `Cancel`. `Merge` opens a draft-based zero-write workspace; it does not create the incoming Concept, allocate an identity or path, or clear the Composer draft before final confirmation. `Merge Concepts…` builds the current zero-write plan and opens the same compact confirmation dialog used by Guided Merge. `Back to Conflict Options`, Cancel, closing the confirmation dialog, and closing the Merge workspace return without writing. `Refine Name` returns focus to Title, and any Title change clears the previous optional alias. `Keep Both` preserves Title and identity while allocating a `-2`, `-3`, or later Markdown path and Card Group locator only when the path is occupied. A similar-but-not-exact Concept remains a non-blocking Possible Duplicate and must be reviewed before `Create Anyway` becomes available. Saving without a conflict writes immediately approved user-authored knowledge with a stable random ID and Card Group link; it does not create an Inbox proposal.

AI Concept proposals use the same exact-collision gate only when the learner presses Accept. Generation itself remains context-free. A conflict decision must not approve, stale, remove, or write the Inbox proposal until the selected resolution succeeds. `Refine Name` keeps Proposal Review open. `Keep Both` continues the ordinary write queue. `Merge` opens the dedicated draft-based Merge workspace with the existing Concept and incoming Proposal preloaded. Back or close leaves the Proposal actionable in Inbox; final confirmation updates the existing Concept and only then completes the Proposal.

Manual and AI-accepted Concepts use the same Markdown renderer. `Source Notes` is optional in that canonical format: a selected source writes the standard section and approved provenance index; no source omits the section entirely rather than writing an empty heading or placeholder.

The creation action is single-flight from preflight duplicate scanning through the committed Markdown/provenance write. Once that commit succeeds, draft-reset or dependent-view refresh failures are reported as secondary UI errors and must never tell the learner that Concept creation itself failed.

## Card Composer View

`Create Card` is available from the command palette and from View Concept for an approved Concept. It is not a persistent action on Concept Library cards, whose single visible learning action remains `Review Cards` or `Generate to Review`. It opens a dockable right-sidebar View so the Concept can remain visible while the learner writes. The form order is Concept, Card Type, Front, Back, optional Rubric, then Create Card. Card Type uses Mneme's nine built-in types and appears before the learning content because it defines what kind of retrieval the Card tests.

Front and Back are required. The draft auto-saves in plugin data and survives closing the View. `Cmd/Ctrl+Enter` invokes the same single-flight write as the button. Saving writes directly to the Concept's declared Card Group using canonical markers and the shared random Card ID allocator; direct learner authorship does not enter Inbox. After creation, Concept remains selected, Card Type returns to Definition, content fields clear, and a temporary success banner offers `View Concept` and `Open Cards Markdown`.

AI-generated Card proposals follow a different rule: Card Type is visible but read-only in Proposal Review. Reviewers may correct Front, Back, and Rubric. A semantically wrong type should be rejected rather than silently reclassified after generation.

## Settings

Current settings:

- Concepts folder
- Cards folder
- Show Today’s Focus
- Global Retention Target
- Enable fuzz
- Maximum interval
- Show advanced diagnostics (default off, under Developer Tools)
- LLM provider settings

`Advanced Diagnostics` is a maintenance and repair surface, not part of the daily recall loop. It remains hidden by default. Enabling `Show advanced diagnostics` reveals raw due/new/later/invalid counts, scheduling state, repair controls, archived Cards, and deleted-Card tombstones at the bottom of Mneme Review. Changing this visibility setting must not alter Card Markdown, FSRS state, review history, or Today’s Focus eligibility.

When Today’s Focus is empty, the hint `Use Advanced Diagnostics to inspect future cards.` is shown only while Advanced Diagnostics is enabled. With diagnostics disabled, the empty state contains only `No cards due right now.`

Importance does not silently change FSRS desired retention. Mneme may use Importance to rank already-eligible Concepts, but FSRS keeps a global Retention Target unless the learner intentionally chooses a separate scheduling override.

## Exploratory Concepts

Exploratory concepts:

- Generate Concept.md
- Do not generate Cards
- Do not enter FSRS
- Do not enter Today’s Focus
- May be shown by a future stateless `Rediscover a Concept` entry point without creating new learning state

`Rediscover a Concept` is evidence-gated and is not part of the current roadmap.
