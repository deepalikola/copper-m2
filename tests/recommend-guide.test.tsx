// The robot bubble: Copper the robot asks a few questions, all by clicking, and
// then points to the right product. It runs the recommend_product tool through
// the guideStep server function, with no AI model, so these tests need no key.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Guide } from "@/components/copper/ask/guide";
import { AskCopper } from "@/components/copper/ask-copper";
import { guideStep } from "@/lib/copper/assistant/guide";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const click = (name: RegExp | string) =>
  fireEvent.click(screen.getByRole("button", { name }));

describe("guideStep (the server function behind the robot)", () => {
  it("starts with who the shopper is", async () => {
    const result = await guideStep({});
    expect(result).toMatchObject({
      status: "needs_answers",
      questions: [{ id: "who" }],
    });
  });

  it("runs the tool with the answers it is given", async () => {
    const result = await guideStep({ who: "student", job: "lecture_notes" });
    expect(result).toMatchObject({
      status: "recommendation",
      product: { id: "copper-notes" },
    });
  });

  it("treats anything unexpected as a fresh start instead of crashing", async () => {
    for (const junk of [
      null,
      "hello",
      42,
      { who: "astronaut" },
      { price: 1 },
    ]) {
      const result = await guideStep(junk);
      expect(result).toMatchObject({
        status: "needs_answers",
        questions: [{ id: "who" }],
      });
    }
  });
});

