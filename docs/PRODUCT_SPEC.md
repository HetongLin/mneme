# Product Spec

## Product Name

Mneme

## One-line Definition

Mneme is a concept-centered learning layer for Obsidian.

## Target Users

Mneme is designed primarily for university students who use Obsidian to manage course notes, reading notes, exam notes, and long-term knowledge.

## Core Problem

Students often write notes but fail to convert them into durable memory.

Existing workflows have several problems:

- Notes are easy to accumulate but hard to review.
- AI summaries are useful once but do not become a long-term learning system.
- Flashcard generators often create too many low-quality cards.
- Anki-style review can create psychological pressure and review debt.
- Course learning needs structure, but Obsidian notes are often fragmented.

## Product Goal

Mneme helps students turn their own notes into editable Concepts and Cards, then review them through a low-pressure concept-centered review flow.

## Product Positioning

Mneme is not:

- a generic AI chat plugin
- a simple AI flashcard generator
- a full Anki replacement
- a PDF/PPT parser in v0.1
- a fully automatic learning agent

Mneme is:

- an Obsidian-native concept review plugin
- a Markdown-first learning system
- a bridge between notes and active recall
- a low-pressure review layer
- a foundation for future AI-native learning workflows

## Core Objects

### Source Note

A user-written Obsidian Markdown note.

Examples:

- course notes
- lecture notes
- reading notes
- exam review notes
- mistake notes

### Concept

A durable learning object directly authored or explicitly approved by the student.

A Concept is a vault-global knowledge model or principle that can be explained, applied, and assessed independently. Courses reference Concepts many-to-many instead of owning separate copies.

Examples:

- Information Gain
- Equivalence Partitioning
- Thread Safety
- Binary Tree Threading
- Pipeline Data Hazard

### Card

A test item for a Concept.

A Card tests one independently rateable learning outcome grounded in an approved Concept. It may test transfer into a new scenario, but it cannot introduce unapproved knowledge through its answer or rubric.

### Concept Suggestion

A structured AI-generated proposal shown in Inbox before being committed.

### Knowledge Proposal

A structured proposal record produced by AI or developer fixtures and reviewed in Inbox.

Initial AI capture is concept-first. Source Note analysis may propose Concept-stage changes only; Cards are generated later from written Concept Markdown and require their own review before Card Markdown is written.

Manual Concept creation is a first-class product capability. `Create Concept` opens a dockable Composer beside the current Source Note and writes the same clean approved Concept format as AI acceptance, without manufacturing a proposal or asking the student to approve their own authorship. Source provenance is optional: the current ordinary Markdown note initializes an empty draft, while a source-free Concept omits the Source Notes section and provenance link entirely.

## Core Workflow

1. User opens a Source Note.
2. User clicks Analyze Current Note.
3. Mneme checks whether the note changed using hash.
4. If changed, Mneme sends the note to AI.
5. AI returns Concept Suggestions as JSON.
6. Mneme validates JSON with a runtime schema.
7. Suggestions appear in Inbox.
8. User accepts, edits, rejects, links, or updates each reviewed proposal.
9. Accept & Next auto-saves the current reviewed fields, then writes the reviewed Concept.md.
10. User runs Generate Cards from Current Concept.
11. AI returns Card proposals derived from the written Concept.
12. User reviews and accepts Card proposals before Card Markdown is written.
13. If FSRS scheduling is enabled, FSRS schedules Cards.
14. Review View groups every eligible due or new Card by Concept.
15. User reviews through Today’s Focus. If scheduling is disabled, Concept Library remains available while review state and history are preserved.

Current implementation note:

Analyze Current Note indexes the Source Note and, when AI Capture is enabled, asks the selected Mock, OpenAI, or DeepSeek provider for Concept-stage proposals. DeepSeek uses its OpenAI-compatible chat-completions endpoint, while OpenAI uses the Responses API. Provider output remains untrusted until it passes Mneme's structured proposal validation and normalization into `KnowledgeProposal`. The command stores valid proposals in Inbox and never writes Markdown directly.

AI prompts are layered. Mneme owns the protocol layer and product policy layer: JSON shape, proposal kinds, fixed field names, required evidence, language contract, source/hash identity, Concept-first flow, and supported enum values are not user-editable. Settings may expose only a style guidance layer for Concept and Card generation. Style guidance can change wording, emphasis, difficulty, and selection preferences inside fixed fields, but it cannot rename or remove fields such as Core Meaning, Why It Matters, Front, Back, Rubric, learning mode, importance, tags, evidence, or `cardType`.

Generate Cards from Current Concept works only from a written Mneme Concept Markdown file. It sends assessable Concept content plus existing Card fronts as a Coverage Map, accepts only `new_card` responses, and stores validated Card proposals in Inbox. An accepted Card appends one independently identified block to the Concept's Card Group.

Analyze Current Note is for ordinary Markdown Source Notes, not written Mneme Concepts or Mneme's internal Concept/Card files. Running Source Note analysis on an approved or internal artifact would re-treat Mneme output as raw input and can create circular or duplicate proposals, so Mneme excludes the command in those contexts and retains a runtime guard.

Current-note commands follow the active note: Source Notes offer Concept analysis, reviewable Concepts offer Card generation and Card opening, and exploratory Concepts offer only Card opening. Irrelevant commands stay out of the command palette so the student sees actions that can produce a valid result.

Card generation is coverage-driven and bounded to at most five proposals per run. Each proposal identifies the approved Concept claim or section it tests. If generation reveals missing knowledge, Mneme proposes a Concept update first rather than inserting new knowledge into a Card.

