# ADR 0032: AI Providers Share Grounded JSON Contracts

## Status

Accepted — 2026-10-04

## Context

Mneme previously supported Mock, OpenAI, and DeepSeek. Adding providers must
cover all explicit AI actions without changing proposal approval, source
grounding, Markdown ownership, or local review scheduling.

## Decision

Keep the legacy OpenAI and DeepSeek settings and request contracts. Add
independent profiles for Anthropic, Gemini, Qwen, Zhipu, Moonshot, SiliconFlow,
and Custom. Each profile stores its own key, base URL, model, output token
limit, and protocol. New model IDs start empty; the learner chooses a model
that supports the configured JSON protocol. Unknown stored providers continue
to normalize to Mock.

Use native Claude Messages structured outputs and Gemini generateContent
structured outputs. The remaining new services use Chat Completions with
JSON mode by default. Custom supports Chat Completions or Responses and may
omit authentication for local endpoints. Compatible Chat requests include the
JSON schema in the system prompt, including when JSON mode is disabled.
Qwen requests disable thinking to support bounded non-streaming JSON output;
thinking-only models are outside this adapter's supported contract.

Concept capture, Card generation, English aliases, and optional Merge
assistance use the selected provider. Reuse the existing grounded prompts and
proposal schemas. Native APIs receive a portable schema subset; local
validation continues to enforce the original constraints. Refusal, truncation,
safety filtering, and malformed JSON fail explicitly. Do not silently switch
providers, repair results with additional paid requests, or retry with a
different protocol.

Snapshot configuration for each new adapter request and auxiliary AI request,
so a settings change during the network wait cannot reinterpret the response
using another provider. Selected endpoint/model/protocol/output settings affect
new-provider generation fingerprints; key rotation and unselected profiles do
not. Preserve the legacy fingerprint shape.

Keys remain local plaintext plugin settings. Authentication uses headers;
new-profile URLs reject embedded credentials, queries, and fragments. Config
diagnostics omit keys and sanitize URLs. Transport errors redact the request's
known authentication secrets before exposing an upstream message.

## Consequences

Provider protocols share one request/response adapter without adding SDK
dependencies. Models, account availability, regions, and JSON support vary;
the provider guide explains the limits rather than claiming universal model
compatibility. Mocked protocol tests cover dispatch, envelopes, failure paths,
and settings races; they are not live account certification.

All proposals still require the existing review and approval steps before
Markdown writes. Ordinary review, FSRS scheduling, organization, and export
remain local. No migration of learner Markdown or FSRS state is required.
