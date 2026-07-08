# Codex Brief

## Purpose

This document explains how Codex should understand and work on the Mneme project.

Mneme is still in the early design and initialization stage. Many ideas in the documentation are provisional. The docs are intended to provide context and direction, not rigid commands.

Codex may propose changes to the product design, architecture, data model, file layout, or task sequence if there is a clear engineering reason.

However, changes must be explicit, justified, and documented.

---

## Project Summary

Mneme is an Obsidian-native concept review plugin for university students.

It turns user-written Markdown notes into editable Concepts and Cards. AI may generate structured suggestions, but users must review, edit, and approve before anything is committed.

Mneme is not intended to be:

- a generic AI chat plugin
- a simple AI flashcard generator
- an Anki clone
- a fully automatic learning agent in v0.1

Mneme is intended to be:

- a concept-centered learning layer for Obsidian
- a Markdown-first review system
- a low-pressure alternative to review-debt-heavy flashcard workflows
- a foundation for future AI-native learning workflows

---

## Current Core Workflow

The current proposed workflow is:

Source Note
→ Analyze Current Note
→ Concept Suggestions
→ Inbox Approval
→ Concept.md / Card.md
→ FSRS Card Scheduling
→ Concept-based Review

This workflow is the current baseline, but Codex may suggest improvements if the implementation becomes unnecessarily complex.

---

## Important Product Principles

These principles are relatively stable:

1. AI generates; humans approve.
2. Concept is the primary learning object.
3. Card is a testing tool for a Concept.
4. Markdown should remain the source of truth for user-facing learning content.
5. data.json should store state, indexes, hashes, pending suggestions, FSRS state, logs, and caches.
6. Do not silently discard user content.
7. Keep user-facing UI labels in English.
8. The product should feel low-pressure and should avoid review debt language.

These principles should not be changed casually.

---

## Flexible Design Areas

The following areas are still open to revision:

- Exact data model shape
- Concept.md frontmatter fields
- Card.md frontmatter fields
- Card marker format details
- Folder layout inside the vault
- Service/module names under src/
- Exact Review View implementation
- Exact Inbox UI implementation
- Whether some features should move to later versions
- Task order in docs/TASKS.md
- Whether some docs should be split, merged, or simplified
- Whether v0.1 scope needs to be smaller

Codex may modify these if the change improves maintainability, correctness, or implementation simplicity.

---

## Strict Areas

The following areas require caution:

### Content Source of Truth

Do not make data.json the only source of truth for Concept or Card content.

Concept.md should remain the source of truth for concept content.

Card.md should remain the source of truth for review UI content.

### AI Output

Do not let AI output directly write final Markdown files.

AI output should be validated and shown in Inbox before committing.

### Review State

FSRS state belongs to Cards.

Concept Learning State should aggregate Card evidence, assessment coverage, and explicit student signals without claiming mastery or scheduling a Concept as if it were a Card.

### UI Language

All product UI labels should be English.

### Scope

Do not implement v1+ features while working on v0.1 unless explicitly asked.

---

## Current v0.1 Goal

The v0.1 goal is to prove the smallest useful loop:

1. Read or create a Card.md.
2. Parse its marker sections.
3. Render it in Review View.
4. Show Front.
5. Reveal Back and Rubric after Show Answer.
6. Apply Again / Hard / Good / Easy.
7. Persist review state.
8. Group cards by Concept.

AI extraction and Inbox are important, but the first stable implementation should prioritize the Markdown card format, parser, Review View, and FSRS state.

---

## Suggested Implementation Order

Recommended order:

1. Clean plugin skeleton.
2. Establish src/ structure.
3. Implement Card marker parser.
4. Implement static Review View.
5. Load Card.md from vault.
6. Add FSRS service.
7. Persist review state in data.json.
8. Group due cards by concept_id.
9. Add Card Edit Modal.
10. Add Source Hash Service.
11. Add ConceptSuggestion schema.
12. Add Inbox MVP.
13. Add Concept.md and Card.md writers.

Codex may suggest a different order if it explains why.

---

## How Codex Should Work

Before coding, Codex should read:

- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/DATA_MODEL.md
- docs/UI_SPEC.md
- docs/ROADMAP.md
- docs/TASKS.md
- docs/CODEX_BRIEF.md

For Obsidian API questions, inspect:

- ../../references/obsidian/obsidian-sample-plugin
- ../../references/obsidian/obsidian-api

For FSRS questions, inspect:

