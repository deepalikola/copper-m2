// Module 2: the four tools Ask Copper can use. Products and prices come from
// lib/copper/catalog.ts and stock from lib/copper/inventory.ts, so the
// chatbot never has to make them up.
// The contract for each tool is in specs/module-2/spec.md.
import { tool } from "ai";
import { z } from "zod";
import {
  formatUsd,
  getPlans,
  getProducts,
  type Plan,
  type ProductId,
} from "@/lib/copper/catalog";
import { readInventory } from "@/lib/copper/inventory";

export type ProductList = {
  products: {
    id: ProductId;
    name: string;
    type: string;
    priceUsd: number;
    colors: string[];
  }[];
};

export type Prices = {
  products: { id: ProductId; name: string; priceUsd: number }[];
  plans: {
    id: Plan["id"];
    name: string;
    monthlyUsd: number;
    annualUsd: number;
  }[];
};

export type CalculateCostInput = {
  products: ProductId[];
  plan: Plan["id"];
  billing: "monthly" | "annual";
  years: number;
};

export type CostBreakdown = {
  lines: { item: string; usd: number }[];
  totalUsd: number;
};

export type CheckAvailabilityInput = { product: ProductId; color?: string };

export type Stock = "in_stock" | "low_stock" | "backordered";

export type Availability =
  | {
      status: "ok";
      product: string;
      colors: { color: string; stock: Stock; restockDate: string | null }[];
    }
  | { status: "not_a_color"; product: string; color: string; colors: string[] }
  | { status: "unavailable"; message: string };

const PRODUCT_IDS = ["copper-home", "copper-notes"] as const;

/** Round to whole cents, so $7.99 x 12 never shows as $95.88000000000001. */
function toCents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export type RecommendWho =
  | "homemaker"
  | "retiree_snowbird"
  | "student"
  | "professional"
  | "heavy_ai_user";

export type RecommendJob =
  | "lists_and_reminders"
  | "run_the_house"
  | "weather_alerts"
  | "planning_and_ideas"
  | "away_for_summer"
  | "lecture_notes"
  | "quick_ideas"
  | "meeting_summaries"
  | "searchable_history"
  | "complex_questions"
  | "long_summaries";

export type RecommendProductInput = {
  who?: RecommendWho;
  job?: RecommendJob;
  maxBudgetUsd?: number;
};

export type RecommendQuestion = {
  id: "who" | "job";
  question: string;
  options: { value: string; label: string }[];
};

/** One feature on the "how the features connect" map. */
export type VisualFeature = {
  name: string;
  /** Needs Copper Plus. */
  plus: boolean;
  /** The Copper app, shown as part of the map. */
  app: boolean;
  /** The shopper's choice uses it. */
  highlighted: boolean;
};

/** One step in the "what happens behind the scenes" strip. */
export type VisualStep = {
  title: string;
  detail: string;
  /** Where it runs, when that matters. */
  tier: "device" | "raw_ore" | "refined" | null;
  plus: boolean;
  highlighted: boolean;
};

/** One real thing a shopper can say or do, and what Copper does with it. */
export type RecommendExample = { say: string; result: string };

export type Recommendation =
  | { status: "needs_answers"; questions: RecommendQuestion[] }
  | {
      status: "recommendation";
      who: RecommendWho;
      product: {
        id: ProductId;
        name: string;
        type: string;
        priceUsd: number;
        colors: string[];
      };
      /** The Copper feature that fits what the shopper wants to do. */
      why: { feature: string; description: string };
      /** How Copper fits this kind of shopper's day. */
      examples: RecommendExample[];
      /** Two pictures: how the product's features connect, and how it works. */
      visual: { features: VisualFeature[]; steps: VisualStep[] };
      /** Set when the job needs, or gets much better with, Copper Plus. */
      plus: {
        required: boolean;
        priceNote: string;
        reason: string;
      } | null;
      withinBudget: boolean | null;
      budgetNote: string | null;
      alsoConsider: { id: ProductId; name: string; priceUsd: number };
    };

/** get_products: what Copper sells and which colors each one comes in. */
export function listProducts(): ProductList {
  return {
    products: getProducts().map((product) => ({
      id: product.id,
      name: product.name,
      type: product.type,
      priceUsd: product.priceUsd,
      colors: product.colors,
    })),
  };
}

