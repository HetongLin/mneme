# Mneme

Mneme is an AI-native learning layer for Obsidian, built for university students.

It helps students turn notes they have actually read and approved into durable Concepts, reviewable Cards, and low-pressure learning workflows. AI proposes knowledge changes, but accepted knowledge must pass user review before Mneme writes clean Markdown.

Core loop:

```text
Source Notes
-> AI proposes Concept changes
-> User reviews / edits / accepts / rejects
-> Accepted Concepts become clean Concept.md files
-> Cards are generated later from written Concepts
-> User reviews accepted Cards through FSRS
-> Mneme tracks Concept-level learning state
```

Students may also create clean approved Concepts directly; only AI-proposed knowledge changes require the Inbox Review Gate. Accepted Cards append as independently scheduled blocks to one Card Group Markdown file per Concept.

Mneme is not an Anki clone. It may export approved Cards as isolated Anki-importable copies, but Mneme Markdown and Mneme FSRS remain independent.

## How to use

- Install dependencies with `npm install`.
- Run `npm run dev` for a watch build.
- Copy or symlink the plugin folder into an Obsidian vault under `.obsidian/plugins/mneme`.
- Reload Obsidian and enable Mneme from Community Plugins.

## Development

- `npm run build` type-checks and creates a production build.
- `npm run test:all` runs the local test suite.
- Product and architecture decisions live in `docs/adr/`.
- If product docs conflict, ADRs are the decision source of truth.

## Manually installing the plugin

Copy `main.js`, `styles.css`, and `manifest.json` to `VaultFolder/.obsidian/plugins/mneme/`.

## API Documentation

See https://docs.obsidian.md
