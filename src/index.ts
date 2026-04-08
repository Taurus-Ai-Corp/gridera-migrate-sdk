import { generateText } from "ai";
import type { LanguageModel } from "ai";
import type { ModelExecutor, EphemeralAgent } from "@taurus-ai/swarm-spawner";
import type { ModelConfig } from "@taurus-ai/swarm-spawner";

export interface AISDKExecutorOptions {
  /** The AI SDK language model instance (e.g. openai("gpt-4o"), anthropic("claude-sonnet-4-20250514")) */
  model: LanguageModel;
  /** Optional system prompt prepended to every agent call */
  systemPrompt?: string;
  /** Max tokens per generation (default: 2048) */
  maxTokens?: number;
  /** Temperature (default: 0.7) */
  temperature?: number;
}

export interface AISDKResult {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  agentId: string;
}

/**
 * Build the prompt string from an agent's task and input.
 *
 * TODO: This is where your domain knowledge matters.
 * The agent has: task (string description), input (Record<string, unknown>).
 * How should these map to an LLM prompt?
 *
 * Current approach: task as the main instruction, input fields
 * serialized as context. Override this by passing a custom
 * promptBuilder to createAISDKExecutor.
 */
function defaultPromptBuilder(agent: EphemeralAgent): string {
  const inputContext = Object.entries(agent.input)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n");

  return inputContext
    ? `${agent.task}\n\nContext:\n${inputContext}`
    : agent.task;
}

/**
 * Creates a ModelExecutor that calls the Vercel AI SDK's generateText.
 *
 * Usage:
 * ```typescript
 * import { openai } from "@ai-sdk/openai";
 * import { createAISDKExecutor } from "@taurus-ai/swarm-spawner-ai-sdk";
 *
 * const executor = createAISDKExecutor({ model: openai("gpt-4o") });
 * const spawner = new SwarmSpawner({ executor });
 * ```
 */
export function createAISDKExecutor(
  options: AISDKExecutorOptions & {
    /** Custom prompt builder — override how agent task/input maps to LLM prompt */
    promptBuilder?: (agent: EphemeralAgent) => string;
  },
): ModelExecutor {
  const {
    model,
    systemPrompt,
    maxTokens = 2048,
    temperature = 0.7,
    promptBuilder = defaultPromptBuilder,
  } = options;

  return async (agent: EphemeralAgent, _config: ModelConfig): Promise<AISDKResult> => {
    const prompt = promptBuilder(agent);

    const result = await generateText({
      model,
      prompt,
      system: systemPrompt,
      maxTokens,
      temperature,
    });

    return {
      text: result.text,
      usage: {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.promptTokens + result.usage.completionTokens,
      },
      model: model.modelId,
      agentId: agent.id,
    };
  };
}

/**
 * Creates a ModelExecutor with per-agent model selection.
 * Maps swarm-spawner's modelTier (fast/balanced/deep) to specific AI SDK models.
 *
 * Usage:
 * ```typescript
 * import { openai } from "@ai-sdk/openai";
 * import { createTieredExecutor } from "@taurus-ai/swarm-spawner-ai-sdk";
 *
 * const executor = createTieredExecutor({
 *   fast: openai("gpt-4o-mini"),
 *   balanced: openai("gpt-4o"),
 *   deep: openai("o3"),
 * });
 * ```
 */
export function createTieredExecutor(
  models: {
    fast: LanguageModel;
    balanced: LanguageModel;
    deep: LanguageModel;
  },
  options?: Omit<AISDKExecutorOptions, "model"> & {
    promptBuilder?: (agent: EphemeralAgent) => string;
  },
): ModelExecutor {
  const costToTier: Record<string, keyof typeof models> = {
    low: "fast",
    medium: "balanced",
    high: "deep",
  };

  return async (agent: EphemeralAgent, config: ModelConfig): Promise<AISDKResult> => {
    const tierKey = costToTier[config.cost] ?? "balanced";
    const model = models[tierKey] ?? models.balanced;

    const executor = createAISDKExecutor({
      ...options,
      model,
    });

    return executor(agent, config) as Promise<AISDKResult>;
  };
}
