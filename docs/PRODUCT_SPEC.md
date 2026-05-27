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

A Concept represents something the student should understand, recall, or revisit.

Examples:

- Information Gain
- Equivalence Partitioning
- Thread Safety
- Binary Tree Threading
- Pipeline Data Hazard

### Card

A test item for a Concept.

A Card is not the primary object. It is a tool for checking whether the Concept is remembered.

### Concept Suggestion

A structured AI-generated proposal shown in Inbox before being committed.

## Core Workflow

1. User opens a Source Note.
2. User clicks Analyze Current Note.
3. Mneme checks whether the note changed using hash.
4. If changed, Mneme sends the note to AI.
5. AI returns Concept Suggestions as JSON.
6. Mneme validates JSON with Zod.
7. Suggestions appear in Inbox.
8. User accepts, edits, rejects, merges, or updates.
9. Mneme writes Concept.md and Card.md.
10. FSRS schedules Cards.
11. Review View groups due Cards by Concept.
12. User reviews through Today’s Focus.

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
- Zod schema validation
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
- Weak concept tracking
- Exam review mode
- PPT/PDF ingestion
- Mistake diagnosis
- Learning analytics
- Cross-course concept graph
- Local model support