Card generation uses a generation fingerprint based on the assessable Learning Content plus Card generation policy/style, rather than a whole-file hash. Presentation, tag, provenance, and navigation edits do not unlock a duplicate round; changing Card style guidance can unlock a new generation attempt after existing proposals are resolved. Active Card proposals for the same learning content still block repetition, and a `coverage_complete` result for the same generation fingerprint blocks another round.

Concept Library is a dockable Obsidian View opened in the main workspace for quick browsing and review. Each Concept card shows only its title and Core Meaning, while management actions and diagnostics stay collapsed. Its `More` menu separates daily learning actions from source maintenance: `View Concept` opens Mneme's rendered editable Concept surface, `Review Cards` starts Concept-scoped Card review over all valid Cards in that Concept, and raw Markdown/file operations live under `Source Files`. `Open Concept Markdown` is reserved for the raw Markdown source file. If a Concept has no Card group, `Review Cards` prompts `Generate to Review` when generation is allowed. Concept-scoped Card review is manual, is not limited to due/new Cards, and still updates FSRS memory.

Today’s Focus is the Concept-grouped view over the complete FSRS-eligible queue. Mneme applies no daily Concept, daily Card, or per-Concept Card cap after FSRS. Priority changes ordering only. Explicit Review Later, pause, suspension, retirement, deletion, validity, stable-ID, and exploratory-Concept rules may still exclude a Card without changing its FSRS due date.

Scheduled Review is optional. Turning it off hides Today’s Focus and its rating controls, but the FSRS memory engine remains active. Concept Library browsing and authoring still do not count as review, while Concept Library `Review Cards` continues to record manual FSRS ratings. Turning Scheduled Review back on makes all currently due and new Cards eligible and continues `ts-fsrs` from the real review history.

Concept `importance` contributes a small, explicit weight to Today’s Focus ranking so must-master knowledge wins ties and near-ties. A bounded rotation boost prevents long-unseen eligible Concepts from starving. Neither mechanism changes Card eligibility, due dates, or FSRS scheduling parameters.

Exploratory Concepts remain outside Today’s Focus even if a legacy or manually created Card file exists. Mneme keeps those Cards and any historical FSRS state intact, but treats them as diagnostic-only until the Concept is changed back to reviewable.

User experience is the first requirement. Internal schemas can be strict and detailed, but primary user surfaces should stay concise. Concept notes should read like learning notes, not exported database records.

## Product Contracts

- Concept and Card state is keyed only by immutable IDs; file paths are mutable locators.
- AI knowledge changes must pass an individual Review Gate. Unseen proposals cannot be bulk accepted; direct student authorship needs no artificial gate.
- Concept Learning State is a reasoned aggregate of Card evidence, coverage, and student input. Mneme does not claim a mastery percentage.
- FSRS owns Card scheduling only. Exam Attempts, Use activity, Concept ranking, and AI Rating Suggestions cannot update FSRS without an explicit normal Card review and user-confirmed rating.
- Importance expresses long-term knowledge value and is independent of the global FSRS Retention Target.
- A Concept-specific Retention Target exists only when the student explicitly sets it. It affects future FSRS rating transitions for that Concept's Cards, never existing due dates, eligibility, or priority; clearing it restores the global target.
- Source provenance survives Source deletion as stale evidence until the student explicitly relinks or removes it.
- Possible Duplicates require a Guided Merge with a final diff; the merged path becomes a Redirect Note.
- Anki interoperability is a one-way UTF-8 TSV export of active valid approved Cards. Exported cards are independent copies with no sync.
- Use Mode is project-based. Its first increment is a neutral Knowledge Context Pack containing approved Concepts for an external agent; approved does not mean mastered.
- Future Card customization should prefer enabling/disabling Mneme's supported built-in `cardType` values over arbitrary user-defined types. Arbitrary type names would weaken parser, review, analytics, and export compatibility.
- Manual Card creation is a planned first-class capability: students should be able to create a Card for an existing Concept without AI and write it directly to that Concept's Card Group using the same stable Card format.
- AI scanning is an accelerator, not the only Concept entry path. Manual Concept creation must exist so students can decide what knowledge matters even when AI extraction is incomplete or unwanted.

## v0.1 Goal

The v0.1 goal is to prove both the AI-assisted and direct-authoring entry paths into the core loop:

AI suggests Concepts and Cards, or the student authors a Concept directly
→ User approves AI proposals
→ Markdown files are created
→ Cards are reviewed through FSRS
→ Review is grouped by Concept

## v0.1 Features

- Analyze Current Note
- Hash-based skip
- Concept Suggestions JSON
- Runtime schema validation
- Inbox approval
- Concept.md generation
- Manual Concept creation
- Card Group generation
- Card marker parsing
- Review View
- Show Answer
- Again / Hard / Good / Easy
- Edit Card
- Edit the current Card without changing FSRS state
- Open Concept
- Skip without changing FSRS state
- FSRS card scheduling
- Concept-based grouping

## v0.1 Non-goals

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

## Long-term Vision

Mneme may eventually become an AI-native learning system for university students.

Future directions:

- Random Concept Draw
- Course-scoped Concept Draw
- Exploratory Concepts
- AI answer grading
- Needs Work Signal tracking
- Exam review mode
- PPT/PDF ingestion
- Mistake diagnosis
- Learning analytics
- Cross-course concept graph
- Local model support