/** get_prices: every product and plan price, read from the catalog. */
export function getPrices(): Prices {
  return {
    products: getProducts().map(({ id, name, priceUsd }) => ({
      id,
      name,
      priceUsd,
    })),
    plans: getPlans().map(({ id, name, monthlyUsd, annualUsd }) => ({
      id,
      name,
      monthlyUsd,
      annualUsd,
    })),
  };
}

/** The calculate_cost contract: anything outside it is rejected. */
export const calculateCostInput: z.ZodType<CalculateCostInput> = z.strictObject(
  {
    products: z.array(z.enum(PRODUCT_IDS)).max(5),
    plan: z.enum(["free", "copper-plus"]),
    billing: z.enum(["monthly", "annual"]),
    years: z.number().int().min(1).max(5),
  },
);

/** calculate_cost: the total cost of devices plus a plan over some years. */
export function calculateCost(input: CalculateCostInput): CostBreakdown {
  const catalog = getProducts();
  const lines: CostBreakdown["lines"] = [];

  // Each device is paid for once, however long the plan runs.
  for (const id of input.products) {
    const product = catalog.find((candidate) => candidate.id === id)!;
    lines.push({ item: product.name, usd: toCents(product.priceUsd) });
  }

  // Copper Plus covers the whole household, so it is one line. Free adds none.
  if (input.plan === "copper-plus") {
    const plus = getPlans().find((plan) => plan.id === "copper-plus")!;
    const perYear =
      input.billing === "monthly" ? plus.monthlyUsd * 12 : plus.annualUsd;
    lines.push({
      item: `${plus.name} (${input.billing}, ${input.years} ${
        input.years === 1 ? "year" : "years"
      })`,
      usd: toCents(perYear * input.years),
    });
  }

  const totalUsd = toCents(lines.reduce((sum, line) => sum + line.usd, 0));
  return { lines, totalUsd };
}

/** The check_availability contract: one product, and optionally one color. */
export const checkAvailabilityInput: z.ZodType<CheckAvailabilityInput> =
  z.strictObject({
    product: z.enum(PRODUCT_IDS),
    color: z.string().optional(),
  });

function stockFor(units: number): Stock {
  if (units <= 0) return "backordered";
  return units < 10 ? "low_stock" : "in_stock";
}

/** check_availability: stock for one product (or one of its colors), read fresh each time. */
export async function checkAvailability(
  input: CheckAvailabilityInput,
): Promise<Availability> {
  const product = getProducts().find(
    (candidate) => candidate.id === input.product,
  )!;

  // A color the product doesn't come in is a catalog fact, so it's answered
  // before stock is read, and even when stock can't be read.
  const wanted = input.color?.trim().toLowerCase();
  const catalogColors =
    wanted === undefined
      ? product.colors
      : product.colors.filter((color) => color.toLowerCase() === wanted);
  if (wanted !== undefined && catalogColors.length === 0) {
    return {
      status: "not_a_color",
      product: product.name,
      color: input.color!,
      colors: product.colors,
    };
  }

  // Read stock on every call: it changes, so it's never saved.
  const rows = await readInventory();
  if (rows === null) {
    return {
      status: "unavailable",
      message: "Stock can't be checked right now. Please try again later.",
    };
  }

  const colors = catalogColors.flatMap((color) => {
    const row = rows.find(
      (candidate) =>
        candidate.product === product.name &&
        candidate.color.toLowerCase() === color.toLowerCase(),
    );
    if (!row) return [];
    const stock = stockFor(row.units_in_stock);
    return [
      {
        color,
        stock,
        restockDate: stock === "backordered" ? row.next_shipment : null,
      },
    ];
  });
  return { status: "ok", product: product.name, colors };
}

// recommend_product: works out who the shopper is, what they want help with,
// and which product fits. Product names, prices and colors come from the
// catalog. The "who it's for" groups, the feature each job points to, and the
// examples below are taken from the Product Bible (Sections 3, 4.1, 4.2 and
// 4.3), so every example is something Copper really does. Dinner ideas are an
// everyday question to Copper Home's assistant, not a recipe feature.
const WHO: Record<RecommendWho, { label: string; jobs: RecommendJob[] }> = {
  homemaker: {
    label: "A homemaker or family manager",
    jobs: [
      "lists_and_reminders",
      "run_the_house",
      "weather_alerts",
      "planning_and_ideas",
    ],
  },
  retiree_snowbird: {
    label: "A retiree or snowbird",
    jobs: [
      "away_for_summer",
      "weather_alerts",
      "lists_and_reminders",
      "run_the_house",
    ],
  },
  student: {
    label: "A student",
    jobs: ["lecture_notes", "quick_ideas"],
  },
  professional: {
    label: "A busy professional",
    jobs: ["meeting_summaries", "quick_ideas", "searchable_history"],
  },
  heavy_ai_user: {
    label: "A heavy AI user",
    jobs: ["complex_questions", "long_summaries"],
  },
};

