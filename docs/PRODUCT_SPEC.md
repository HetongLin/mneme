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

A durable learning object extracted from Source Notes.

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

Initial AI capture is concept-first. Source Note analysis may propose Concept-stage changes only; Cards are generated later from written `Concept.md` and require their own review before `Card.md` is written.

## Core Workflow

1. User opens a Source Note.
2. User clicks Analyze Current Note.
3. Mneme checks whether the note changed using hash.
4. If changed, Mneme sends the note to AI.
5. AI returns Concept Suggestions as JSON.
6. Mneme validates JSON with a runtime schema.
7. Suggestions appear in Inbox.
8. User accepts, edits, rejects, links, or updates each reviewed proposal.
9. Accept Concept writes Concept.md.
10. User runs Generate Cards from Current Concept.
11. AI returns Card proposals derived from the written Concept.
12. User reviews and accepts Card proposals before Card.md is written.
13. FSRS schedules Cards.
14. Review View groups due Cards by Concept.
15. User reviews through Today’s Focus.

Current implementation note:

Analyze Current Note indexes the Source Note and, when AI Capture is enabled, asks the selected Mock, OpenAI, or DeepSeek provider for Concept-stage proposals. DeepSeek uses its OpenAI-compatible chat-completions endpoint, while OpenAI uses the Responses API. Provider output remains untrusted until it passes Mneme's structured proposal validation and normalization into `KnowledgeProposal`. The command stores valid proposals in Inbox and never writes Markdown directly.

Generate Cards from Current Concept works only from a written Mneme `Concept.md`. It sends that approved Concept to the selected provider in `card_generation` mode, accepts only `new_card` responses, and stores validated Card proposals in Inbox. `Card.md` is written only after the user accepts an individual Card proposal.

Card generation is coverage-driven and bounded to at most five proposals per run. Each proposal identifies the approved Concept claim or section it tests. If generation reveals missing knowledge, Mneme proposes a Concept update first rather than inserting new knowledge into a Card.

Concept Library also exposes Generate Cards for reviewable Concepts. Exploratory Concepts intentionally omit this action and remain outside Card/FSRS review.

Today’s Focus is a bounded view over the ranked review queue. User-configured Concept and Card limits apply after priority ranking and include Cards already reviewed that local day; items outside the focus keep their FSRS state unchanged and remain available through diagnostics rather than appearing as debt.

Concept `importance` contributes a small, explicit weight to Today’s Focus ranking so must-master knowledge wins ties and near-ties. It does not change Card eligibility, due dates, or FSRS scheduling parameters.

Exploratory Concepts remain outside Today’s Focus even if a legacy or manually created Card file exists. Mneme keeps those Cards and any historical FSRS state intact, but treats them as diagnostic-only until the Concept is changed back to reviewable.

User experience is the first requirement. Internal schemas can be strict and detailed, but primary user surfaces should stay concise. Concept notes should read like learning notes, not exported database records.

## Product Contracts

- Concept and Card state is keyed only by immutable IDs; file paths are mutable locators.
- AI knowledge changes must pass an individual Review Gate. Unseen proposals cannot be bulk accepted.
- Concept Learning State is a reasoned aggregate of Card evidence, coverage, and student input. Mneme does not claim a mastery percentage.
- FSRS owns Card scheduling only. Exam Attempts, Use activity, Concept ranking, and AI Rating Suggestions cannot update FSRS without an explicit normal Card review and user-confirmed rating.
- Importance expresses long-term knowledge value and is independent of the global FSRS Retention Target.
- Source provenance survives Source deletion as stale evidence until the student explicitly relinks or removes it.
- Possible Duplicates require a Guided Merge with a final diff; the merged path becomes a Redirect Note.
- Anki interoperability is a one-way UTF-8 TSV export. Exported cards are independent copies with no sync.
- Use Mode is project-based. Its first increment is a neutral Knowledge Context Pack containing approved Concepts for an external agent; approved does not mean mastered.

## v0.1 Goal

The v0.1 goal is to prove the core loop:

AI suggests Concepts and Cards
→ User approves
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
- Card.md generation
- Card marker parsing
- Review View
- Show Answer
- Again / Hard / Good / Easy
- Edit Card
- Edit the current Card without changing FSRS state
- View Source
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
