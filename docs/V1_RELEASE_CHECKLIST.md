# Mneme v1.0 Release Checklist

This is the authoritative exit gate for Mneme v1.0. Passing a narrow unit test does not prove a product requirement; every row needs its listed automated and manual evidence.

## Functional Completion Versus Publication

The v1.0 product feature set is functionally complete. `npm run build`, the complete `npm run test:all` suite, the deterministic release gate, and the macOS real-vault core learning loop pass against `1.0.0` metadata.

The remaining unchecked items in this document are publication-readiness work: final clean installation from distribution artifacts, full restart regression, and Windows validation of the same artifact. They do not represent missing v1.0 product functions and are intentionally deferred until Mneme is prepared for distribution.

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

- [x] `npm run build`
- [x] `npm run test:all`
- [x] `npm run check:release -- 1.0.0`
- [x] `manifest.json`, `package.json`, and `versions.json` all declare `1.0.0`
- [x] `main.js`, `manifest.json`, and `styles.css` are non-empty release artifacts
- [x] Git contains no unintended files or generated vault data; the long-standing untracked `mneme` self-link is intentionally excluded

Recorded on 2026-07-16 from feature-complete artifact source commit `e64b0f0`:

- `main.js`: `5e78f937a27a19ca508f4ee2b31ea13bc06df6afa05fcbb5074642fff7dc7a66`
- `manifest.json`: `23d6f036fdba51e4b4dc8c29b4ebc0d021fe8dfd506f7037f35ed2ba2cf5a0e8`
- `styles.css`: `0e0e9dfa074b818c2accfb869019be10c9601180b24776fac24fd0933ec9b4ee`
- `mneme-1.0.0.zip`: `2a75d1fc3f068603b5fa11e95b807d5064c50b8d0e03c169cfd8852e56680d5c` (contains exactly the three files above)

## Real Vault Gate

- [ ] Complete `PRE_AI_ACCEPTANCE_CHECKLIST.md` in a disposable macOS vault
- [ ] Reload the plugin and restart Obsidian; Inbox, Composer draft, FSRS state, controls, and Library remain correct
- [ ] Repeat the core create → generate → accept → review loop in a Windows vault
- [x] Verify inline and display MathJax in Concept Library, Proposal Review, Concept Edit, Card Edit, and Review
- [x] Verify provider configuration failures, invalid responses, and timeouts show actionable Notices without partial writes
- [x] Verify changing or deleting Source Notes never silently deletes approved Concept knowledge
- [ ] Verify release installation works using only `main.js`, `styles.css`, and `manifest.json`

Recorded macOS evidence on 2026-07-16:

- The real-vault Source → reviewed Concept → reviewed Card Group → FSRS rating path persisted across plugin reload.
- Inline formula `$R(t)=e^{-t/S}$` rendered on all five required surfaces while editable fields retained raw dollar-delimited Markdown.
- Missing OpenAI credentials, invalid provider JSON, and a one-second provider timeout each produced an actionable Notice ending with `No proposals added.`
- Across all three provider failures, Active Inbox proposals remained at zero and the approved Concept/Card Group SHA-256 values remained unchanged.
- Temporarily removing and restoring the supporting Source Note, followed by index reconciliation, left approved Concept and Card Markdown unchanged.

## Completion Rule

The v1.0 feature set is complete when its implementation, complete automated suite, and real-vault core learning loop pass. Mneme is publication-ready only when every checkbox above is checked against the final `1.0.0` release artifacts. Until then, distribution remains intentionally deferred even though the product functions are complete.
