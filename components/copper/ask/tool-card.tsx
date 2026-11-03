// One tool call, drawn as an always-open card: what Copper sent, then what
// came back. Inputs and results are laid out as readable lists, never raw JSON.
import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { formatUsd, getProducts } from "@/lib/copper/catalog";
import { type ToolStep, TOOL_LABELS } from "@/lib/copper/assistant/progress";
import { cn } from "@/lib/utils";

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-11-14" becomes "Nov 14, 2026" (no time zone maths: it's only a date). */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return month >= 1 && month <= 12
    ? `${MONTHS[month - 1]} ${day}, ${year}`
    : iso;
}

const productName = (id: unknown) =>
  getProducts().find((product) => product.id === id)?.name ?? String(id);

const WHERE_LABELS: Record<string, string> = {
  at_home: "At home",
  on_the_go: "On the go",
};

const JOB_LABELS: Record<string, string> = {
  home_control: "Smart-home control",
  household_memory: "Household memory",
  storm_alerts: "Storm alerts",
  meetings: "Meetings",
  lectures: "Lectures",
};

const labelOf = (labels: Record<string, string>, value: unknown) =>
  typeof value === "string" ? (labels[value] ?? value) : "Not answered yet";

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  "copper-plus": "Copper Plus",
};

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Pill({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-semibold",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** What Copper sent, as labelled rows. */
function Sent({ tool, input }: { tool: string; input: unknown }) {
  if (tool === "get_products") {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing, it just asked what Copper sells.
      </p>
    );
  }
  if (tool === "get_prices") {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing, it just asked for the price list.
      </p>
    );
  }
  if (!isObj(input)) return null;
  if (tool === "calculate_cost") {
    const products = Array.isArray(input.products) ? input.products : [];
    return (
      <Rows
        rows={[
          [
            "Products",
            products.length ? products.map(productName).join(", ") : "None",
          ],
          ["Plan", PLAN_NAMES[String(input.plan)] ?? String(input.plan)],
          ["Billing", String(input.billing)],
          ["Years", String(input.years)],
        ]}
      />
    );
  }
  if (tool === "recommend_product") {
    return (
      <Rows
        rows={[
          ["Where", labelOf(WHERE_LABELS, input.where)],
          ["Main job", labelOf(JOB_LABELS, input.job)],
          [
            "Budget",
            typeof input.maxBudgetUsd === "number"
              ? formatUsd(input.maxBudgetUsd)
              : "Not given",
          ],
        ]}
      />
    );
  }
  if (tool === "check_availability") {
    return (
      <Rows
        rows={[
          ["Product", productName(input.product)],
          ["Color", input.color ? String(input.color) : "Every color"],
        ]}
      />
    );
  }
  return <Rows rows={Object.entries(input).map(([k, v]) => [k, String(v)])} />;
}

const STOCK_PILL = {
  in_stock: {
    label: "In stock",
    className: "bg-accent text-accent-foreground",
  },
  low_stock: { label: "Low stock", className: "bg-chart-4 text-foreground" },
  backordered: {
    label: "Back-ordered",
    className: "bg-chart-3 text-foreground",
  },
} as const;

