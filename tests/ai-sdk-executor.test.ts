import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAISDKExecutor, createTieredExecutor } from "../src/index.js";
import type { EphemeralAgent, ModelConfig } from "@taurus-ai/swarm-spawner";

// Mock the ai package
vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

import { generateText } from "ai";
const mockGenerateText = vi.mocked(generateText);

function makeAgent(overrides: Partial<EphemeralAgent> = {}): EphemeralAgent {
  return {
    id: "agent-test-001",
    task: "Analyze this code for security vulnerabilities",
    model: {
      provider: "openai",
      model: "gpt-4o",
      temperature: 0.5,
      maxTokens: 8192,
      contextWindow: 128000,
      cost: "medium",
    },
    input: { code: "const x = dangerous(userInput);" },
    status: "running",
    createdAt: new Date(),
    ...overrides,
  };
}

function makeModelConfig(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    provider: "openai",
    model: "gpt-4o",
    temperature: 0.5,
    maxTokens: 8192,
    contextWindow: 128000,
    cost: "medium",
    ...overrides,
  };
}

const mockModel = {
  modelId: "gpt-4o",
  provider: "openai",
  specificationVersion: "v1" as const,
  defaultObjectGenerationMode: undefined,
  doGenerate: vi.fn(),
  doStream: vi.fn(),
} as any;

