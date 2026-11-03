"use server";

// The robot bubble in the Ask Copper panel (components/copper/ask/guide.tsx)
// calls this on every click. It runs the recommend_product tool with the
// answers so far and hands back its answer: the next question, or the
// recommendation. It never calls the AI model, so it costs nothing and can't
// make anything up.
import {
  recommendProduct,
  recommendProductInput,
  type Recommendation,
} from "@/lib/copper/assistant/tools";

export async function guideStep(answers: unknown): Promise<Recommendation> {
  // The panel is client code, so the answers are checked like any outside input.
  const parsed = recommendProductInput.safeParse(answers);
  // Anything unexpected just starts the questions over.
  return recommendProduct(parsed.success ? parsed.data : {});
}
