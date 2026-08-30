---
status: superseded by ADR-0019
---

# AI grading cannot submit FSRS ratings

AI answer grading may compare a response with the Card Rubric, explain missing or incorrect points, and produce a Rating Suggestion. The learner must confirm or change that suggestion before FSRS receives a rating. AI failures never block manual self-rating, and no confidence threshold or apparently exact answer allows AI to change Card Memory State silently.
