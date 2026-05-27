# AGENTS.md

## Project

Mneme is an Obsidian-native concept review plugin for university students.

Mneme turns user-written Markdown notes into editable Concepts and Cards. AI may generate structured suggestions, but users must review, edit, and approve before anything is committed.

Mneme is not a generic AI chat plugin, not a simple flashcard generator, and not an Anki clone.

## Core Workflow

Source Note
→ Analyze Current Note
→ Concept Suggestions
→ Inbox Approval
→ Concept.md / Card.md
→ FSRS Card Scheduling
→ Concept-based Review

## Product Principles

- AI generates; humans approve.
- Concept is the primary learning object.
- Card is a testing tool for a Concept.
- Markdown is the content source of truth.
- Concept.md is the source of truth for concept content.
- Card.md is the source of truth for card content.
- data.json stores state, indexes, hashes, pending suggestions, FSRS state, logs, and caches.
- Do not duplicate Card front/back content in data.json.
- Do not let AI write final Markdown directly without Inbox approval.
- Keep all user-facing UI labels in English.
- The product should feel low-pressure. Avoid debt-like review language.

## Codex Brief

Before making significant changes, read `docs/CODEX_BRIEF.md`.

The current documentation contains early design decisions and provisional ideas. These documents are guidance, not immutable law. Codex may propose changes when there is a clear engineering or product reason, but changes must be explicit, justified, and documented.

## v0.1 Scope

Implement only:

- Analyze Current Note
- Hash-based skip
- Concept Suggestions JSON
- Schema validation with Zod
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

Do not implement in v0.1:

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

## Engineering Rules

- Use TypeScript.
- Follow Obsidian Plugin API conventions.
- Prefer small modules under src/.
- Do not place all logic in main.ts.
- Do not invent Obsidian APIs.
- If unsure, inspect local references or Obsidian API types.
- Preserve existing data formats.
- Never silently discard user content.
- Handle malformed Markdown and malformed JSON safely.
- Prefer explicit errors over hidden fallback behavior.
- Avoid broad refactors unless the task explicitly asks for them.

## Local References

When needed, inspect:

- ../../references/obsidian/obsidian-sample-plugin
- ../../references/obsidian/obsidian-api
- ../../references/libraries/ts-fsrs
- ../../coding-skills/superpowers
- ../../coding-skills/mattpocock-skills
- ../../coding-skills/addyosmani-agent-skills
- ../../coding-skills/code-review-skill
## External References and Skills Policy

The folders under `../../coding-skills/` are external engineering skill references.

They are not project source code. Do not modify them unless explicitly requested.

Use them as guidance when relevant:

- Use `../../coding-skills/superpowers` for spec-driven development, planning, small-step implementation, and review workflow.
- Use `../../coding-skills/mattpocock-skills` for TypeScript quality, maintainability, and frontend engineering practices.
- Use `../../coding-skills/addyosmani-agent-skills` for production-grade engineering, scope discipline, verification, and quality gates.
- Use `../../coding-skills/code-review-skill` for structured code review after implementation.

Codex does not need to read all external skills before every task.

Use them according to task type:

- Before a large or ambiguous task, inspect `superpowers`.
- Before TypeScript parser/service/model work, inspect `mattpocock-skills`.
- Before architecture or quality-sensitive changes, inspect `addyosmani-agent-skills`.
- After implementing a task, inspect `code-review-skill` and review the change.

If these references are too large, read their README first, then inspect only the relevant skill files.

## Data Model Rules

Concept.md is the source of truth for concept content.

Card.md is the source of truth for review UI content.

data.json may store:

- plugin settings
- source note hashes
- pending suggestions
- FSRS card state
- review logs
- concept mastery cache
- weak targets
- card validity cache

data.json must not be the source of truth for Concept or Card content.

## Card Marker Rules

Card.md must contain these marker sections:

- MNEME:FRONT
- MNEME:BACK
- MNEME:RUBRIC

If a card is invalid, do not crash. Mark it invalid and show a repair option.

## Review Behavior

Review View must behave like Anki:

1. Show Front.
2. User clicks Show Answer.
3. Show Back and Rubric.
4. Show Again / Hard / Good / Easy.
5. Rating updates FSRS state.
6. Move to the next card.

FSRS schedules Cards. Mneme groups due Cards by Concept.

Use low-pressure language.

Preferred labels:

- Today’s Focus
- Later
- Needs Attention
- Weak Concepts

Avoid:

- Debt
- Failed
- Missed
- Overdue overload

## AI Output Rules

AI must output JSON only.

The plugin must validate AI output with Zod before showing it in Inbox.

The plugin generates Markdown files from validated JSON.

User approval is required before committing.

The v0.1 AI output object should be ConceptSuggestion[], not KnowledgeUnit[].

## UI Labels

Use English labels only.

Common labels:

- Analyze Current Note
- Inbox
- Today’s Focus
- Concepts
- Cards
- Show Answer
- Again
- Hard
- Good
- Easy
- Edit
- Edit Card
- View Source
- Skip
- Accept
- Reject
- Merge
- Create Concept
- Update Concept
- Review Later
- Needs Attention

## Development Process

Before coding:

1. Read AGENTS.md.
2. Read relevant docs under docs/.
3. Check the current task scope.
4. Make a short implementation plan.

During coding:

1. Make the smallest useful change.
2. Do not refactor unrelated files.
3. Do not change data formats without updating docs.
4. Add tests where practical.
5. Run typecheck/build before finishing.

After coding:

1. Explain changed files.
2. Explain how to test manually in Obsidian.
3. Mention known limitations.

## Autonomous Git Workflow

Codex is allowed to manage Git autonomously for local development.

### Allowed autonomous Git operations

Codex may run these commands without asking first:

- git status
- git diff
- git diff --stat
- git branch --show-current
- git log --oneline --decorate -5
- git checkout -b <task-branch>
- git checkout main
- git add <changed-files>
- git commit -m "<message>"
- git merge <task-branch>
- git branch -d <task-branch>

### Forbidden Git operations without explicit user approval

Codex must never run these commands without explicit user approval:

- git push
- git reset
- git reset --hard
- git clean
- git branch -D
- git rebase
- git remote remove
- git remote set-url
- git commit --amend
- rm -rf
- any command that deletes project history or user content

### Branching rules

- `main` must remain stable.
- Work on one task branch per implementation task.
- Branch names should be descriptive.

Examples:

- task/card-marker-parser
- task/static-review-view
- task/fsrs-service
- task/card-edit-modal
- docs/codex-brief
- fix/card-parser-validation

### Commit rules

Codex may commit autonomously only if all conditions are met:

1. The task scope is clear.
2. The change is limited to the current task.
3. `npm run build` passes.
4. `git diff --stat` is reviewed.
5. The commit message is specific.
6. No files under `../../references` or `../../coding-skills` are modified.

Recommended commit prefixes:

- feat:
- fix:
- docs:
- refactor:
- test:
- chore:

### Merge rules

Codex may merge a task branch into `main` autonomously only if:

1. The task branch has a clean commit.
2. `npm run build` passes on the task branch.
3. The branch implements only the current task.
4. The merge is a normal local merge.
5. No forbidden files are modified.

After merging, Codex should delete the merged task branch using:

- git branch -d <task-branch>

### Push rules

Codex must not push to any remote without explicit user approval.

### Safety rules

Before starting a task, Codex must run:

- git status
- git branch --show-current

Before committing, Codex must run:

- npm run build
- git diff --stat

After committing, Codex must report:

- branch name
- commit hash
- changed files
- build result
- manual test steps