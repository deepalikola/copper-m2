// The fifth Ask Copper tool, recommend_product (the extension). It asks the
// shopper what it still needs to know, then points to Copper Home or Copper
// Notes. Fast checks with a mock model: no AI key, no cost.
import type { LanguageModelV4StreamPart as ModelStreamPart } from "@ai-sdk/provider";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finalValue } from "@/lib/ai/live";
import { toolCallsOf } from "@/lib/copper/assistant/progress";

let model: MockLanguageModelV4;
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => () => model,
}));

async function loadTools() {
  vi.resetModules();
  return import("@/lib/copper/assistant/tools");
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("@/lib/copper/catalog");
  vi.resetModules();
});

describe("recommend_product", () => {
  it("asks both questions when it knows nothing yet", async () => {
    const { recommendProduct } = await loadTools();
    const result = recommendProduct({});
    expect(result.status).toBe("needs_answers");
    if (result.status !== "needs_answers") return;
    expect(result.questions.map((q) => q.id)).toEqual(["where", "job"]);
    expect(result.questions[0].options.map((o) => o.value)).toEqual([
      "at_home",
      "on_the_go",
    ]);
    expect(result.questions[1].options.map((o) => o.value)).toEqual([
      "home_control",
      "household_memory",
      "storm_alerts",
      "meetings",
      "lectures",
    ]);
  });

  it("only asks what is still missing", async () => {
    const { recommendProduct } = await loadTools();
    const result = recommendProduct({ where: "on_the_go" });
    expect(result.status).toBe("needs_answers");
    if (result.status !== "needs_answers") return;
    expect(result.questions.map((q) => q.id)).toEqual(["job"]);
  });

  it("points a lecture-taker on the go to Copper Notes, with the catalog's own words", async () => {
    const { recommendProduct } = await loadTools();
    const result = recommendProduct({ where: "on_the_go", job: "lectures" });
    expect(result.status).toBe("recommendation");
    if (result.status !== "recommendation") return;
    expect(result.product).toMatchObject({
      id: "copper-notes",
      name: "Copper Notes",
      priceUsd: 129,
      colors: ["Brushed Copper", "Desert Sand", "Night Sky"],
    });
    expect(result.why.feature).toBe("Lecture Mode");
    expect(result.why.description).toMatch(/notes/i);
    expect(result.otherFeatures).toEqual(["Meeting Mode", "Consent Chime"]);
    expect(result.fit).toBe("great");
    expect(result.fitNote).toBeNull();
    expect(result.alsoConsider).toMatchObject({
      id: "copper-home",
      priceUsd: 149,
    });
  });

  it("points home-control at home to Copper Home", async () => {
    const { recommendProduct } = await loadTools();
    const result = recommendProduct({ where: "at_home", job: "home_control" });
    expect(result).toMatchObject({
      status: "recommendation",
      product: { id: "copper-home", priceUsd: 149 },
      why: { feature: "Smart-home control" },
      fit: "great",
    });
  });

  it("sends storm alerts and household memory to Copper Home, and meetings to Copper Notes", async () => {
    const { recommendProduct } = await loadTools();
    const pick = (job: Parameters<typeof recommendProduct>[0]["job"]) => {
      const result = recommendProduct({ where: "at_home", job });
      return result.status === "recommendation" ? result.product.id : null;
    };
    expect(pick("storm_alerts")).toBe("copper-home");
    expect(pick("household_memory")).toBe("copper-home");
    expect(pick("meetings")).toBe("copper-notes");
  });

  it("lets what they want to do decide, and says so when the place doesn't match", async () => {
    const { recommendProduct } = await loadTools();
    const result = recommendProduct({ where: "at_home", job: "lectures" });
    expect(result.status).toBe("recommendation");
    if (result.status !== "recommendation") return;
    expect(result.product.id).toBe("copper-notes");
    expect(result.fit).toBe("partial");
    expect(result.fitNote).toContain("at home");
    expect(result.fitNote).toContain("Copper Notes");
  });

  it("flags a budget that is too low, and names the cheaper device", async () => {
    const { recommendProduct } = await loadTools();
    const tight = recommendProduct({
      where: "at_home",
      job: "home_control",
      maxBudgetUsd: 135,
    });
    expect(tight).toMatchObject({
      status: "recommendation",
      withinBudget: false,
    });
    if (tight.status !== "recommendation") return;
    expect(tight.budgetNote).toContain("$149");
    expect(tight.budgetNote).toContain("$135");
    expect(tight.budgetNote).toContain("Copper Notes is $129");

    const roomy = recommendProduct({
      where: "at_home",
      job: "home_control",
      maxBudgetUsd: 200,
    });
    expect(roomy).toMatchObject({ withinBudget: true, budgetNote: null });
    const none = recommendProduct({ where: "at_home", job: "home_control" });
    expect(none).toMatchObject({ withinBudget: null, budgetNote: null });
  });

  it("follows the catalog when prices change", async () => {
    vi.doMock("@/lib/copper/catalog", async (importOriginal) => {
      const real =
        await importOriginal<typeof import("@/lib/copper/catalog")>();
      return {
        ...real,
        getProducts: () =>
          real.getProducts().map((p) => ({ ...p, priceUsd: p.priceUsd + 50 })),
      };
    });
    const { recommendProduct } = await loadTools();
    const result = recommendProduct({ where: "on_the_go", job: "meetings" });
    expect(result).toMatchObject({
      status: "recommendation",
      product: { id: "copper-notes", priceUsd: 179 },
      alsoConsider: { priceUsd: 199 },
    });
    expect(JSON.stringify(result)).not.toContain("129");
  });

  it("rejects input outside its contract", async () => {
    const { recommendProductInput } = await loadTools();
    const ok = { where: "at_home", job: "meetings", maxBudgetUsd: 150 };
    expect(recommendProductInput.safeParse({}).success).toBe(true);
    expect(recommendProductInput.safeParse(ok).success).toBe(true);
    const bad = [
      { ...ok, where: "in_space" },
      { ...ok, job: "gaming" },
      { ...ok, maxBudgetUsd: -1 },
      { ...ok, maxBudgetUsd: "cheap" },
      { ...ok, color: "Night Sky" },
    ];
    for (const input of bad) {
      expect(
        recommendProductInput.safeParse(input).success,
        JSON.stringify(input),
      ).toBe(false);
    }
  });

  it("joins the other four tools, described for the model", async () => {
    const { copperTools } = await loadTools();
    expect(Object.keys(copperTools).sort()).toEqual([
      "calculate_cost",
      "check_availability",
      "get_prices",
      "get_products",
      "recommend_product",
    ]);
    const tool = copperTools.recommend_product;
    expect(tool.description).toMatch(/Copper Home and Copper Notes/);
    expect(typeof tool.execute).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// The chat flow: the model picks the tool, the app runs it, Copper answers.
// ---------------------------------------------------------------------------

type StreamPart = Parameters<
  typeof convertArrayToReadableStream<ModelStreamPart>
>[0][number];

const usage = {
  inputTokens: {
    total: 500,
    noCache: 500,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 50, text: 50, reasoning: undefined },
};
const finish = (reason: "stop" | "tool-calls"): StreamPart => ({
  type: "finish",
  finishReason: { unified: reason, raw: undefined },
  usage,
});
const calls = (input: unknown): StreamPart[] => [
  { type: "tool-input-start", id: "call-1", toolName: "recommend_product" },
  { type: "tool-input-delta", id: "call-1", delta: JSON.stringify(input) },
  { type: "tool-input-end", id: "call-1" },
  {
    type: "tool-call",
    toolCallId: "call-1",
    toolName: "recommend_product",
    input: JSON.stringify(input),
  },
  finish("tool-calls"),
];
const says = (text: string): StreamPart[] => [
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: text },
  { type: "text-end", id: "t1" },
  finish("stop"),
];

function modelStreaming(...steps: StreamPart[][]) {
  let step = 0;
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream(steps[step++] ?? says("")),
    }),
  });
}

