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

export type RecommendWhere = "at_home" | "on_the_go";
export type RecommendJob =
  | "home_control"
  | "household_memory"
  | "storm_alerts"
  | "meetings"
  | "lectures";

export type RecommendProductInput = {
  where?: RecommendWhere;
  job?: RecommendJob;
  maxBudgetUsd?: number;
};

export type RecommendQuestion = {
  id: "where" | "job";
  question: string;
  options: { value: string; label: string }[];
};

export type Recommendation =
  | { status: "needs_answers"; questions: RecommendQuestion[] }
  | {
      status: "recommendation";
      product: {
        id: ProductId;
        name: string;
        type: string;
        priceUsd: number;
        colors: string[];
      };
      /** The catalog feature that fits what the shopper wants to do. */
      why: { feature: string; description: string };
      otherFeatures: string[];
      fit: "great" | "partial";
      fitNote: string | null;
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

// recommend_product: the questions Copper asks a shopper who can't decide, and
// what each answer points to. The product facts come from the catalog; only the
// mapping from "what do you want to do?" to a catalog feature lives here.
const WHERE_OPTIONS = [
  { value: "at_home", label: "At home" },
  { value: "on_the_go", label: "On the go (meetings, class, coffee shops)" },
] as const;

const JOBS: Record<
  RecommendJob,
  { productId: ProductId; feature: string; label: string }
> = {
  home_control: {
    productId: "copper-home",
    feature: "Smart-home control",
    label: "Control my lights, thermostat, sprinklers and garage",
  },
  household_memory: {
    productId: "copper-home",
    feature: "Household Memory",
    label: "Remember household things for me",
  },
  storm_alerts: {
    productId: "copper-home",
    feature: "Monsoon Mode",
    label: "Warn me about storms and protect the yard",
  },
  meetings: {
    productId: "copper-notes",
    feature: "Meeting Mode",
    label: "Summarize my meetings",
  },
  lectures: {
    productId: "copper-notes",
    feature: "Lecture Mode",
    label: "Take notes in lectures",
  },
};

const WHERE_PRODUCT: Record<RecommendWhere, ProductId> = {
  at_home: "copper-home",
  on_the_go: "copper-notes",
};

const RECOMMEND_QUESTIONS: Record<"where" | "job", RecommendQuestion> = {
  where: {
    id: "where",
    question: "Where will you use it most?",
    options: [...WHERE_OPTIONS],
  },
  job: {
    id: "job",
    question: "What's the main thing you want help with?",
    options: Object.entries(JOBS).map(([value, { label }]) => ({
      value,
      label,
    })),
  },
};

/** The recommend_product contract: three optional answers, nothing else. */
export const recommendProductInput: z.ZodType<RecommendProductInput> =
  z.strictObject({
    where: z.enum(["at_home", "on_the_go"]).optional(),
    job: z
      .enum([
        "home_control",
        "household_memory",
        "storm_alerts",
        "meetings",
        "lectures",
      ])
      .optional(),
    maxBudgetUsd: z.number().min(0).max(10000).optional(),
  });

/**
 * recommend_product: asks for what it still needs to know, then points the
 * shopper to the product that fits. Copper puts the questions to the shopper
 * in chat and calls this again with their answers.
 */
export function recommendProduct(input: RecommendProductInput): Recommendation {
  const missing = (["where", "job"] as const).filter((id) => !input[id]);
  if (missing.length > 0) {
    return {
      status: "needs_answers",
      questions: missing.map((id) => RECOMMEND_QUESTIONS[id]),
    };
  }

  const catalog = getProducts();
  const find = (id: ProductId) => catalog.find((product) => product.id === id)!;

  // What they want to do decides it; where they'll use it says how well it fits.
  const job = JOBS[input.job!];
  const product = find(job.productId);
  const other = find(
    job.productId === "copper-home" ? "copper-notes" : "copper-home",
  );
  const matched = product.features.find(
    (feature) => feature.name === job.feature,
  )!;
  const fits = WHERE_PRODUCT[input.where!] === product.id;

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
    product: {
      id: product.id,
      name: product.name,
      type: product.type,
      priceUsd: product.priceUsd,
      colors: product.colors,
    },
    why: { feature: matched.name, description: matched.description },
    otherFeatures: product.features
      .filter((feature) => feature.name !== matched.name)
      .map((feature) => feature.name),
    fit: fits ? "great" : "partial",
    fitNote: fits
      ? null
      : `You said you'd use it ${
          input.where === "at_home" ? "at home" : "on the go"
        }, but ${product.name} is the one built for "${job.label.toLowerCase()}".`,
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
      "Help a shopper who can't decide between Copper Home and Copper Notes: with no answers it returns the questions to ask them (where they'll use it, what they want help with), and once you pass their answers it returns the product that fits and why.",
    inputSchema: recommendProductInput,
    execute: async (input) => recommendProduct(input),
  }),
};