type JobInfo = {
  productId: ProductId;
  label: string;
  /** The catalog feature this job is about, if the catalog lists it. */
  catalogFeature?: string;
  /** Used when the catalog doesn't list the feature (Product Bible wording). */
  feature?: string;
  description?: string;
  examples: RecommendExample[];
  plus?: { required: boolean; reason: string };
  /** Which "behind the scenes" strip to draw, and which steps this job uses. */
  flow: FlowKey;
  focus: number[];
  /** Which features on the map this job uses. */
  highlight: string[];
};

const JOBS: Record<RecommendJob, JobInfo> = {
  lists_and_reminders: {
    productId: "copper-home",
    flow: "voice",
    focus: [0, 1, 2, 4],
    highlight: ["Household Memory", "Copper app"],
    label: "Lists and reminders",
    catalogFeature: "Household Memory",
    examples: [
      {
        say: "Hey Copper, add coriander to the shopping list.",
        result: "Copper adds it to your list.",
      },
      {
        say: "Copper, remember the pool guy comes Thursdays.",
        result:
          "Household Memory keeps it. You can view and delete it in the Copper app.",
      },
      {
        say: "Set a timer for 10 minutes.",
        result: "Done on the device itself, with no cloud trip.",
      },
    ],
  },
  run_the_house: {
    productId: "copper-home",
    flow: "voice",
    focus: [0, 1],
    highlight: ["Smart-home control", "Monsoon Mode"],
    label: "Running the house",
    catalogFeature: "Smart-home control",
    examples: [
      {
        say: "Turn off the lights.",
        result: "Copper runs your lights, thermostat, sprinklers and garage.",
      },
      {
        say: "Rain is coming.",
        result: "Monsoon Mode pauses the sprinklers for you.",
      },
    ],
  },
  weather_alerts: {
    productId: "copper-home",
    flow: "alerts",
    focus: [0, 1, 2, 3],
    highlight: ["Monsoon Mode", "Haboob Alert", "Heat Check"],
    label: "Weather alerts",
    catalogFeature: "Monsoon Mode",
    examples: [
      {
        say: "A storm is on the way.",
        result: "Monsoon Mode sends a storm alert and pauses the sprinklers.",
      },
      {
        say: "A dust storm is coming.",
        result: "Haboob Alert warns you and reminds you to close the windows.",
      },
      {
        say: "It's dangerously hot.",
        result:
          "Heat Check alerts you, reminds you to bring pets inside and to check the back seat before leaving the car.",
      },
    ],
  },
  planning_and_ideas: {
    productId: "copper-home",
    flow: "voice",
    focus: [0, 2, 3],
    highlight: ["Refined answers"],
    label: "Planning and ideas",
    feature: "Everyday questions and planning",
    description:
      "Ask Copper Home questions in plain English or Spanish. Everyday questions are free. Complex planning uses Copper Plus.",
    examples: [
      {
        say: "What can I cook tonight?",
        result: "An everyday question: Copper answers it like any other.",
      },
      {
        say: "Plan a 3-day Sedona trip for two kids who hate hiking.",
        result:
          "Complex planning goes to the Refined tier, which is part of Copper Plus.",
      },
      {
        say: "Explain my water bill.",
        result: "Another complex question for the Refined tier.",
      },
    ],
    plus: {
      required: false,
      reason: "Trip planning and bill explanations use the Refined tier.",
    },
  },
  away_for_summer: {
    productId: "copper-home",
    flow: "away",
    focus: [0, 1, 2],
    highlight: ["Snowbird Mode", "Heat Check"],
    label: "Looking after the house while away",
    feature: "Snowbird Mode",
    description:
      "Pauses routines and checks in on the house while you're away for the summer.",
    examples: [
      {
        say: "I'm leaving for the summer.",
        result:
          "Snowbird Mode pauses your routines and checks in on the house.",
      },
      {
        say: "It's dangerously hot.",
        result: "Heat Check alerts you.",
      },
    ],
  },
  lecture_notes: {
    productId: "copper-notes",
    flow: "notes",
    focus: [0, 1, 2, 3],
    highlight: ["Lecture Mode", "Consent Chime", "Copper app"],
    label: "Notes in lectures",
    catalogFeature: "Lecture Mode",
    examples: [
      {
        say: "Clip it on and tap the center button.",
        result:
          "Lecture Mode turns the lecture into organized notes with key terms.",
      },
      {
        say: "Share my notes with a classmate.",
        result: "Summaries appear in the Copper app and can be shared.",
      },
      {
        say: "Recording starts.",
        result:
          "The Consent Chime plays and the amber ring lights, so people nearby know.",
      },
    ],
  },
  quick_ideas: {
    productId: "copper-notes",
    flow: "notes",
    focus: [0, 1, 2, 3],
    highlight: ["Idea Mode", "Copper app"],
    label: "Capturing quick ideas",
    feature: "Idea Mode",
    description: "Quick voice memos turned into tidy notes.",
    examples: [
      {
        say: "Tap once and say your idea out loud.",
        result: "Idea Mode turns the voice memo into a tidy note.",
      },
      {
        say: "Open the Copper app.",
        result: "The summary is waiting there, ready to share.",
      },
    ],
  },
  meeting_summaries: {
    productId: "copper-notes",
    flow: "notes",
    focus: [0, 1, 2, 3],
    highlight: ["Meeting Mode", "Consent Chime", "Copper app"],
    label: "Meeting summaries",
    catalogFeature: "Meeting Mode",
    examples: [
      {
        say: "Clip it on before the meeting starts.",
        result:
          "Meeting Mode gives you a summary, the decisions and the action items.",
      },
      {
        say: "Recording starts.",
        result:
          "The Consent Chime plays and the amber ring lights, so everyone in the room knows.",
      },
    ],
  },
  searchable_history: {
    productId: "copper-notes",
    flow: "notes",
    focus: [2, 3],
    highlight: ["Searchable history", "Copper app"],
    label: "Searching past meetings",
    feature: "Searchable meeting history",
    description:
      "Long-form summaries and a searchable history of your meetings, with Copper Plus.",
    examples: [
      {
        say: "What did we decide about the budget last month?",
        result: "With Copper Plus, your meeting history is searchable.",
      },
      {
        say: "Summarize this long meeting.",
        result: "Copper Plus unlocks long-form summaries.",
      },
    ],
    plus: {
      required: true,
      reason:
        "Searchable history and long-form summaries are Copper Plus features.",
    },
  },
  complex_questions: {
    productId: "copper-home",
    flow: "voice",
    focus: [0, 3],
    highlight: ["Refined answers"],
    label: "The smartest answers",
    feature: "Refined answers",
    description:
      "Copper Plus unlocks Refined, frontier models in the Copper Cloud, for complex questions and planning, with the longest memory.",
    examples: [
      {
        say: "Plan a 3-day Sedona trip for two kids who hate hiking.",
        result: "A Refined answer, with Copper Plus.",
      },
      {
        say: "Explain my water bill.",
        result: "Another Refined answer.",
      },
    ],
    plus: {
      required: true,
      reason: "Refined answers and the longest memory come with Copper Plus.",
    },
  },
  long_summaries: {
    productId: "copper-notes",
    flow: "notes",
    focus: [2],
    highlight: ["Long-form summaries"],
    label: "Long-form summaries",
    feature: "Long-form summaries",
    description: "Copper Plus unlocks long-form summaries on Copper Notes.",
    examples: [
      {
        say: "Summarize this two-hour session.",
        result: "A long-form summary, with Copper Plus.",
      },
      {
        say: "Find that meeting from last spring.",
        result: "Searchable meeting history, with Copper Plus.",
      },
    ],
    plus: {
      required: true,
      reason: "Long-form summaries are a Copper Plus feature.",
    },
  },
};

