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
- Broader multi-Concept merge and Concept split system (two-Concept Guided Merge is implemented)

## v0.2: Editing and Update Flow

Goal:

Improve user control over AI output and existing Concepts.

Features:

- Better Card Edit Modal
- Basic Concept Edit Modal
- Update Existing Concept
- Possible Duplicate detection
- Broader update workflow (two-Concept Guided Merge is implemented)
- Invalid Card repair flow
- Better Concept index

Current progress:

- Structured Inbox editing is available for new Concepts, new Cards, and targeted Concept updates.
- Approved Concept updates safely replace only Core Meaning / Why It Matters and may append Views and Source Notes.
- Concept Library provides a conflict-aware editor for Core Meaning, Why It Matters, learning mode, and importance.
- Advanced Diagnostics can repair Cards whose FRONT or BACK section is entirely missing while preserving surrounding Markdown and FSRS state.
- Possible Duplicate detection and transactional Guided Merge are available from Concept Library; one-click Inbox merge remains forbidden.
- Duplicate markers, malformed wrappers, and stable-ID conflicts still require the broader Repair Flow.
- Manual Concept creation is available from the command palette and Concept Library through a dockable, auto-saving Concept Composer. It can retain the current Source Note as approved provenance or create a clean source-free Concept without manufacturing a proposal or requiring Source Evidence.
- New accepted Cards append to one canonical Card Group per Concept. Legacy one-Card files remain readable.
- Card generation uses assessable-content fingerprints and existing Card fronts as a Coverage Map. Any successful generation call closes that fingerprint: resolving or rejecting its proposals does not unlock another round until assessable Concept content changes. Provider failures remain retryable.

## v0.3: Low-pressure Review

Goal:

Prevent Mneme from becoming a review debt system.

Features:

- Optional FSRS scheduling
- Complete FSRS-eligible queue without secondary daily caps
- Suspend Card
- Review Tomorrow
- Archive Card
- Today’s Focus
- Later queue

Current progress:

- FSRS scheduling can be disabled without changing review state or history, then resumed with real elapsed time.
- Today’s Focus includes the complete eligible due/new queue; Concept priority changes order but no longer caps it.
- Ranking includes a bounded rotation boost for long-unseen eligible Concepts, while non-due Cards remain available in Advanced Diagnostics.
- Review Tomorrow persists a Card-level deferral until the next local day without changing FSRS state.
- Suspend Card is persisted separately from FSRS and can be resumed from Advanced Diagnostics.
- Archive Card preserves Markdown and FSRS history while excluding that Card until explicit restore.

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
- Global retention settings affect future FSRS reviews, and the settings UI warns about review workload tradeoffs.
- Edit Concept supports an explicit optional Retention Target override. Review Details show the effective policy, and the override is passed only into future normal Card ratings without rewriting existing due dates.
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
- Fallback review state, Review Tomorrow deferral, and suspension move to the new ID when ownership is unambiguous.
- Duplicate IDs can be replaced one block at a time; ambiguous shared history remains with the original ID instead of being guessed.
- Concept Library isolates missing and duplicate Concept IDs in an Identity Repair queue.
- Guided Concept repair synchronizes Concept.md and its explicitly linked Card Group, with rollback on conflict or persistence failure.
- Legacy Concept pause data may be re-keyed when ownership is unambiguous, but current Review ignores and clears it.
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
- Reviewed Removal lets the learner permanently discard one stale relationship, while preserving readable/index associations still used by other relations.

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

Current readiness:

- **The v1.0 product feature set is complete.** The v0.1 core loop, v0.2 editing flow, v0.3 low-pressure limits, v0.4 explicit retention policy, v0.5 exploratory policy, and v0.6 identity/provenance repair foundations are implemented.
- The complete automated suite and the macOS real-vault core Source → Concept → Card → FSRS loop pass against `1.0.0` metadata.
- Publication readiness is tracked separately in `V1_RELEASE_CHECKLIST.md`. Final clean-install packaging and Windows artifact validation are release work, not missing v1.0 product functionality, and are intentionally deferred until Mneme is prepared for distribution.

Supporting utilities already implemented:

- One-way Anki UTF-8 TSV export of independent Card copies
- Neutral Knowledge Context Pack export of approved Concepts
- Manual Card creation with built-in Card Types
- Optional AI assistance for bounded Concept and Card drafting

These are ordinary capabilities around the core loop, not separate learning modes.

## v1.1: Core Loop Friction and Cost

Goal:

Make the existing Note → Concept → Card → Review → Concept Library loop easier and cheaper to begin and maintain.

Candidate work must be driven by observed friction in real use. Current priorities are:

- clearer first-run and provider setup;
- transparent bounded AI request scope and failure recovery;
- fewer unnecessary transitions between capture, Inbox, Concept, and Review;
- continued review and authoring without AI availability;
- accessibility, performance, and reliability improvements on core surfaces.

This release does not add a new learning mode or durable state model.

## v1.2: Library Stewardship

Goal:

Keep a growing personal Concept Library understandable, searchable, and repairable without depending on AI.

Candidate features:

- reviewed Tag Manager operations for historical tag merges and renames;
- improved Concept search and filtering;
- clearer duplicate, identity, malformed Markdown, and stale provenance maintenance;
- manual Concept selection for Knowledge Context Pack export;
- large-library performance and navigation improvements.

Each candidate remains independently scoped and should be implemented only when its user problem and acceptance criteria are clear.

## Evidence-gated possibilities

A stateless `Rediscover a Concept` entry point may be reconsidered after real usage. It may show and open a Concept or enter that Concept's normal Card review, but it must not:

- create Known, Needs Work, attempt, or parallel scheduling state;
- bypass FSRS when a Card rating is recorded;
- call AI;
- become a separate mode.

Lightweight organization may be reconsidered only if Tags, search, Related Concepts, Obsidian organization, and manual export selection prove insufficient. It must not begin as Course Context or introduce a second priority or scheduling system.

## Outside the product direction

Mneme is a focused personal knowledge memory plugin. The following are not planned:

- Course Context and Course planning;
- Exam Mode, Exam Attempts, Exam Focus, and exam-oriented review;
- Use Mode, Use Projects, and project discovery;
- AI answer grading and Rating Suggestions;
- whole-vault AI reasoning or continuous chat;
- learning analytics as a competing product surface;
- a standalone or autonomous learning agent.
