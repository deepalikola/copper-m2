"use server";

// Module 2: the server action the Ask Copper chat calls. It streams the
// conversation to the model through callStream (lib/ai/call.ts), with or
// without the tools, and sends back each step as it happens, so the panel can
// show Copper thinking and using its tools. The contract is in
// specs/module-2/spec.md.
import { stepCountIs } from "ai";
import { z } from "zod";
import { callStream, THOUGHT_SUMMARIES } from "@/lib/ai/call";
import { createLive, type Live } from "@/lib/ai/live";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import type { Progress, Step } from "@/lib/copper/assistant/progress";
import { copperTools } from "@/lib/copper/assistant/tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskCopperRequest = {
  messages: ChatMessage[];
  useTools: boolean;
};

export type AskCopperResult = { progress: Live<Progress> };

/** At most this many model steps (tool calls plus the reply) per question. */
const MAX_STEPS = 5;

const APOLOGY = "Sorry, I couldn't come up with an answer. Please try again.";

// The panel is client code, so the request is checked like any outside input.
const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .min(1)
    .max(40),
  useTools: z.boolean(),
});

/** Prints why a question failed (the message only) to the terminal running the app. */
function logFailure(error: unknown) {
  console.error(
    "[ask-copper] question failed:",
    error instanceof Error ? error.message : String(error),
  );
}

/** A copy of the progress so far, safe to hand out while the original keeps changing. */
function copyOf(progress: Progress): Progress {
  return {
    steps: progress.steps.map((step): Step => ({ ...step })),
    reply: progress.reply,
    status: progress.status,
  };
}

export async function askCopper(
  request: AskCopperRequest,
): Promise<AskCopperResult> {
  const { live, update, done } = createLive<Progress>();
  const progress: Progress = { steps: [], reply: "", status: "working" };

  const finish = (status: "done" | "error") => {
    progress.status = status;
    // An empty reply gets an apology; a real reply is never added to.
    if (progress.reply.trim() === "") progress.reply = APOLOGY;
    done(copyOf(progress));
  };

  const toolStep = (id: string) =>
    progress.steps.find((step) => step.type === "tool" && step.id === id);

  // The stream is read in the background, so the panel gets its first update
  // straight away instead of waiting for the whole answer.
  void (async () => {
    const parsed = requestSchema.safeParse(request);
    if (!parsed.success) return finish("error");
    const { messages, useTools } = parsed.data;

    try {
      const result = callStream(
        { module: 2, feature: "ask-copper" },
        {
          messages: messages.map(({ role, content }) => ({ role, content })),
          providerOptions: THOUGHT_SUMMARIES,
          // With tools off the model gets nothing but the conversation, so it
          // answers from memory. That's the comparison in your report.
          ...(useTools
            ? {
                instructions: COPPER_INSTRUCTIONS,
                tools: copperTools,
                stopWhen: stepCountIs(MAX_STEPS),
              }
            : {}),
        },
      );

      for await (const part of result.fullStream) {
        switch (part.type) {
          case "reasoning-delta": {
            const last = progress.steps.at(-1);
            if (last?.type === "thinking") last.text += part.text;
            else progress.steps.push({ type: "thinking", text: part.text });
            break;
          }
          case "tool-input-start":
            progress.steps.push({
              type: "tool",
              id: part.id,
              name: part.toolName,
              state: "calling",
            });
            break;
          case "tool-call": {
            const step = toolStep(part.toolCallId);
            if (step?.type === "tool") step.input = part.input;
            break;
          }
          case "tool-result": {
            const step = toolStep(part.toolCallId);
            if (step?.type === "tool") {
              step.output = part.output;
              step.state = "done";
            }
            break;
          }
          case "tool-error": {
            const step = toolStep(part.toolCallId);
            if (step?.type === "tool") {
              step.output =
                part.error instanceof Error
                  ? part.error.message
                  : String(part.error);
              step.state = "error";
            }
            break;
          }
          case "text-delta":
            progress.reply += part.text;
            break;
          case "error":
            logFailure(part.error);
            return finish("error");
          default:
            continue;
        }
        update(copyOf(progress));
      }
      finish("done");
    } catch (error) {
      logFailure(error);
      finish("error");
    }
  })();

  return { progress: live };
}
