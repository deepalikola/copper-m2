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

type Rec = Extract<
  ReturnType<typeof import("@/lib/copper/assistant/tools").recommendProduct>,
  { status: "recommendation" }
>;

async function recommend(
  input: Parameters<
    typeof import("@/lib/copper/assistant/tools").recommendProduct
  >[0],
) {
  const { recommendProduct } = await loadTools();
  const result = recommendProduct(input);
  expect(result.status).toBe("recommendation");
  return result as Rec;
}

describe("recommend_product", () => {
  it("first asks who the shopper is", async () => {
    const { recommendProduct } = await loadTools();
    const result = recommendProduct({});
    expect(result.status).toBe("needs_answers");
    if (result.status !== "needs_answers") return;
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].id).toBe("who");
    expect(result.questions[0].options.map((o) => o.value)).toEqual([
      "homemaker",
      "retiree_snowbird",
      "student",
      "professional",
      "heavy_ai_user",
    ]);
  });

  it("then asks only the jobs that fit that kind of shopper", async () => {
    const { recommendProduct } = await loadTools();
    const result = recommendProduct({ who: "homemaker" });
    expect(result.status).toBe("needs_answers");
    if (result.status !== "needs_answers") return;
    expect(result.questions[0].id).toBe("job");
    expect(result.questions[0].options.map((o) => o.value)).toEqual([
      "lists_and_reminders",
      "run_the_house",
      "weather_alerts",
      "planning_and_ideas",
    ]);
  });

  it("asks again when the job doesn't fit who they are", async () => {
    const { recommendProduct } = await loadTools();
    const result = recommendProduct({
      who: "student",
      job: "meeting_summaries",
    });
    expect(result.status).toBe("needs_answers");
    if (result.status !== "needs_answers") return;
    expect(result.questions[0].options.map((o) => o.value)).toEqual([
      "lecture_notes",
      "quick_ideas",
    ]);
  });

  it("points a student who wants lecture notes to Copper Notes, in the catalog's words", async () => {
    const result = await recommend({ who: "student", job: "lecture_notes" });
    expect(result.product).toMatchObject({
      id: "copper-notes",
      name: "Copper Notes",
      priceUsd: 129,
      colors: ["Brushed Copper", "Desert Sand", "Night Sky"],
    });
    expect(result.why.feature).toBe("Lecture Mode");
    expect(result.why.description).toMatch(/key terms/i);
    expect(result.examples.map((e) => e.result).join(" ")).toMatch(
      /Consent Chime/,
    );
    expect(result.plus).toBeNull();
    expect(result.alsoConsider).toMatchObject({
      id: "copper-home",
      priceUsd: 149,
    });
  });

  it("shows a homemaker real list and reminder examples with Copper Home", async () => {
    const result = await recommend({
      who: "homemaker",
      job: "lists_and_reminders",
    });
    expect(result.product).toMatchObject({ id: "copper-home", priceUsd: 149 });
    expect(result.why.feature).toBe("Household Memory");
    const said = result.examples.map((e) => e.say).join(" | ");
    expect(said).toContain("add coriander to the shopping list");
    expect(said).toContain("pool guy comes Thursdays");
    expect(JSON.stringify(result.examples)).toContain(
      "delete it in the Copper app",
    );
  });

  it("covers the Arizona weather features for weather alerts", async () => {
    const result = await recommend({ who: "homemaker", job: "weather_alerts" });
    expect(result.why.feature).toBe("Monsoon Mode");
    const text = JSON.stringify(result.examples);
    expect(text).toContain("Haboob Alert");
    expect(text).toContain("Heat Check");
    expect(text).toContain("pets");
  });

  it("includes dinner ideas and trip planning, and says planning uses Copper Plus", async () => {
    const result = await recommend({
      who: "homemaker",
      job: "planning_and_ideas",
    });
    const said = result.examples.map((e) => e.say).join(" | ");
    expect(said).toContain("What can I cook tonight?");
    expect(said).toContain("Sedona");
    expect(result.plus).toMatchObject({ required: false });
    expect(result.plus?.priceNote).toContain("$7.99/month");
    expect(result.plus?.priceNote).toContain("$79/year");
  });

  it("sends each kind of shopper to the right product", async () => {
    const cases = [
      ["retiree_snowbird", "away_for_summer", "copper-home", "Snowbird Mode"],
      ["student", "quick_ideas", "copper-notes", "Idea Mode"],
      ["professional", "meeting_summaries", "copper-notes", "Meeting Mode"],
      [
        "professional",
        "searchable_history",
        "copper-notes",
        "Searchable meeting history",
      ],
      ["heavy_ai_user", "complex_questions", "copper-home", "Refined answers"],
      [
        "heavy_ai_user",
        "long_summaries",
        "copper-notes",
        "Long-form summaries",
      ],
    ] as const;
    for (const [who, job, product, feature] of cases) {
      const result = await recommend({ who, job });
      expect(result.product.id, `${who} / ${job}`).toBe(product);
      expect(result.why.feature, `${who} / ${job}`).toBe(feature);
    }
  });

  it("says when a job needs Copper Plus", async () => {
    for (const [who, job] of [
      ["professional", "searchable_history"],
      ["heavy_ai_user", "complex_questions"],
      ["heavy_ai_user", "long_summaries"],
    ] as const) {
      const result = await recommend({ who, job });
      expect(result.plus?.required, `${who} / ${job}`).toBe(true);
    }
  });

  it("never shows a made-up statistic or promises podcasts", async () => {
    const { recommendProduct } = await loadTools();
    const whos = [
      "homemaker",
      "retiree_snowbird",
      "student",
      "professional",
      "heavy_ai_user",
    ] as const;
    for (const who of whos) {
      const questions = recommendProduct({ who });
      if (questions.status !== "needs_answers")
        throw new Error("expected a question");
      for (const option of questions.questions[0].options) {
        const text = JSON.stringify(
          recommendProduct({ who, job: option.value as never }),
        );
        expect(text, `${who} / ${option.value}`).not.toMatch(/\d+\s?%/);
        expect(text, `${who} / ${option.value}`).not.toMatch(
          /podcast|chefs?\b|prefer/i,
        );
      }
    }
  });

  it("flags a budget that is too low, and names the cheaper device", async () => {
    const tight = await recommend({
      who: "homemaker",
      job: "run_the_house",
      maxBudgetUsd: 135,
    });
    expect(tight.withinBudget).toBe(false);
    expect(tight.budgetNote).toContain("$149");
    expect(tight.budgetNote).toContain("$135");
    expect(tight.budgetNote).toContain("Copper Notes is $129");

    const roomy = await recommend({
      who: "homemaker",
      job: "run_the_house",
      maxBudgetUsd: 200,
    });
    expect(roomy).toMatchObject({ withinBudget: true, budgetNote: null });
    const none = await recommend({ who: "homemaker", job: "run_the_house" });
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
        getPlans: () =>
          real
            .getPlans()
            .map((p) =>
              p.id === "copper-plus"
                ? { ...p, monthlyUsd: 9.49, annualUsd: 95 }
                : p,
            ),
      };
    });
    const result = await recommend({
      who: "professional",
      job: "searchable_history",
    });
    expect(result.product.priceUsd).toBe(179);
    expect(result.alsoConsider.priceUsd).toBe(199);
    expect(result.plus?.priceNote).toContain("$9.49/month");
    expect(result.plus?.priceNote).toContain("$95/year");
    expect(JSON.stringify(result)).not.toMatch(/\$129|\$149|\$7\.99|\$79\b/);
  });

  it("rejects input outside its contract", async () => {
    const { recommendProductInput } = await loadTools();
    const ok = { who: "student", job: "lecture_notes", maxBudgetUsd: 150 };
    expect(recommendProductInput.safeParse({}).success).toBe(true);
    expect(recommendProductInput.safeParse(ok).success).toBe(true);
    const bad = [
      { ...ok, who: "astronaut" },
      { ...ok, job: "gaming" },
      { ...ok, maxBudgetUsd: -1 },
      { ...ok, maxBudgetUsd: "cheap" },
      { ...ok, color: "Night Sky" },
      { ...ok, where: "at_home" },
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
      questions: [{ id: "who", question: "Which sounds most like you?" }],
    });
    expect(result.reply).toContain("Where will you use it");
  });

  it("a student who records lectures is pointed to Copper Notes", async () => {
    model = modelStreaming(
      calls({ who: "student", job: "lecture_notes" }),
      says("Copper Notes is the one for you."),
    );
    const result = await ask(
      "I'm a student who records lectures. Which should I get?",
    );
    const [call] = toolCallsOf(result);
    expect(call.input).toEqual({ who: "student", job: "lecture_notes" });
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
