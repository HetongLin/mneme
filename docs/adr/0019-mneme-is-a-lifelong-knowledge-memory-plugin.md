---
status: accepted
---

# Mneme is a lifelong knowledge memory plugin

Mneme is an Obsidian-native plugin for self-directed lifelong learners who want to turn their own notes into reviewed, durable Concepts and low-pressure Card review. Its product boundary is the local Note → Concept → Card → Review → Concept Library loop: Concepts remain vault-global, FSRS remains the only Card scheduler, and organization, browsing, review, and export use deterministic local logic.

Mneme will not develop Course Context, Exam Mode, Exam Attempts, Use Mode, Use Projects, AI answer grading, or a built-in learning agent. These directions add competing state models and make a small personal learning plugin dependent on stronger or more frequent model calls. Knowledge Context Pack and Anki TSV remain ordinary export utilities rather than modes.

AI is an explicit, bounded assistant for extracting or drafting proposed learning content. Normal review never calls AI, and no feature may require an ongoing chat, whole-vault reasoning, automatic grading, or agent loop. A future stateless `Rediscover a Concept` entry point may be reconsidered only if real usage supports it; it must not create another learning state or bypass FSRS.

This decision supersedes ADR 0004's Course-specific framing, ADR 0005, ADR 0006, and ADR 0011 `AI grading cannot submit FSRS ratings`.
