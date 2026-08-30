# Mneme

Mneme is an AI-assisted knowledge memory plugin for self-directed lifelong learners who use Obsidian.

It helps learners turn notes they have actually read and approved into durable Concepts, reviewable Cards, and a low-pressure memory workflow. AI proposes bounded knowledge changes, but accepted knowledge must pass user review before Mneme writes clean Markdown.

Core loop:

```text
Source Notes
-> AI proposes Concept changes
-> User reviews / edits / accepts / rejects
-> Accepted Concepts become clean Concept.md files
-> Cards are generated later from written Concepts
-> When enabled, user reviews accepted Cards through FSRS
-> Mneme tracks Concept-level learning state
```

Learners may also create clean approved Concepts directly; only AI-proposed knowledge changes require the Inbox Review Gate. Accepted Cards append as independently scheduled blocks to one Card Group Markdown file per Concept.

FSRS scheduling is optional. Disabling it keeps Concept Library and authoring available while preserving every Card's memory state and history. Re-enabling resumes from the last formal review using real elapsed time. When enabled, Today’s Focus includes every due or new eligible Card without separate daily Concept or Card caps.

Mneme is not an Anki clone. It may export approved Cards as isolated Anki-importable copies, but Mneme Markdown and Mneme FSRS remain independent.

Mneme is not an exam simulator, course manager, AI grader, project recommender, or autonomous learning agent. Normal review never calls AI.

## How to use

- Install dependencies with `npm install`.
- Run `npm run dev` for a watch build.
- Copy or symlink the plugin folder into an Obsidian vault under `.obsidian/plugins/mneme`.
- Reload Obsidian and enable Mneme from Community Plugins.

## Development

- `npm run build` type-checks and creates a production build.
- `npm run test:all` runs the local test suite.
- `npm run check:release -- <version>` verifies synchronized metadata and required release artifacts.
- Product and architecture decisions live in `docs/adr/`.
- If product docs conflict, ADRs are the decision source of truth.

## Manually installing the plugin

Copy `main.js`, `styles.css`, and `manifest.json` to `VaultFolder/.obsidian/plugins/mneme/`.

## API Documentation

See https://docs.obsidian.md