type FlowKey = "voice" | "alerts" | "away" | "notes";
type FlowStep = Omit<VisualStep, "highlighted">;

// How each product works behind the scenes, in the Product Bible's words
// (Section 3, "The AI tiers", and Sections 4.1 and 4.2).
const FLOWS: Record<FlowKey, FlowStep[]> = {
  voice: [
    {
      title: "You speak",
      detail: "Say \u201cHey Copper\u201d, then ask or give a command.",
      tier: null,
      plus: false,
    },
    {
      title: "On the device",
      detail:
        "Simple commands, like lights and timers, are handled on the device itself.",
      tier: "device",
      plus: false,
    },
    {
      title: "Raw Ore",
      detail:
        "Everyday questions, like adding to your list, go to a low-cost cloud model.",
      tier: "raw_ore",
      plus: false,
    },
    {
      title: "Refined",
      detail:
        "Complex questions and planning go to frontier models in the Copper Cloud.",
      tier: "refined",
      plus: true,
    },
    {
      title: "Copper app",
      detail: "View and delete what Copper remembers.",
      tier: null,
      plus: false,
    },
  ],
  alerts: [
    {
      title: "The weather changes",
      detail: "A storm, a dust storm or dangerous heat is on the way.",
      tier: null,
      plus: false,
    },
    {
      title: "Copper Home notices",
      detail:
        "Monsoon Mode, Haboob Alert and Heat Check keep an eye on the Arizona weather.",
      tier: null,
      plus: false,
    },
    {
      title: "You get an alert",
      detail:
        "A storm alert, a reminder to close the windows, or a heat warning.",
      tier: null,
      plus: false,
    },
    {
      title: "Copper helps",
      detail:
        "It pauses the sprinklers when rain is coming, and reminds you about pets and the back seat in the heat.",
      tier: null,
      plus: false,
    },
  ],
  away: [
    {
      title: "You leave for the summer",
      detail: "Turn on Snowbird Mode before you go.",
      tier: null,
      plus: false,
    },
    {
      title: "Routines pause",
      detail: "Snowbird Mode pauses your routines while you're away.",
      tier: null,
      plus: false,
    },
    {
      title: "Copper checks in",
      detail: "It checks in on the house for you.",
      tier: null,
      plus: false,
    },
  ],
  notes: [
    {
      title: "Clip on and tap",
      detail:
        "The amber ring lights and the Consent Chime plays, so people nearby know.",
      tier: null,
      plus: false,
    },
    {
      title: "Transcribed on the device",
      detail:
        "The recording is transcribed on the device. Only the text goes to the cloud.",
      tier: "device",
      plus: false,
    },
    {
      title: "Summary",
      detail:
        "Standard summaries use Raw Ore. Copper Plus adds long-form summaries with Refined.",
      tier: "raw_ore",
      plus: false,
    },
    {
      title: "Copper app",
      detail:
        "Read your summary and share it. Copper Plus adds searchable meeting history.",
      tier: null,
      plus: false,
    },
  ],
};