describe("createAISDKExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateText.mockResolvedValue({
      text: "Found 1 critical vulnerability: dangerous() with user input.",
      usage: { promptTokens: 50, completionTokens: 30 },
      finishReason: "stop",
      response: { id: "resp-1", modelId: "gpt-4o" },
    } as any);
  });

  it("should create a valid ModelExecutor", () => {
    const executor = createAISDKExecutor({ model: mockModel });
    expect(typeof executor).toBe("function");
  });

  it("should call generateText with correct parameters", async () => {
    const executor = createAISDKExecutor({
      model: mockModel,
      systemPrompt: "You are a security auditor.",
      maxTokens: 4096,
      temperature: 0.3,
    });

    const agent = makeAgent();
    await executor(agent, makeModelConfig());

    expect(mockGenerateText).toHaveBeenCalledOnce();
    expect(mockGenerateText).toHaveBeenCalledWith({
      model: mockModel,
      prompt: 'Analyze this code for security vulnerabilities\n\nContext:\ncode: const x = dangerous(userInput);',
      system: "You are a security auditor.",
      maxTokens: 4096,
      temperature: 0.3,
    });
  });

  it("should return AISDKResult with usage info", async () => {
    const executor = createAISDKExecutor({ model: mockModel });
    const result = await executor(makeAgent(), makeModelConfig());

    expect(result).toEqual({
      text: "Found 1 critical vulnerability: dangerous() with user input.",
      usage: {
        promptTokens: 50,
        completionTokens: 30,
        totalTokens: 80,
      },
      model: "gpt-4o",
      agentId: "agent-test-001",
    });
  });

  it("should use default maxTokens and temperature", async () => {
    const executor = createAISDKExecutor({ model: mockModel });
    await executor(makeAgent(), makeModelConfig());

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 2048,
        temperature: 0.7,
      }),
    );
  });

  it("should handle agent with no input gracefully", async () => {
    const executor = createAISDKExecutor({ model: mockModel });
    const agent = makeAgent({ input: {} });
    await executor(agent, makeModelConfig());

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Analyze this code for security vulnerabilities",
      }),
    );
  });

  it("should handle agent with complex input", async () => {
    const executor = createAISDKExecutor({ model: mockModel });
    const agent = makeAgent({
      input: {
        code: "SELECT * FROM users",
        language: "sql",
        severity: ["high", "critical"],
      },
    });
    await executor(agent, makeModelConfig());

    const call = mockGenerateText.mock.calls[0][0];
    expect(call.prompt).toContain("code: SELECT * FROM users");
    expect(call.prompt).toContain("language: sql");
    expect(call.prompt).toContain('severity: ["high","critical"]');
  });

  it("should support custom promptBuilder", async () => {
    const executor = createAISDKExecutor({
      model: mockModel,
      promptBuilder: (agent) => `[CUSTOM] ${agent.task} | keys: ${Object.keys(agent.input).join(",")}`,
    });

    await executor(makeAgent(), makeModelConfig());

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "[CUSTOM] Analyze this code for security vulnerabilities | keys: code",
      }),
    );
  });

  it("should reject empty task", async () => {
    const executor = createAISDKExecutor({ model: mockModel });
    const agent = makeAgent({ task: "" });

    await expect(executor(agent, makeModelConfig())).rejects.toThrow("empty task");
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("should reject whitespace-only task", async () => {
    const executor = createAISDKExecutor({ model: mockModel });
    const agent = makeAgent({ task: "   " });

    await expect(executor(agent, makeModelConfig())).rejects.toThrow("empty task");
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("should wrap promptBuilder errors with agent context", async () => {
    const executor = createAISDKExecutor({
      model: mockModel,
      promptBuilder: () => { throw new Error("bad template"); },
    });

    await expect(executor(makeAgent(), makeModelConfig())).rejects.toThrow("promptBuilder failed");
    await expect(executor(makeAgent(), makeModelConfig())).rejects.toThrow("bad template");
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("should reject when promptBuilder returns empty string", async () => {
    const executor = createAISDKExecutor({
      model: mockModel,
      promptBuilder: () => "",
    });

    await expect(executor(makeAgent(), makeModelConfig())).rejects.toThrow("empty string");
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("should propagate generateText errors", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("Rate limited"));
    const executor = createAISDKExecutor({ model: mockModel });

    await expect(executor(makeAgent(), makeModelConfig())).rejects.toThrow("Rate limited");
  });

  it("should not include system prompt when not provided", async () => {
    const executor = createAISDKExecutor({ model: mockModel });
    await executor(makeAgent(), makeModelConfig());

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: undefined,
      }),
    );
  });
});

describe("createTieredExecutor", () => {
  const fastModel = { ...mockModel, modelId: "gpt-4o-mini" };
  const balancedModel = { ...mockModel, modelId: "gpt-4o" };
  const deepModel = { ...mockModel, modelId: "o3" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateText.mockResolvedValue({
      text: "result",
      usage: { promptTokens: 10, completionTokens: 5 },
    } as any);
  });

  it("should route low-cost config to fast model", async () => {
    const executor = createTieredExecutor({
      fast: fastModel,
      balanced: balancedModel,
      deep: deepModel,
    });

    await executor(makeAgent(), makeModelConfig({ cost: "low" }));

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: fastModel }),
    );
  });

  it("should route medium-cost config to balanced model", async () => {
    const executor = createTieredExecutor({
      fast: fastModel,
      balanced: balancedModel,
      deep: deepModel,
    });

    await executor(makeAgent(), makeModelConfig({ cost: "medium" }));

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: balancedModel }),
    );
  });

  it("should route high-cost config to deep model", async () => {
    const executor = createTieredExecutor({
      fast: fastModel,
      balanced: balancedModel,
      deep: deepModel,
    });

    await executor(makeAgent(), makeModelConfig({ cost: "high" }));

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: deepModel }),
    );
  });

  it("should pass through executor options", async () => {
    const executor = createTieredExecutor(
      { fast: fastModel, balanced: balancedModel, deep: deepModel },
      { systemPrompt: "Be concise.", maxTokens: 512, temperature: 0.1 },
    );

    await executor(makeAgent(), makeModelConfig({ cost: "low" }));

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "Be concise.",
        maxTokens: 512,
        temperature: 0.1,
      }),
    );
  });

  it("should return correct model ID in result", async () => {
    const executor = createTieredExecutor({
      fast: fastModel,
      balanced: balancedModel,
      deep: deepModel,
    });

    const result = await executor(makeAgent(), makeModelConfig({ cost: "high" }));
    expect((result as any).model).toBe("o3");
  });
});