/** What came back, laid out for each tool. */
function Result({ tool, output }: { tool: string; output: unknown }) {
  if (typeof output === "string") {
    return <p className="text-destructive text-sm">{output}</p>;
  }
  if (!isObj(output)) return null;

  if (tool === "calculate_cost") {
    const lines = Array.isArray(output.lines) ? (output.lines as Obj[]) : [];
    return (
      <div className="text-sm">
        {lines.map((line, index) => (
          <div key={index} className="flex justify-between gap-4 py-0.5">
            <span>{String(line.item)}</span>
            <span className="tabular-nums">{formatUsd2(line.usd)}</span>
          </div>
        ))}
        <div className="mt-1 flex items-baseline justify-between border-t pt-1">
          <span className="font-semibold">Total</span>
          <span className="text-primary text-xl font-extrabold tabular-nums">
            {formatUsd2(output.totalUsd)}
          </span>
        </div>
      </div>
    );
  }

  if (tool === "get_products") {
    const products = Array.isArray(output.products)
      ? (output.products as Obj[])
      : [];
    return (
      <div className="flex flex-col gap-3 text-sm">
        {products.map((product) => (
          <div key={String(product.id)}>
            <p className="font-semibold">
              {String(product.name)} · {formatUsd(Number(product.priceUsd))}
            </p>
            <p className="text-muted-foreground text-xs">
              {String(product.type)}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {(Array.isArray(product.colors) ? product.colors : []).map(
                (color) => (
                  <Pill key={String(color)} className="bg-accent/30">
                    {String(color)}
                  </Pill>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (tool === "get_prices") {
    const products = Array.isArray(output.products)
      ? (output.products as Obj[])
      : [];
    const plans = Array.isArray(output.plans) ? (output.plans as Obj[]) : [];
    return (
      <div className="flex flex-col gap-1 text-sm">
        {products.map((product) => (
          <div key={String(product.id)} className="flex justify-between gap-4">
            <span>{String(product.name)}</span>
            <span className="tabular-nums">
              {formatUsd(Number(product.priceUsd))}
            </span>
          </div>
        ))}
        {plans
          .filter((plan) => Number(plan.monthlyUsd) > 0)
          .map((plan) => (
            <div key={String(plan.id)} className="flex justify-between gap-4">
              <span>{String(plan.name)}</span>
              <span className="tabular-nums">
                {formatUsd(Number(plan.monthlyUsd))}/mo ·{" "}
                {formatUsd(Number(plan.annualUsd))}/yr
              </span>
            </div>
          ))}
      </div>
    );
  }

  if (tool === "recommend_product") {
    if (output.status === "needs_answers" && Array.isArray(output.questions)) {
      return (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-muted-foreground">Questions Copper should ask:</p>
          {(output.questions as Obj[]).map((question) => (
            <div key={String(question.id)}>
              <p className="font-semibold">{String(question.question)}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {(Array.isArray(question.options)
                  ? (question.options as Obj[])
                  : []
                ).map((option) => (
                  <Pill key={String(option.value)} className="bg-accent/30">
                    {String(option.label)}
                  </Pill>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (
      output.status === "recommendation" &&
      isObj(output.product) &&
      isObj(output.why)
    ) {
      const also = isObj(output.alsoConsider) ? output.alsoConsider : null;
      return (
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-primary text-lg font-extrabold">
            {String(output.product.name)} ·{" "}
            {formatUsd(Number(output.product.priceUsd))}
          </p>
          <p>
            <span className="font-semibold">{String(output.why.feature)}.</span>{" "}
            <span className="text-muted-foreground">
              {String(output.why.description)}
            </span>
          </p>
          {typeof output.fitNote === "string" && (
            <p className="text-muted-foreground">{output.fitNote}</p>
          )}
          {typeof output.budgetNote === "string" && (
            <p className="text-muted-foreground">{output.budgetNote}</p>
          )}
          {also && (
            <p className="text-muted-foreground text-xs">
              Also consider: {String(also.name)} ·{" "}
              {formatUsd(Number(also.priceUsd))}
            </p>
          )}
        </div>
      );
    }
  }

  if (tool === "check_availability") {
    if (output.status === "ok" && Array.isArray(output.colors)) {
      return (
        <div className="flex flex-col gap-1 text-sm">
          {(output.colors as Obj[]).map((row) => {
            const pill = STOCK_PILL[row.stock as keyof typeof STOCK_PILL];
            return (
              <div
                key={String(row.color)}
                className="flex items-center justify-between gap-4"
              >
                <span>{String(row.color)}</span>
                {pill && (
                  <Pill className={pill.className}>
                    {row.stock === "backordered" && row.restockDate
                      ? `${pill.label} until ${formatDate(String(row.restockDate))}`
                      : pill.label}
                  </Pill>
                )}
              </div>
            );
          })}
        </div>
      );
    }
    if (output.status === "not_a_color") {
      const colors = Array.isArray(output.colors)
        ? output.colors.join(", ")
        : "";
      return (
        <p className="text-sm">
          {String(output.product)} doesn&apos;t come in {String(output.color)}.
          It comes in {colors}.
        </p>
      );
    }
    if (output.status === "unavailable") {
      return <p className="text-sm">{String(output.message)}</p>;
    }
  }

  return null;
}

const formatUsd2 = (amount: unknown) => `$${Number(amount).toFixed(2)}`;

export function ToolCard({ step, index }: { step: ToolStep; index: number }) {
  const running = step.state === "calling";
  const hasOutput = step.output !== undefined;
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-card overflow-hidden rounded-xl border text-left shadow-sm"
    >
      <div className="bg-accent text-accent-foreground flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="font-mono text-sm font-bold">{step.name}()</span>
        <span className="bg-background/30 rounded-full px-2 text-xs font-semibold">
          tool {index}
        </span>
        <span className="ml-auto text-xs font-medium">
          {TOOL_LABELS[step.name] ?? ""}
        </span>
      </div>
      <div className="p-3">
        <p className="text-primary mb-2 text-xs font-bold tracking-wider uppercase">
          → What Copper sent
        </p>
        {step.input === undefined ? (
          <p className="text-muted-foreground text-sm italic">
            filling in the details…
          </p>
        ) : (
          <Sent tool={step.name} input={step.input} />
        )}
      </div>
      <div className="bg-accent/10 border-t p-3">
        <p className="text-accent-foreground/80 dark:text-accent mb-2 text-xs font-bold tracking-wider uppercase">
          ← What came back
        </p>
        {hasOutput ? (
          <Result tool={step.name} output={step.output} />
        ) : running ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner className="size-3.5" />
            the app is running the code…
          </p>
        ) : null}
      </div>
    </div>
  );
}
