# Decouple Concept importance from FSRS retention

Concept Importance expresses the student's judgment of knowledge value, while Retention Target expresses a workload-versus-recall scheduling policy. Mneme therefore uses Importance only to rank already-eligible Concepts and never maps importance levels to FSRS desired retention.

FSRS uses the global Retention Target unless the student explicitly sets `retention_target` on a Concept through Edit Concept. The override is constrained to `0.70`–`0.98`, applies to every Card in that Concept on its next normal rated review, and changes only the interval FSRS computes from that review. It does not rewrite existing due dates, make Cards eligible, or alter Concept priority. Clearing the field restores the global policy.

AI proposals and manual Concept creation do not choose an override. Retention policy is an explicit student decision, not inferred knowledge metadata.
