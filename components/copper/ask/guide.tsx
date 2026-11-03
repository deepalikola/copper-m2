"use client";

// Copper the robot, with a speech bubble, asking a shopper a few questions and
// then pointing them to the right product. It's all clicks: no typing, and no
// AI model. Each click asks guideStep, which runs the recommend_product tool.
import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { guideStep } from "@/lib/copper/assistant/guide";
import type {
  Recommendation,
  RecommendQuestion,
} from "@/lib/copper/assistant/tools";
import { formatUsd } from "@/lib/copper/catalog";

type Answers = { who?: string; job?: string; maxBudgetUsd?: number };
type Result = Extract<Recommendation, { status: "recommendation" }>;

type View =
  | { step: "intro" }
  | { step: "loading" }
  | { step: "question"; question: RecommendQuestion }
  | { step: "budget" }
  | { step: "result"; result: Result }
  | { step: "error" };

const BUDGETS: { label: string; value?: number }[] = [
  { label: "Up to $100", value: 100 },
  { label: "Up to $150", value: 150 },
  { label: "Up to $200", value: 200 },
  { label: "No limit" },
];

function Robot() {
  return (
    <span className="bg-primary flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full">
      <Image
        src="/assets/brand/copper-mascot.png"
        alt="Copper the robot"
        width={44}
        height={44}
        className="size-11 object-cover"
      />
    </span>
  );
}

function Choice({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="bg-background h-auto justify-start rounded-xl px-3 py-2 text-left text-sm whitespace-normal"
    >
      {children}
    </Button>
  );
}

export function Guide() {
  const [view, setView] = useState<View>({ step: "intro" });
  const [answers, setAnswers] = useState<Answers>({});

  const go = async (next: Answers) => {
    setAnswers(next);
    setView({ step: "loading" });
    try {
      const result = await guideStep(next);
      if (result.status === "needs_answers") {
        setView({ step: "question", question: result.questions[0] });
      } else {
        setView({ step: "result", result });
      }
    } catch {
      setView({ step: "error" });
    }
  };

  const restart = () => {
    setAnswers({});
    setView({ step: "intro" });
  };

  const choose = (question: RecommendQuestion, value: string) => {
    if (question.id === "who") return void go({ who: value });
    // After "what do you want help with?", ask about a budget before answering.
    setAnswers({ ...answers, job: value });
    setView({ step: "budget" });
  };

  return (
    <section
      aria-label="Help me choose"
      aria-live="polite"
      className="flex items-start gap-2"
    >
      <Robot />
      <div className="bg-card min-w-0 flex-1 rounded-2xl rounded-tl-sm border p-3 text-sm shadow-sm">
        {view.step === "intro" && (
          <>
            <p className="font-semibold">
              Not sure which Copper device is right for you?
            </p>
            <p className="text-muted-foreground mt-1">
              I&apos;ll ask a couple of quick questions, then show you how
              Copper would help.
            </p>
            <Button
              type="button"
              onClick={() => void go({})}
              className="mt-3 h-9 rounded-full px-4 font-bold"
            >
              Help me choose
            </Button>
          </>
        )}

        {view.step === "loading" && (
          <p className="text-muted-foreground flex items-center gap-1 py-1">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="bg-muted-foreground size-1.5 animate-bounce rounded-full"
                style={{ animationDelay: `${dot * 120}ms` }}
              />
            ))}
          </p>
        )}

        {view.step === "question" && (
          <>
            <p className="font-semibold">{view.question.question}</p>
            <div className="mt-2 flex flex-col gap-2">
              {view.question.options.map((option) => (
                <Choice
                  key={option.value}
                  onClick={() => choose(view.question, option.value)}
                >
                  {option.label}
                </Choice>
              ))}
            </div>
          </>
        )}

        {view.step === "budget" && (
          <>
            <p className="font-semibold">Got a budget in mind?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {BUDGETS.map((budget) => (
                <Choice
                  key={budget.label}
                  onClick={() =>
                    void go({ ...answers, maxBudgetUsd: budget.value })
                  }
                >
                  {budget.label}
                </Choice>
              ))}
            </div>
          </>
        )}

        {view.step === "result" && (
          <div className="flex flex-col gap-2">
            <p className="text-primary text-base font-extrabold">
              I&apos;d go with {view.result.product.name},{" "}
              {formatUsd(view.result.product.priceUsd)}.
            </p>
            <p>
              <span className="font-semibold">{view.result.why.feature}.</span>{" "}
              <span className="text-muted-foreground">
                {view.result.why.description}
              </span>
            </p>

            <p className="mt-1 font-semibold">
              Here&apos;s how Copper fits your day:
            </p>
            <ul className="flex flex-col gap-2">
              {view.result.examples.map((example) => (
                <li
                  key={example.say}
                  className="bg-secondary/60 rounded-lg px-2 py-1.5"
                >
                  <span className="font-medium">
                    &ldquo;{example.say}&rdquo;
                  </span>
                  <span className="text-muted-foreground block">
                    {example.result}
                  </span>
                </li>
              ))}
            </ul>

            {view.result.plus && (
              <p className="text-muted-foreground">
                {view.result.plus.reason} {view.result.plus.priceNote}
              </p>
            )}
            {view.result.budgetNote && (
              <p className="text-muted-foreground">{view.result.budgetNote}</p>
            )}
            <p className="text-muted-foreground text-xs">
              Comes in {view.result.product.colors.join(", ")}. Also consider{" "}
              {view.result.alsoConsider.name},{" "}
              {formatUsd(view.result.alsoConsider.priceUsd)}.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={restart}
              className="mt-1 h-8 self-start rounded-full px-3"
            >
              Start over
            </Button>
          </div>
        )}

        {view.step === "error" && (
          <>
            <p>Sorry, I couldn&apos;t load that. Let&apos;s try again.</p>
            <Button
              type="button"
              onClick={restart}
              className="mt-2 h-8 rounded-full px-3"
            >
              Start over
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
