# Mneme v1.0 Release Checklist

This is the authoritative exit gate for Mneme v1.0. Passing a narrow unit test does not prove a product requirement; every row needs its listed automated and manual evidence.

## Scope

v1.0 is the stable Concept Review Plugin described in `ROADMAP.md`. Random Concept Draw, Course/Exam Mode, AI Answer Grading, PDF/PPT ingestion, Anki sync, and a built-in autonomous agent remain outside this release.

## Requirement Evidence

| v1.0 requirement | Automated evidence | Required Obsidian evidence |
| --- | --- | --- |
| Stable Analyze Current Note | AI capture, provider, schema, Source analysis, chunk coverage, command-policy tests | English and Chinese Source Notes; long-note coverage; repeat and concurrent generation protection |
| Complete core learning loop | v1 core-loop integration test crosses AI capture, Review Gate, Concept write, Card generation/write, parser, FSRS review, and persisted reload | Complete the same Source → Concept → Card → Review path in one real vault |
| Stable Inbox Review Gate | Knowledge Proposal, lifecycle, validation, writer, and acceptance fixture tests | Open/edit/evidence/Accept & Next/Reject & Next; no direct list acceptance |
| Stable Concept Markdown | Renderer, writer, metadata, Source link, duplicate, merge, and scanner tests | Accepted and manual Concepts remain clean reading notes after reload |
| Stable Card Group Markdown | Parser, writer, editor, deletion, and stable-ID tests | Multiple accepted Cards append to one group; Edit and conflict protection preserve unrelated Markdown |
| FSRS owns Card scheduling | FSRS scheduler, integration-contract, retrievability, and Review State tests | Again/Hard/Good/Easy advance once and survive plugin/Obsidian reload |
| Concept-based Today’s Focus | Review queue, Concept memory, ranking, daily eligibility, and Today’s Focus tests | Bounded Concept/Card selection; Later remains calm and unchanged |
| Edit Card and Edit Concept | Card editor, Concept metadata, conflict, section, and retention tests | Live Preview math editing; concurrent target changes stop stale writes |
| Importance and retention policy | Concept memory, metadata, Retention Target, FSRS forwarding tests | Importance affects priority only; explicit Retention Target affects future ratings only |
| Low-pressure workload controls | Today’s Focus, Review Later, pause, suspension, retirement, deletion tests | Limits, More actions, resume/restore paths, and no debt-style primary UI |
| Exploratory Concepts | AI schema, Concept loader, Card generation, daily eligibility tests | No Card generation or Today’s Focus entry; existing Cards remain diagnostic-only |
| Basic Concept Manager | Library scanner/search, ID repair, provenance, duplicate, Guided Merge tests | Create/open/edit/search/filter; maintenance stays collapsed and reviewed |
| Cross-platform release metadata | Release metadata test and `npm run check:release -- 1.0.0` | macOS and Windows manual installation from the same release artifacts |

## Automated Release Gate

- [ ] `npm run build`
- [ ] `npm run test:all`
- [ ] `npm run check:release -- 1.0.0`
- [ ] `manifest.json`, `package.json`, and `versions.json` all declare `1.0.0`
- [ ] `main.js`, `manifest.json`, and `styles.css` are non-empty release artifacts
- [ ] Git contains no unintended files or generated vault data

## Real Vault Gate

- [ ] Complete `PRE_AI_ACCEPTANCE_CHECKLIST.md` in a disposable macOS vault
- [ ] Reload the plugin and restart Obsidian; Inbox, Composer draft, FSRS state, controls, and Library remain correct
- [ ] Repeat the core create → generate → accept → review loop in a Windows vault
- [ ] Verify inline and display MathJax in Concept Library, Proposal Review, Concept Edit, Card Edit, and Review
- [ ] Verify provider configuration failures, invalid responses, and timeouts show actionable Notices without partial writes
- [ ] Verify changing or deleting Source Notes never silently deletes approved Concept knowledge
- [ ] Verify release installation works using only `main.js`, `styles.css`, and `manifest.json`

## Completion Rule

v1.0 is complete only when every checkbox above is checked against the `1.0.0` metadata and release artifacts. Code completion without macOS and Windows real-vault evidence is release-candidate status, not a completed v1.0 release.