- ../../references/libraries/ts-fsrs

For engineering workflow references, inspect:

- ../../coding-skills/superpowers
- ../../coding-skills/mattpocock-skills
- ../../coding-skills/addyosmani-agent-skills
- ../../coding-skills/code-review-skill

---

## Required Behavior During Tasks

For each task, Codex should:

1. Restate the task.
2. Identify relevant docs.
3. Propose a short implementation plan.
4. Keep the change small.
5. Avoid unrelated refactors.
6. Run typecheck/build when possible.
7. Explain changed files.
8. Explain how to test manually in Obsidian.
9. Mention limitations or follow-up tasks.

---

## How to Modify Docs

Codex may modify docs when:

- implementation reveals a better data model
- a task is too large and should be split
- a feature should be postponed
- a rule is too rigid or unrealistic
- terminology is inconsistent
- the current docs conflict with each other

When modifying docs, Codex should:

1. Explain what changed.
2. Explain why.
3. Preserve the original product intent.
4. Avoid silently deleting major design ideas.
5. Move future ideas to ROADMAP instead of removing them.

---

## Documentation Status

The current docs are initial planning documents.

They should be treated as:

- project context
- engineering guidance
- product direction
- baseline assumptions

They should not be treated as:

- final API contracts
- immutable specifications
- complete implementation details
- exhaustive product requirements

---

## Current Decision: Concept-first Extraction

Earlier designs considered a Knowledge Unit layer.

Current v0.1 direction is Concept-first extraction:

Source Note
→ Concept Suggestions
→ Inbox Approval
→ Concept.md / Card.md

Reason:

University course notes are often relatively discrete. Explicit Knowledge Units may add token cost and review complexity before they are necessary.

Knowledge Units may return later if Mneme needs more advanced source tracing, concept evolution, or cross-course knowledge graphs.

---

## Current Decision: Low-pressure Review

Mneme should avoid becoming a review debt system.

Prefer:

- Today’s Focus
- Later
- Needs Attention
- Weak Concepts

Avoid:

- Debt
- Failed
- Missed
- Overdue overload

Review workload should eventually be controlled by limits such as:

- Daily Concept Limit
- Daily Card Limit
- Cards per Concept Limit
- Pause Concept
- Review Later

These workload controls do not all need to be implemented in v0.1.

---

## Current Decision: Exploratory Concepts

Mneme should support exploratory concepts in the future.

Exploratory concepts:

- generate Concept.md
- do not generate Cards
- do not enter FSRS
- do not enter Today’s Focus
- may enter Random Concept Draw later

This is not required for v0.1.

---

## Current Decision: Course Draw

Mneme may later support Course Draw.

Course Draw lets students select a Course context and review from its many-to-many pool of vault-global Concepts.

This is intended for university final exam review.

This is not required for v0.1.

---

## First Recommended Coding Task

Start with:

Task 003: Card Marker Parser

Reason:

It is isolated, testable, central to the data model, and does not require AI or complex Obsidian UI.

The parser should:

- parse FRONT
- parse BACK
- parse RUBRIC
- return structured content
- return validation errors instead of throwing
- tolerate extra Markdown outside markers
- mark missing FRONT or BACK as invalid

## How to Use External Skills

The workspace includes external coding-skill repositories under:

- ../../coding-skills/superpowers
- ../../coding-skills/mattpocock-skills
- ../../coding-skills/addyosmani-agent-skills
- ../../coding-skills/code-review-skill

These are reference materials for Codex. They are not part of the Mneme source code.

Codex should use them selectively:

### Planning and task decomposition

Use:

- ../../coding-skills/superpowers

When:

- starting a new implementation task
- splitting a large task
- deciding whether to revise the task order
- avoiding uncontrolled vibe coding

### TypeScript implementation quality

Use:

- ../../coding-skills/mattpocock-skills

When:

- writing TypeScript models
- writing services
- writing parsers
- writing validation logic
- improving type safety

### Production engineering and quality gates

Use:

- ../../coding-skills/addyosmani-agent-skills

When:

- reviewing architecture
- checking scope discipline
- adding verification steps
- preventing overengineering
- preparing implementation plans

### Code review

Use:

- ../../coding-skills/code-review-skill

When:

- after completing a task
- before committing
- checking for regressions
- checking whether the implementation violated AGENTS.md or docs

Codex should not blindly follow these external skills. They are supporting references. Mneme project docs and the current user request have higher priority.
