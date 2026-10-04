# AI provider setup

Mneme can use the offline Mock provider or a remote provider for explicit analysis and drafting actions. Configure the provider in **Settings → Mneme → AI Capture**. Enter a model ID supported by the selected vendor; new provider profiles intentionally start with an empty model because model names and availability change.

OpenAI and DeepSeek keep their existing settings and independent API keys. Anthropic, Gemini, Qwen, Zhipu, Moonshot, SiliconFlow, and Custom use separate profiles, so changing providers does not replace another provider's credentials.

## Providers and protocols

| Provider | Protocol | Default base URL | Official API documentation |
| --- | --- | --- | --- |
| OpenAI | Responses | https://api.openai.com/v1 | [Responses API](https://platform.openai.com/docs/api-reference/responses) |
| Anthropic (Claude) | Claude Messages | https://api.anthropic.com/v1 | [Messages API](https://platform.claude.com/docs/en/api/messages/create), [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) |
| Google (Gemini) | generateContent | https://generativelanguage.googleapis.com/v1beta | [Gemini generateContent](https://ai.google.dev/gemini-api/docs/generate-content/structured-output) |
| DeepSeek | Chat Completions JSON mode | https://api.deepseek.com | [DeepSeek API](https://api-docs.deepseek.com/) |
| Alibaba Cloud (Qwen) | Chat Completions JSON mode | https://dashscope.aliyuncs.com/compatible-mode/v1 | [DashScope OpenAI compatibility](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope), [structured output](https://help.aliyun.com/en/model-studio/qwen-structured-output) |
| Zhipu (GLM) | Chat Completions JSON mode | https://open.bigmodel.cn/api/paas/v4 | [Zhipu OpenAI compatibility](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction) |
| Moonshot (Kimi) | Chat Completions JSON mode | https://api.moonshot.cn/v1 | [Moonshot API](https://platform.moonshot.cn/docs/api/chat) |
| SiliconFlow | Chat Completions JSON mode | https://api.siliconflow.cn/v1 | [SiliconFlow chat completions](https://docs.siliconflow.cn/en/api-reference/chat-completions/chat-completions) |
| Custom | Chat Completions or Responses | Enter your endpoint | Use the documentation for your endpoint |

Claude requires a model supporting native Messages structured outputs (`output_config.format`). Gemini requires a model supporting generateContent JSON schema output (`generationConfig.responseFormat.text`). Providers using Chat Completions use JSON mode when enabled. Custom endpoints let you choose Chat Completions or Responses.

Qwen requests use non-streaming mode with enable_thinking set to false. Choose a Qwen model that supports non-thinking mode; thinking-only models are unsupported.

## Base URLs and model IDs

The default base URL is a starting point, not a guarantee that every model or account is available there. You can replace it with a compatible regional endpoint, gateway, or self-hosted endpoint. The endpoint must implement the selected protocol and support the model ID you enter. Mneme does not probe models or silently retry a request with another protocol or JSON mode.

For Chat Completions providers, JSON mode is enabled by default. Disable it only when the endpoint does not support response_format; Mneme still validates the returned JSON locally. A malformed response remains an error instead of being silently accepted.

## Keys and privacy

API keys are stored locally as plaintext values in Obsidian's plugin data.json. Mneme does not send keys anywhere except the configured endpoint for authentication, and does not include keys in logs. Obsidian Sync, backups, or other vault configuration sync may copy data.json, so review those services before syncing a vault with credentials. See [Privacy](PRIVACY.md) for the request boundaries.

The provider catalog and mocked tests cover request selection and response handling paths. They do not mean that every provider, endpoint, model, region, or account has been tested against a live API.
