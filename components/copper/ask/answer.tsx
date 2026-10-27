// One answer, drawn as stations on a rail in the order things happened: the
// tools Copper can use, its thinking, each tool call, and the reply. The
// station labels follow specs/module-2/spec.md section 5.
import type { ReactNode } from "react";
import { BrainIcon, ListChecksIcon, WrenchIcon } from "lucide-react";
import { ToolCard } from "@/components/copper/ask/tool-card";
import { type Progress, TOOL_LABELS } from "@/lib/copper/assistant/progress";
import { cn } from "@/lib/utils";

/** Renders **bold** and `code` from a thinking summary, without raw HTML. */
function Markdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("**") ? (
          <strong key={index}>{part.slice(2, -2)}</strong>
        ) : part.startsWith("`") ? (
          <code key={index} className="font-mono text-xs">
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

function Station({
  node,
  label,
  tone,
  children,
}: {
  node: ReactNode;
  label?: string;
  tone: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative pb-5 pl-9">
      <span
        aria-hidden
        className={cn(
          "ring-secondary absolute top-0 left-0 flex size-7 items-center justify-center rounded-full text-white ring-4",
          tone,
        )}
      >
        {node}
      </span>
      {label && (
        <p className="text-muted-foreground mb-1.5 pt-1 text-xs font-bold tracking-widest uppercase">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

export function Answer({
  progress,
  useTools,
}: {
  progress: Progress;
  useTools: boolean;
}) {
  const working = progress.status === "working";
  const toolSteps = progress.steps.filter((step) => step.type === "tool");
  const usedNames = new Set(toolSteps.map((step) => step.name));
  const names = Object.keys(TOOL_LABELS);
  const rail = useTools
    ? "from-primary via-accent to-accent"
    : "from-chart-3 to-chart-3";
  const thinkingTone = useTools
    ? "bg-primary text-primary-foreground"
    : "bg-chart-3 text-foreground";
  const nodeTone = useTools
    ? "bg-accent text-accent-foreground"
    : "bg-chart-3 text-foreground";

  const nowText = progress.reply
    ? "Writing the answer…"
    : !useTools
      ? "Answering from memory…"
      : progress.steps.length
        ? "Deciding what to do next…"
        : "Reading your question…";

  let toolNumber = 0;

  return (
    <div className="relative">
      <div
        aria-hidden
        className={cn(
          "absolute top-3 bottom-3 left-[13px] w-0.5 bg-gradient-to-b",
          rail,
        )}
      />

      <Station
        node={<ListChecksIcon className="size-3.5" />}
        tone={nodeTone}
        label={
          useTools ? "Tools Copper can use" : "Tools given to Copper: none"
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {names.map((name) => (
            <span
              key={name}
              className={cn(
                "rounded-md px-2 py-0.5 font-mono text-xs",
                !useTools
                  ? "text-muted-foreground line-through"
                  : usedNames.has(name)
                    ? "bg-accent text-accent-foreground font-bold"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {name}
            </span>
          ))}
        </div>
        {!useTools && (
          <p className="text-muted-foreground mt-1.5 text-sm">
            Copper has to answer from memory alone.
          </p>
        )}
      </Station>

      {progress.steps.map((step, index) =>
        step.type === "thinking" ? (
          <Station
            key={index}
            node={<BrainIcon className="size-3.5" />}
            tone={thinkingTone}
            label="Copper is thinking"
          >
            <p
              data-testid="thinking"
              className="text-muted-foreground border-l-2 pl-3 text-sm italic"
            >
              <Markdown text={step.text} />
            </p>
          </Station>
        ) : (
          <Station
            key={step.id}
            node={<WrenchIcon className="size-3.5" />}
            tone="bg-accent text-accent-foreground"
            label={
              step.state === "calling"
                ? "Copper is calling a tool"
                : "Copper called a tool"
            }
          >
            <ToolCard step={step} index={++toolNumber} />
          </Station>
        ),
      )}

      {working && (
        <Station
          tone={useTools ? "bg-primary" : "bg-chart-3"}
          node={
            <span className="flex gap-0.5">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="size-1 animate-bounce rounded-full bg-current"
                  style={{ animationDelay: `${dot * 120}ms` }}
                />
              ))}
            </span>
          }
        >
          <p className="text-muted-foreground pt-1 text-sm">{nowText}</p>
        </Station>
      )}

      {(progress.reply || !working) && (
        <div className="bg-card ml-9 rounded-2xl rounded-tl-sm border p-3 shadow-sm">
          <p className="text-primary mb-1 text-xs font-bold">Copper</p>
          {!useTools && (
            <div className="border-chart-3 bg-chart-3/15 mb-2 rounded-lg border p-2 text-sm">
              <p className="font-bold">
                ⚠ Answered without tools: may be made up
              </p>
              <p className="text-muted-foreground mt-1">
                With tools off, Copper can&apos;t see today&apos;s prices or
                stock. The AI only has what it learned in training, so it fills
                the gaps with guesses that sound right. That&apos;s a
                hallucination.
              </p>
            </div>
          )}
          <p className="text-sm whitespace-pre-wrap">
            {progress.reply}
            {working && (
              <span
                aria-hidden
                className="bg-foreground ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle"
              />
            )}
          </p>
        </div>
      )}
    </div>
  );
}