type MapNode = { name: string; plus?: boolean; app?: boolean };

// The features around each product on the map. The order matters: the map
// places them evenly around a ring, so the long names are kept apart.
const MAPS: Record<ProductId, MapNode[]> = {
  "copper-home": [
    { name: "Household Memory" },
    { name: "Smart-home control" },
    { name: "Monsoon Mode" },
    { name: "Haboob Alert" },
    { name: "Heat Check" },
    { name: "Snowbird Mode" },
    { name: "Refined answers", plus: true },
    { name: "Copper app", app: true },
  ],
  "copper-notes": [
    { name: "Meeting Mode" },
    { name: "Lecture Mode" },
    { name: "Long-form summaries", plus: true },
    { name: "Idea Mode" },
    { name: "Consent Chime" },
    { name: "Searchable history", plus: true },
    { name: "Copper app", app: true },
  ],
};

const WHO_QUESTION: RecommendQuestion = {
  id: "who",
  question: "Which sounds most like you?",
  options: Object.entries(WHO).map(([value, { label }]) => ({ value, label })),
};

function jobQuestion(who: RecommendWho): RecommendQuestion {
  return {
    id: "job",
    question: "What would you most like help with?",
    options: WHO[who].jobs.map((job) => ({
      value: job,
      label: JOBS[job].label,
    })),
  };
}

/** The recommend_product contract: three optional answers, nothing else. */
export const recommendProductInput: z.ZodType<RecommendProductInput> =
  z.strictObject({
    who: z
      .enum([
        "homemaker",
        "retiree_snowbird",
        "student",
        "professional",
        "heavy_ai_user",
      ])
      .optional(),
    job: z
      .enum([
        "lists_and_reminders",
        "run_the_house",
        "weather_alerts",
        "planning_and_ideas",
        "away_for_summer",
        "lecture_notes",
        "quick_ideas",
        "meeting_summaries",
        "searchable_history",
        "complex_questions",
        "long_summaries",
      ])
      .optional(),
    maxBudgetUsd: z.number().min(0).max(10000).optional(),
  });

