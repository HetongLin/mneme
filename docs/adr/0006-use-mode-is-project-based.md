---
status: superseded by ADR-0019
---

# Use Mode is based on projects and Concept Sets

Use Mode exists to deepen understanding through practice, so its primary unit is a Use Project that combines a Concept Set rather than a chat session about one Concept. Project Discovery must explain which approved Concepts a proposed project activates, where each is used, expected outputs, difficulty, prerequisites, and stretch goals. Project Learning may produce application evidence and reviewed knowledge proposals, but it does not directly modify Concepts, Cards, or FSRS state.

The first implementation boundary is a neutral Knowledge Context Pack that tells an external agent such as Codex which Concepts the learner has approved and learned from. The learner supplies project goals, time, difficulty, and other constraints in their later conversation with that agent. This keeps Mneme independent of a built-in agent workflow while establishing a portable context contract that a future internal recommender can reuse.

A Knowledge Context Pack includes all approved Concepts by default, with optional Course or manual Concept selection. It includes a Concept index and the selected clean Concept files, while excluding Source Notes, Cards, credentials, scheduler state, diagnostics, and a prescriptive project request.

The pack describes Concepts the learner has read and approved, not Concepts Mneme claims the learner has mastered. Its README states this distinction explicitly. The initial export omits per-Concept Learning State and Needs Work Signals; those may become a separate opt-in export later without exposing raw Card or FSRS history.
