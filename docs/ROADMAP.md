# Roadmap

## v0.1: Manual Concept Review MVP

Goal:

Prove the core loop:

Analyze Current Note
→ Concept Suggestions
→ Inbox Approval
→ Concept.md
→ Generate Cards from written Concept
→ Card Proposals
→ Inbox Approval
→ Card Group
→ FSRS Review
→ Concept-based Review

Features:

- Analyze Current Note
- Create Concept
- Hash-based skip
- AI Capture settings and provider adapter infrastructure for Mock, OpenAI, and DeepSeek
- Structured AI proposal schema validation
- Generate Cards from Current Concept
- Card proposals generated only from written Concepts
- Concept Suggestions JSON
- Runtime schema validation
- Inbox approval
- Concept.md generation
- Card Group generation
- Card marker parsing
- Review View
- Show Answer
- Again / Hard / Good / Easy
- Edit Card
- Open Concept
- FSRS card scheduling
- Concept-based grouping

Non-goals:

- Automatic vault scanning
- PDF/PPT parsing
- Anki sync
- AI answer grading
- Auto highlight
- Full concept graph
- Random Concept Draw
- Course Draw
- Full agent loop
- Complex merge/split system

## v0.2: Editing and Update Flow

Goal:

Improve user control over AI output and existing Concepts.

Features:

- Better Card Edit Modal
- Basic Concept Edit Modal
- Update Existing Concept
- Possible Duplicate detection
- Guided merge/update workflow
- Invalid Card repair flow
- Better Concept index

Current progress:

- Structured Inbox editing is available for new Concepts, new Cards, and targeted Concept updates.
- Approved Concept updates safely replace only Core Meaning / Why It Matters and may append Views and Source Notes.
- Concept Library provides a conflict-aware editor for Core Meaning, Why It Matters, learning mode, and importance.
- Advanced Diagnostics can repair Cards whose FRONT or BACK section is entirely missing while preserving surrounding Markdown and FSRS state.
- Possible Duplicate detection and transactional Guided Merge are available from Concept Library; one-click Inbox merge remains forbidden.
- Duplicate markers, malformed wrappers, and stable-ID conflicts still require the broader Repair Flow.
- Manual Concept creation is available from the command palette and Concept Library. It writes an immediately approved clean Concept without creating a fake proposal or requiring Source Evidence.
- New accepted Cards append to one canonical Card Group per Concept. Legacy one-Card files remain readable.
- Card generation uses assessable-content fingerprints and existing Card fronts as a Coverage Map; rejected rounds may be retried without letting metadata edits create duplicate rounds.

## v0.3: Low-pressure Review

Goal:

Prevent Mneme from becoming a review debt system.

Features:

- Daily Concept Limit
- Daily Card Limit
- Cards per Concept Limit
- Pause Concept
- Suspend Card
- Review Later
- Today’s Focus
- Later queue

Current progress:

- Today’s Focus applies configurable daily Concept, daily Card, and Cards-per-Concept limits after priority ranking.
- Ranking includes a bounded rotation boost for long-unseen eligible Concepts, while Later remains visible as a calm availability count.
- Same-day review history is counted across refreshes, and cards outside the focus remain unchanged in Advanced Diagnostics.
- Review Later persists a Card-level deferral until the next local day without changing FSRS state.
- Pause Concept is persisted separately from FSRS and can be resumed from Advanced Diagnostics.
- Suspend Card is persisted separately from FSRS and can be resumed from Advanced Diagnostics.

## v0.4: Importance and Retention Policy

Goal:

Keep long-term Concept importance and FSRS retention policy explicit and independent.

Features:

- importance field
- global retention target
- explicit manual retention override
- concept priority ranking
- retention warning

Current progress:

- Written Concept importance now feeds an explicit low/normal/high/critical weight into Today’s Focus priority.
- Importance is visible in review details and does not modify Card FSRS state or eligibility.
- Global retention settings already affect future FSRS reviews, and the settings UI warns about review workload tradeoffs. An explicit Concept override remains unfinished.
- Importance must never silently change desired retention.

## v0.5: Exploratory Concepts

Goal:

Support low-stakes concepts that do not become review debt.

Features:

- learning_mode: exploratory
- card_policy: none
- review_policy: random_only
- Concept.md generation without Cards
- No FSRS scheduling
- No Today’s Focus push

Current progress:

- Concept generation and editing support `learning_mode: exploratory`.
- Card generation is unavailable for exploratory Concepts.
- Existing exploratory Cards are retained for diagnostics but excluded from Today’s Focus and FSRS review eligibility.

## v0.6: Identity, Provenance, and Repair

