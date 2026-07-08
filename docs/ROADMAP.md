# Roadmap

## v0.1: Manual Concept Review MVP

Goal:

Prove the core loop:

Analyze Current Note
→ Concept Suggestions
→ Inbox Approval
→ Concept.md / Card.md
→ FSRS Review
→ Concept-based Review

Features:

- Analyze Current Note
- Hash-based skip
- AI Capture settings and provider adapter infrastructure for Mock, OpenAI, and DeepSeek
- Structured AI proposal schema validation
- Generate Cards from Current Concept
- Card proposals generated only from written Concepts
- Concept Suggestions JSON
- Runtime schema validation
- Inbox approval
- Concept.md generation
- Card.md generation
- Card marker parsing
- Review View
- Show Answer
- Again / Hard / Good / Easy
- Edit Card
- View Source
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
- Duplicate detection and Guided Merge remain unfinished. AI may flag Possible Duplicates, but written Concepts cannot be merged through one-click Inbox acceptance.
- Duplicate markers, malformed wrappers, and stable-ID conflicts still require the broader Repair Flow.

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
- Global retention settings already affect future FSRS reviews. An explicit Concept override and workload warning remain unfinished.
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
- Missing or duplicate Concept ID repair remains unfinished.

## v1.0: Stable Concept Review Plugin

Goal:

A stable Obsidian plugin for concept-centered review.

Includes:

- Stable Analyze Current Note
- Stable Inbox
- Stable Concept.md / Card.md format
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
- View Source
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