async function ask(content: string) {
  vi.resetModules();
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-key");
  const { askCopper } = await import("@/lib/copper/assistant/ask");
  return finalValue(
    (await askCopper({ messages: [{ role: "user", content }], useTools: true }))
      .progress,
  );
}

describe("Ask Copper with the fifth tool", () => {
  it("offers all five tools, and Copper's instructions mention recommend_product", async () => {
    model = modelStreaming(says("ok"));
    await ask("Which one should I get?");
    const names = (model.doStreamCalls[0].tools ?? [])
      .map((t) => t.name)
      .sort();
    expect(names).toContain("recommend_product");
    expect(names).toHaveLength(5);
    const system = model.doStreamCalls[0].prompt.find(
      (m) => m.role === "system",
    );
    expect(String(system?.content)).toContain("recommend_product");
  });

  it("a shopper who can't decide gets the questions to ask", async () => {
    model = modelStreaming(
      calls({}),
      says(
        "Happy to help! Where will you use it most, and what do you want help with?",
      ),
    );
    const result = await ask("I can't decide which Copper device to get.");
    const [call] = toolCallsOf(result);
    expect(call.name).toBe("recommend_product");
    expect(call.output).toMatchObject({
      status: "needs_answers",
      questions: [{ id: "where" }, { id: "job" }],
    });
    expect(result.reply).toContain("Where will you use it");
  });

  it("a student who records lectures is pointed to Copper Notes", async () => {
    model = modelStreaming(
      calls({ where: "on_the_go", job: "lectures" }),
      says("Copper Notes is the one for you."),
    );
    const result = await ask(
      "I'm a student who records lectures. Which should I get?",
    );
    const [call] = toolCallsOf(result);
    expect(call.input).toEqual({ where: "on_the_go", job: "lectures" });
    expect(call.output).toMatchObject({
      status: "recommendation",
      product: { id: "copper-notes" },
      why: { feature: "Lecture Mode" },
    });
    expect(result.reply).toBe("Copper Notes is the one for you.");
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain(
      "Lecture Mode",
    );
  });
});