Goal:

Make Markdown movement, deletion, and repair safe before expanding into new modes.

Features:

- Stable Concept and Card IDs as the only durable state keys
- Missing and duplicate ID Repair Flow
- Invalid Card repair
- Stale Source provenance retention and relinking
- Card Retire, Delete, tombstone, and history erasure semantics
- Possible Duplicate detection and Guided Merge foundation

Current progress:

- Advanced Diagnostics can assign stable IDs to valid legacy Cards without wrappers and to Card blocks missing an ID.
- Fallback review state, Review Later, and suspension move to the new ID when ownership is unambiguous.
- Duplicate IDs can be replaced one block at a time; ambiguous shared history remains with the original ID instead of being guessed.
- Concept Library isolates missing and duplicate Concept IDs in an Identity Repair queue.
- Guided Concept repair synchronizes Concept.md and its explicitly linked Card Group, with rollback on conflict or persistence failure.
- Only uniquely attributable Concept pause state is re-keyed; duplicate-ID aggregate state is not guessed.
- Stable-ID Cards can be retired without changing Markdown or FSRS history, then restored from Advanced Diagnostics.
- Retired Cards are excluded from Today’s Focus, Concept Learning State risk, and ranking.
- Confirmed Card deletion removes only the selected Markdown block and clears active scheduling controls.
- Content-free review events and Card tombstones preserve statistical history and prevent ID reuse.
- `Delete History Too` is a separately confirmed complete-erasure path for a deleted Card's events and tombstone; default deletion preserves identity tombstones and global history clearing retains identity tombstones while zeroing their counts.
- Concept Library reports conservative Possible Duplicate pairs with explainable title/Core Meaning signals.
- `Not a duplicate` decisions persist by stable Concept pair and remain reversible.
- Possible Duplicate detection and dismissal never write Markdown.
- Guided Merge requires survivor selection, editable final Markdown, every-file preview, and explicit confirmation.
- Confirmed merges preserve Card IDs/FSRS history, migrate provenance and aggregate controls, leave Redirect Notes, and reserve merged Concept IDs.
- Concept Library surfaces retained stale Source provenance and offers a reviewed Guided Relink.
- Guided Relink preserves relation/evidence, updates readable Source Notes and indexes transactionally, and does not count as AI analysis.
- Reviewed Removal lets the student permanently discard one stale relationship, while preserving readable/index associations still used by other relations.

## v1.0: Stable Concept Review Plugin

Goal:

A stable Obsidian plugin for concept-centered review.

Includes:

- Stable Analyze Current Note
- Stable Inbox
- Stable Concept and Card Group Markdown formats
- FSRS review
- Concept-based Today’s Focus
- Edit Card
- Edit Concept
- Importance policy
- Low-pressure workload control
- Exploratory concepts
- Basic Concept Manager

## v1.1: Random Concept Draw

Goal:

Low-pressure random concept activation.

Features:

- Draw Concept
- Show Concept
- Open Concept
- Mark as Known
- Mark as Needs Work
- Promote to Review
- Generate Cards

## v1.2: Course and Exam Mode

Goal:

Support university final exam review through Course contexts over vault-global Concepts.

Features:

- Define a Course context
- Build a Course-Concept pool over vault-global Concepts
- Draw Concept
- Course Priority and Exam Focus
- Needs Work Signal priority
- Exam Attempts isolated from FSRS

## v1.3: AI Answer Grading

Goal:

Grade typed answers using rubric.

Features:

- Type Answer
- AI Grade with Rubric
- Missing Points
- Suggested Rating
- User-confirmed final FSRS rating
- Update Needs Work Signals

## v1.4: Interoperability and Use Mode

Goal:

Activate approved knowledge outside Mneme without introducing sync complexity.

Features:

- One-way Anki UTF-8 TSV export
- Knowledge Context Pack export
- All approved Concepts by default
- Optional Course or manual Concept filtering
- External-agent project discovery
- Use Projects built from coherent Concept Sets

Current progress:

- Knowledge Context Pack export creates a neutral vault-local pack for external agents.
- Exported Concept files omit Source Notes and Review Cards sections and do not include Cards, FSRS state, review history, credentials, diagnostics, or a project request.
- One-way Anki TSV export creates isolated Card copies without syncing content, scheduling state, or review history.
- Optional Course/manual filtering remains unfinished.

## v2.0: AI-native Learning System

Goal:

Expand beyond an Obsidian review plugin.

Possible features:

- PDF/PPT ingestion
- Course planning
- Exam-oriented review
- Mistake diagnosis
- Learning analytics
- Cross-course concept graph
- Local model support
- Standalone learning agent