describe("the Copper robot bubble", () => {
  it("opens with the robot offering to help, before the shopper says anything", () => {
    render(<Guide />);
    expect(
      screen.getByRole("region", { name: /help me choose/i }),
    ).toBeInTheDocument();
    expect(screen.getByAltText("Copper the robot")).toBeInTheDocument();
    expect(
      screen.getByText(/not sure which copper device is right for you/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Help me choose" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("asks who they are, then what they want, then a budget, then recommends", async () => {
    render(<Guide />);
    click("Help me choose");
    expect(
      await screen.findByText("Which sounds most like you?"),
    ).toBeInTheDocument();

    click("A homemaker or family manager");
    expect(
      await screen.findByText("What would you most like help with?"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Lists and reminders" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Notes in lectures" }),
    ).toBeNull();

    click("Lists and reminders");
    expect(
      await screen.findByText("Got a budget in mind?"),
    ).toBeInTheDocument();

    click("Up to $200");
    expect(
      await screen.findByText(/I'd go with Copper Home, \$149/),
    ).toBeInTheDocument();
    const region = screen.getByRole("region", { name: /help me choose/i });
    expect(
      within(region).getAllByText(/Household Memory/).length,
    ).toBeGreaterThan(0);
    expect(
      within(region).getByText(/add coriander to the shopping list/),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(/Here's how Copper fits your day/),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(/Also consider Copper Notes, \$129/),
    ).toBeInTheDocument();
  });

  it("tells a shopper when their budget is too low", async () => {
    render(<Guide />);
    click("Help me choose");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "A homemaker or family manager",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Running the house" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Up to $100" }));
    expect(
      await screen.findByText(/above your \$100 budget/),
    ).toBeInTheDocument();
  });

  it("shows a student Copper Notes and mentions Copper Plus only when it's needed", async () => {
    render(<Guide />);
    click("Help me choose");
    fireEvent.click(await screen.findByRole("button", { name: "A student" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Notes in lectures" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "No limit" }));
    expect(
      await screen.findByText(/I'd go with Copper Notes, \$129/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Lecture Mode/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Copper Plus is/)).toBeNull();
  });

  it("explains Copper Plus when the job needs it", async () => {
    render(<Guide />);
    click("Help me choose");
    fireEvent.click(
      await screen.findByRole("button", { name: "A busy professional" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Searching past meetings" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "No limit" }));
    expect(
      await screen.findByText(/Copper Plus is \$7\.99\/month or \$79\/year/),
    ).toBeInTheDocument();
  });

  it("lets the shopper start over", async () => {
    render(<Guide />);
    click("Help me choose");
    fireEvent.click(await screen.findByRole("button", { name: "A student" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Capturing quick ideas" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "No limit" }));
    await screen.findByText(/I'd go with/);
    click("Start over");
    expect(
      screen.getByRole("button", { name: "Help me choose" }),
    ).toBeInTheDocument();
  });
});

describe("the pictures at the end of the robot flow", () => {
  async function finishAs(who: string, job: string) {
    render(<Guide />);
    fireEvent.click(screen.getByRole("button", { name: "Help me choose" }));
    fireEvent.click(await screen.findByRole("button", { name: who }));
    fireEvent.click(await screen.findByRole("button", { name: job }));
    fireEvent.click(await screen.findByRole("button", { name: "No limit" }));
    await screen.findByText(/I'd go with/);
  }

  it("shows the feature map with the shopper's features lit up", async () => {
    await finishAs("A homemaker or family manager", "Lists and reminders");
    expect(
      screen.getByText(/How Copper Home's features connect/),
    ).toBeInTheDocument();
    const map = screen.getByRole("img", {
      name: /Copper Home and its features/,
    });
    expect(map.getAttribute("aria-label")).toContain(
      "Lit up for you: Household Memory, Copper app",
    );
    const lit = map.querySelectorAll('g[data-highlighted="true"]');
    expect([...lit].map((g) => g.textContent?.trim())).toEqual([
      "Household Memory",
      "Copper app",
    ]);
    // Refined answers is a Copper Plus feature, so it carries the Plus badge.
    const plusNode = map.querySelector('g[data-plus="true"]');
    expect(plusNode?.textContent).toContain("Refined answers");
    expect(plusNode?.textContent).toContain("Plus");
  });

  it("shows what happens behind the scenes, with the steps used lit up", async () => {
    await finishAs("A student", "Notes in lectures");
    expect(
      screen.getByText("What happens behind the scenes"),
    ).toBeInTheDocument();
    const steps = within(screen.getByTestId("how-it-works")).getAllByRole(
      "listitem",
    );
    expect(steps).toHaveLength(4);
    expect(steps.map((step) => step.getAttribute("data-highlighted"))).toEqual([
      "true",
      "true",
      "true",
      "true",
    ]);
    expect(
      within(steps[1]).getByText("Transcribed on the device"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Only the text goes to the cloud/),
    ).toBeInTheDocument();
  });

  it("dims the steps a job doesn't use and explains the colors", async () => {
    await finishAs("A homemaker or family manager", "Planning and ideas");
    const steps = within(screen.getByTestId("how-it-works")).getAllByRole(
      "listitem",
    );
    expect(steps.map((step) => step.getAttribute("data-highlighted"))).toEqual([
      "true",
      "false",
      "true",
      "true",
      "false",
    ]);
    expect(within(steps[3]).getByText("Plus")).toBeInTheDocument();
    expect(screen.getByText("Refined (Copper Plus)")).toBeInTheDocument();
    expect(screen.getByText("Raw Ore (low-cost cloud)")).toBeInTheDocument();
  });
});

describe("the robot in the Ask Copper panel", () => {
  it("appears in an empty panel with tools on, and not in the tools-off chat", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-key");
    render(<AskCopper aiConfigured />);
    fireEvent.click(screen.getByTestId("ask-copper-launcher"));
    const panel = within(await screen.findByTestId("ask-copper"));

    expect(
      panel.getByRole("button", { name: "Help me choose" }),
    ).toBeInTheDocument();
    // The three starter questions are still there.
    expect(
      panel.getByRole("button", {
        name: "Is Copper Notes in Night Sky in stock?",
      }),
    ).toBeInTheDocument();

    fireEvent.click(panel.getByRole("switch", { name: /use tools/i }));
    expect(panel.queryByRole("button", { name: "Help me choose" })).toBeNull();
    fireEvent.click(panel.getByRole("switch", { name: /use tools/i }));
    expect(
      panel.getByRole("button", { name: "Help me choose" }),
    ).toBeInTheDocument();
  });
});
