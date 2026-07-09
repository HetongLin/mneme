# Testing Checkpoint

This checkpoint is intended for manual Obsidian testing before the next product changes.

## Automated verification

Run from the plugin folder:

```bash
npm run test:all
npm run build
```

Both should pass before manual testing.

## Manual smoke test

1. Reload Obsidian and enable Mneme.
2. Open `Mneme: Open Review View`.
3. Confirm Today’s Focus loads without crashing.
4. Open Advanced Diagnostics.
5. Confirm Cards without explicit stable IDs appear as needing a stable Card ID rather than entering review.
6. Run `Mneme: Open Concept Library`.
7. Confirm approved Concepts are visible and duplicate / stale-source diagnostics still render.
8. Run `Mneme: Export Knowledge Context Pack`.
9. Confirm a new folder appears under `Mneme/Exports/Knowledge Context Pack ...`.
10. Confirm the pack includes `README.md`, `concepts/index.md`, and clean Concept files without Source Notes or Review Cards sections.
11. Run `Mneme: Export Anki TSV`.
12. Confirm a TSV appears under `Mneme/Exports/Anki Export ...`.
13. Confirm invalid, retired, and missing-ID Cards are not exported.

## Product boundaries to verify

- Source Note analysis proposes Concepts first; Cards are generated later from written Concepts.
- FSRS scheduling remains Card-only.
- Concept Learning State remains aggregate/presentational, not a scheduler.
- Anki export is one-way and isolated.
- Knowledge Context Pack is neutral context for an external agent, not a project request.
