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
- AI Capture settings and provider adapter infrastructure
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

Non-goals:

- Automatic vault scanning
- PDF/PPT parsing
- Anki sync
- Connecting AI provider execution directly to Analyze Current Note before the approval boundary is complete
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
- Simple merge/update workflow
- Invalid Card repair flow
- Better Concept index

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

## v0.4: Importance and Retention Policy

Goal:

Use Concept importance to control review priority and desired retention.

Features:

- importance field
- desired retention by importance
- manual retention override
- concept priority ranking
- retention warning

Default mapping:

- low: 0.80
- normal: 0.85
- high: 0.90
- critical: 0.92

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
- Mark as Weak
- Promote to Review
- Generate Cards

## v1.2: Course Draw

Goal:

Support university final exam review by course folder.

Features:

- Select Course Folder
- Build Course Concept Pool
- Draw Concept
- Importance-weighted draw
- Weak concept priority
- Exam Review Mode

## v1.3: AI Answer Grading

Goal:

Grade typed answers using rubric.

Features:

- Type Answer
- AI Grade with Rubric
- Missing Points
- Suggested Rating
- Update Weak Targets

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