/**
 * recommend_product: asks who the shopper is, then what they want help with,
 * then points them to the product that fits and shows how Copper would help in
 * their day. Copper (or the robot bubble in the panel) puts the questions to
 * the shopper and calls this again with their answers.
 */
export function recommendProduct(input: RecommendProductInput): Recommendation {
  if (!input.who) {
    return { status: "needs_answers", questions: [WHO_QUESTION] };
  }
  // The jobs offered depend on who they are; anything else is asked again.
  if (!input.job || !WHO[input.who].jobs.includes(input.job)) {
    return { status: "needs_answers", questions: [jobQuestion(input.who)] };
  }

  const catalog = getProducts();
  const find = (id: ProductId) => catalog.find((product) => product.id === id)!;

  const job = JOBS[input.job];
  const product = find(job.productId);
  const other = find(
    job.productId === "copper-home" ? "copper-notes" : "copper-home",
  );
  const catalogFeature = job.catalogFeature
    ? product.features.find((feature) => feature.name === job.catalogFeature)
    : undefined;
  const why = catalogFeature
    ? { feature: catalogFeature.name, description: catalogFeature.description }
    : { feature: job.feature!, description: job.description! };

  const plusPlan = getPlans().find((plan) => plan.id === "copper-plus")!;
  const plus = job.plus
    ? {
        required: job.plus.required,
        reason: job.plus.reason,
        priceNote: `${plusPlan.name} is ${formatUsd(plusPlan.monthlyUsd)}/month or ${formatUsd(plusPlan.annualUsd)}/year.`,
      }
    : null;

  const withinBudget =
    input.maxBudgetUsd === undefined
      ? null
      : product.priceUsd <= input.maxBudgetUsd;
  const budgetNote =
    withinBudget === false
      ? `${product.name} costs ${formatUsd(product.priceUsd)}, which is above your ${formatUsd(input.maxBudgetUsd!)} budget.${
          other.priceUsd <= input.maxBudgetUsd!
            ? ` ${other.name} is ${formatUsd(other.priceUsd)}, but it does a different job.`
            : ""
        }`
      : null;

  return {
    status: "recommendation",
    who: input.who,
    product: {
      id: product.id,
      name: product.name,
      type: product.type,
      priceUsd: product.priceUsd,
      colors: product.colors,
    },
    why,
    examples: job.examples,
    visual: {
      features: MAPS[product.id].map((node) => ({
        name: node.name,
        plus: node.plus ?? false,
        app: node.app ?? false,
        highlighted: job.highlight.includes(node.name),
      })),
      steps: FLOWS[job.flow].map((step, index) => ({
        ...step,
        highlighted: job.focus.includes(index),
      })),
    },
    plus,
    withinBudget,
    budgetNote,
    alsoConsider: { id: other.id, name: other.name, priceUsd: other.priceUsd },
  };
}

/** The tools the model can call. Each description tells the model when to use it. */
export const copperTools = {
  get_products: tool({
    description:
      "List every Copper product with its type, price and the colors it comes in; use it for what Copper sells and which colors exist.",
    inputSchema: z.object({}),
    execute: async () => listProducts(),
  }),
  get_prices: tool({
    description:
      "Get the current price of every Copper product and the monthly and annual price of each plan.",
    inputSchema: z.object({}),
    execute: async () => getPrices(),
  }),
  calculate_cost: tool({
    description:
      "Work out the total cost of Copper devices plus a plan (free or copper-plus, monthly or annual) over 1 to 5 years; always use it for sums instead of doing the math yourself.",
    inputSchema: calculateCostInput,
    execute: async (input) => calculateCost(input),
  }),
  check_availability: tool({
    description:
      "Check today's stock for a Copper product, or one color of it: in stock, low stock, or back-ordered with its restock date.",
    inputSchema: checkAvailabilityInput,
    execute: async (input) => checkAvailability(input),
  }),
  recommend_product: tool({
    description:
      "Help a shopper who can't decide between Copper Home and Copper Notes: with no answers it returns the question to ask them (who they are, then what they want help with), and once you pass their answers it returns the product that fits, why, and real examples of how Copper helps someone like them.",
    inputSchema: recommendProductInput,
    execute: async (input) => recommendProduct(input),
  }),
};
