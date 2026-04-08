# @taurus-ai/swarm-spawner-ai-sdk

Vercel AI SDK adapter for [Swarm Spawner](https://github.com/Taurus-Ai-Corp/swarm-spawner). Bring your own LLM provider.

## Install

```bash
npm install @taurus-ai/swarm-spawner @taurus-ai/swarm-spawner-ai-sdk ai @ai-sdk/openai
```

## Quick Start

```typescript
import { SwarmSpawner } from "@taurus-ai/swarm-spawner";
import { createAISDKExecutor } from "@taurus-ai/swarm-spawner-ai-sdk";
import { openai } from "@ai-sdk/openai";

const executor = createAISDKExecutor({ model: openai("gpt-4o") });
const spawner = new SwarmSpawner({ executor });

const result = await spawner.spawn({
  tasks: [
    { id: "review", description: "Review this code for bugs", input: { code: "..." } },
    { id: "docs", description: "Generate API docs", input: { code: "..." } },
  ],
  strategy: "parallel",
});
```

## Tiered Executor

Map swarm-spawner's model tiers (fast/balanced/deep) to specific AI SDK models:

```typescript
import { createTieredExecutor } from "@taurus-ai/swarm-spawner-ai-sdk";
import { openai } from "@ai-sdk/openai";

const executor = createTieredExecutor({
  fast: openai("gpt-4o-mini"),
  balanced: openai("gpt-4o"),
  deep: openai("o3"),
});
```

## Options

```typescript
createAISDKExecutor({
  model: openai("gpt-4o"),       // Required: any AI SDK LanguageModel
  systemPrompt: "Be concise.",   // Optional: prepended to every call
  maxTokens: 2048,               // Optional: default 2048
  temperature: 0.7,              // Optional: default 0.7
  promptBuilder: (agent) => ..., // Optional: custom prompt mapping
});
```

## Custom Prompt Builder

Override how agent tasks map to LLM prompts:

```typescript
const executor = createAISDKExecutor({
  model: openai("gpt-4o"),
  promptBuilder: (agent) => {
    return `Task: ${agent.task}\nInput: ${JSON.stringify(agent.input)}`;
  },
});
```

## Supported Providers

Any provider compatible with the [Vercel AI SDK](https://sdk.vercel.ai/providers):

- `@ai-sdk/openai` — GPT-4o, o3, etc.
- `@ai-sdk/anthropic` — Claude Sonnet, Opus, Haiku
- `@ai-sdk/google` — Gemini
- `@ai-sdk/mistral` — Mistral, Mixtral
- `@ai-sdk/groq` — Llama, Mixtral via Groq

## License

MIT — [TAURUS AI Corp](https://github.com/Taurus-Ai-Corp)
