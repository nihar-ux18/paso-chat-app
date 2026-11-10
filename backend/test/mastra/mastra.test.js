import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

const mockEnrichmentResult = {
  severity: "low",
  categories: [],
  confidence: 0.95,
  recommendedAction: "none",
  flags: [],
  reasoning: "Message is benign",
};

describe("lib/mastra.js - enrichMessage", () => {
  let enrichMessage;
  let isMastraEnabled;
  let mockAgent;
  let mockGetModerationAgent;

  beforeEach(async () => {
    jest.resetModules();
    process.env.MASTRA_ENABLED = "false";
    process.env.GROQ_API_KEY = undefined;

    mockAgent = {
      generate: jest.fn(),
    };
    mockGetModerationAgent = jest.fn(() => mockAgent);

    jest.unstable_mockModule("../../src/mastra/agents/index.js", () => ({
      getModerationAgent: mockGetModerationAgent,
      ModerationEnrichmentSchema: {},
    }));

    const mod = await import("../../src/lib/mastra.js");
    enrichMessage = mod.enrichMessage;
    isMastraEnabled = mod.isMastraEnabled;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when MASTRA_ENABLED is not 'true'", async () => {
    process.env.MASTRA_ENABLED = "false";
    const result = await enrichMessage({
      text: "hello world",
      mlResult: { toxic_score: 0.1, spam_score: 0.05 },
    });
    expect(result).toBeNull();
    expect(mockGetModerationAgent).not.toHaveBeenCalled();
  });

  it("returns null when MASTRA_ENABLED is unset", async () => {
    delete process.env.MASTRA_ENABLED;
    const result = await enrichMessage({
      text: "hello world",
      mlResult: { toxic_score: 0.1, spam_score: 0.05 },
    });
    expect(result).toBeNull();
    expect(mockGetModerationAgent).not.toHaveBeenCalled();
  });

  it("returns null when MASTRA_ENABLED=true but agent throws", async () => {
    process.env.MASTRA_ENABLED = "true";
    mockAgent.generate.mockRejectedValue(new Error("API key invalid"));

    const result = await enrichMessage({
      text: "hello world",
      mlResult: { toxic_score: 0.1, spam_score: 0.05 },
    });

    expect(result).toBeNull();
    expect(mockGetModerationAgent).toHaveBeenCalled();
  });

  it("returns null when MASTRA_ENABLED=true but no GROQ_API_KEY (agent fails)", async () => {
    process.env.MASTRA_ENABLED = "true";
    process.env.GROQ_API_KEY = undefined;
    mockAgent.generate.mockRejectedValue(new Error("Missing API key"));

    const result = await enrichMessage({
      text: "hello world",
      mlResult: { toxic_score: 0.1, spam_score: 0.05 },
    });

    expect(result).toBeNull();
  });

  it("returns validated object on success", async () => {
    process.env.MASTRA_ENABLED = "true";
    mockAgent.generate.mockResolvedValue({ object: mockEnrichmentResult });

    const result = await enrichMessage({
      text: "hello world",
      mlResult: { toxic_score: 0.1, spam_score: 0.05 },
      context: { userId: "user-123" },
    });

    expect(result).toEqual(mockEnrichmentResult);
    expect(mockGetModerationAgent).toHaveBeenCalled();
    expect(mockAgent.generate).toHaveBeenCalledWith(
      expect.stringContaining("hello world"),
      expect.objectContaining({ output: expect.any(Object) })
    );
  });

  it("passes mlResult and context to the prompt", async () => {
    process.env.MASTRA_ENABLED = "true";
    mockAgent.generate.mockResolvedValue({ object: mockEnrichmentResult });

    await enrichMessage({
      text: "test message",
      mlResult: { toxic_score: 0.9, spam_score: 0.8 },
      context: { messageId: "msg-456", isGroup: true },
    });

    const call = mockAgent.generate.mock.calls[0];
    const prompt = call[0];
    expect(prompt).toContain("test message");
    expect(prompt).toContain("toxic_score: 0.9");
    expect(prompt).toContain("spam_score: 0.8");
    expect(prompt).toContain("messageId");
    expect(prompt).toContain("isGroup");
  });

  it("uses default mlResult values when not provided", async () => {
    process.env.MASTRA_ENABLED = "true";
    mockAgent.generate.mockResolvedValue({ object: mockEnrichmentResult });

    await enrichMessage({
      text: "test message",
      mlResult: undefined,
    });

    const prompt = mockAgent.generate.mock.calls[0][0];
    expect(prompt).toContain("toxic_score: 0");
    expect(prompt).toContain("spam_score: 0");
  });

  it("isMastraEnabled returns true only when env is 'true'", () => {
    process.env.MASTRA_ENABLED = "false";
    expect(isMastraEnabled()).toBe(false);

    process.env.MASTRA_ENABLED = "true";
    expect(isMastraEnabled()).toBe(true);

    delete process.env.MASTRA_ENABLED;
    expect(isMastraEnabled()).toBe(false);
  });
});