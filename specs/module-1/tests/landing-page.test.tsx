// Module 1: the landing page. Fast checks that render the page in jsdom; the
// responsive layout and design are reviewed by hand (DESIGN in rubric.md).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const SECTIONS = [
  ["site-header", null],
  ["hero", "top"],
  ["products", "products"],
  ["showcase", "showcase"],
  ["plus-pricing", "plus"],
  ["privacy-summary", "privacy"],
  ["site-footer", null],
] as const;

const TAGLINE = "From raw ideas to refined answers.";
const BRAND_COLORS = ["b87333", "4a8c82", "efe3d0", "e8663d", "1c2333", "f2c230"];
const ASSETS = [
  "cutouts/copper-home.png",
  "cutouts/copper-notes.png",
  "lifestyle/copper-home-desert-light.png",
  "lifestyle/copper-notes-stone-desk.png",
  "lifestyle/copper-notes-golden-hour.png",
  "brand/copper-mascot.png",
];

// The official catalog values (Product Bible §3 and §10).
const OFFICIAL = {
  products: { "copper-home": 149, "copper-notes": 129 },
  plans: {
    free: [0, 0, 30, "10"],
    "copper-plus": [7.99, 79, 365, "Unlimited"],
  },
};

// Renders app/page.tsx fresh (so catalog mocks apply), sync or async.
async function renderPage() {
  vi.resetModules();
  const { default: Home } = await import("@/app/page");
  const page = Home as unknown as () => React.ReactNode | Promise<React.ReactNode>;
  const ui =
    Home.constructor.name === "AsyncFunction" ? await page() : <Home />;
  return render(<>{ui}</>);
}

// Criteria about what the page must avoid only count once the landing page
// exists, so the placeholder page earns nothing.
async function renderLandingPage() {
  const result = await renderPage();
  expect(
    result.container.querySelector('[data-testid="hero"]'),
    "the landing page (hero section) exists",
  ).not.toBeNull();
  return result;
}

const section = (container: HTMLElement, testId: string) => {
  const element = container.querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
  expect(element, `section data-testid="${testId}"`).not.toBeNull();
  return element!;
};

// The image path an <img> shows, also when next/image rewrites it.
const imageSource = (img: HTMLImageElement) => {
  const src = img.getAttribute("src") ?? "";
  const url = /[?&]url=([^&]+)/.exec(src)?.[1];
  return url ? decodeURIComponent(url) : src;
};

const sources = (element: HTMLElement) =>
  [...element.querySelectorAll("img")].map(imageSource);

// Always "/" between folders, whatever the OS: the checks below match on
// paths, and join() would hand back backslashes on Windows.
const filesUnder = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, encoding: "utf8" }).map((f) =>
        join(dir, f).split(sep).join("/"),
      )
    : [];

afterEach(() => {
  cleanup();
  vi.doUnmock("@/lib/copper/catalog");
});

describe("Module 1: landing page", () => {
  it("AC-1.1 All seven sections exist in order, with their data-testid and id", async () => {
    const { container } = await renderPage();
    const elements = SECTIONS.map(([testId]) => section(container, testId));
    for (let i = 1; i < elements.length; i++) {
      expect(
        elements[i - 1].compareDocumentPosition(elements[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        `${SECTIONS[i - 1][0]} comes before ${SECTIONS[i][0]}`,
      ).toBeTruthy();
    }
    for (const [testId, id] of SECTIONS) {
      if (id) expect(section(container, testId).id, testId).toBe(id);
    }
  });

  it("AC-1.2 Header links go to #products, #plus and #privacy, and See products goes to #products", async () => {
    const { container } = await renderPage();
    const header = section(container, "site-header");
    const hrefs = [...header.querySelectorAll("a")].map(
      (a) => a.getAttribute("href") ?? "",
    );
    for (const target of ["#products", "#plus", "#privacy"]) {
      expect(
        hrefs.some((href) => href.endsWith(target)),
        `header link to ${target}`,
      ).toBe(true);
    }
    const button = within(section(container, "hero")).getByRole("link", {
      name: /see products/i,
    });
    expect(button.getAttribute("href")).toMatch(/#products$/);
  });

  it("AC-1.3 There is exactly one h1, in the hero, 10 words or fewer, and the tagline is exact", async () => {
    const { container } = await renderPage();
    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(section(container, "hero").contains(headings[0])).toBe(true);
    const words = (headings[0].textContent ?? "").trim().split(/\s+/);
    expect(words.length).toBeGreaterThan(0);
    expect(words.length).toBeLessThanOrEqual(10);
    expect(container.textContent).toContain(TAGLINE);
  });

  it("AC-1.4 The site is a single page: no other pages or routes in app/", async () => {
    await renderLandingPage();
    const routes = filesUnder("app").filter((file) =>
      /(^|\/)(page|route)\.(t|j)sx?$/.test(file),
    );
    expect(routes).toEqual(["app/page.tsx"]);
    expect(existsSync("pages")).toBe(false);
  });

  it("AC-2.1 The hero shows the Copper Home and Copper Notes cutouts", async () => {
    const { container } = await renderPage();
    const hero = sources(section(container, "hero"));
    expect(hero).toContain("/assets/cutouts/copper-home.png");
    expect(hero).toContain("/assets/cutouts/copper-notes.png");
  });

  it("AC-2.2 Each product card shows its cutout, and the showcase has a lifestyle photo of each product", async () => {
    const { container } = await renderPage();
    for (const product of ["copper-home", "copper-notes"]) {
      const card = container.querySelector<HTMLElement>(
        `[data-testid="product-card"][data-product="${product}"]`,
      );
      expect(card, `product-card for ${product}`).not.toBeNull();
      expect(sources(card!)).toContain(`/assets/cutouts/${product}.png`);
      expect(
        sources(section(container, "showcase")).some((src) =>
          src.startsWith(`/assets/lifestyle/${product}`),
        ),
        `lifestyle photo of ${product} in the showcase`,
      ).toBe(true);
    }
  });

  it("AC-2.3 The images were moved with Step 0, keeping their names", () => {
    for (const asset of ASSETS) {
      expect(existsSync(join("public/assets", asset)), asset).toBe(true);
    }
    expect(existsSync("specs/module-1/assets")).toBe(false);
  });

  it("AC-2.4 Every image uses next/image from public/ and has descriptive alt text", async () => {
    const { container } = await renderLandingPage();
    const images = [...container.querySelectorAll("img")];
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      const src = imageSource(img);
      const alt = (img.getAttribute("alt") ?? "").trim();
      expect(img.hasAttribute("data-nimg"), `${src} uses next/image`).toBe(
        true,
      );
      expect(src, "images come from public/assets or the logo").toMatch(
        /^\/(assets|brand)\//,
      );
      expect(alt.length, `${src} has alt text`).toBeGreaterThan(3);
      expect(alt, `${src} alt describes the image`).not.toMatch(
        /^(image|img|photo|picture|logo)$|\.(png|jpe?g|webp)$/i,
      );
    }
  });

  it("AC-3.1 Prices and plan details come from the catalog", async () => {
    // The catalog itself must still hold the official values.
    const data = JSON.parse(
      readFileSync("lib/copper/data/catalog.json", "utf8"),
    );
    for (const p of data.products) {
      expect(p.priceUsd, p.id).toBe(
        OFFICIAL.products[p.id as keyof typeof OFFICIAL.products],
      );
    }
    for (const p of data.plans) {
      expect(
        [p.monthlyUsd, p.annualUsd, p.memoryDays, p.notesHoursPerMonth],
        p.id,
      ).toEqual(OFFICIAL.plans[p.id as keyof typeof OFFICIAL.plans]);
    }

    const { container } = await renderPage();
    const text = container.textContent ?? "";
    for (const value of [
      "$149",
      "$129",
      "$7.99",
      "$79",
      "30 days",
      "12 months",
      "Unlimited",
    ]) {
      expect(text, value).toContain(value);
    }
    expect(text).toMatch(/10 hours/);
    cleanup();

    // Change the catalog: the page must follow.
    vi.doMock("@/lib/copper/catalog", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("@/lib/copper/catalog")>();
      return {
        ...actual,
        getProducts: () =>
          actual
            .getProducts()
            .map((p) => ({ ...p, priceUsd: p.priceUsd + 50 })),
        getPlans: () =>
          actual
            .getPlans()
            .map((p) =>
              p.id === "copper-plus"
                ? { ...p, monthlyUsd: 9.49, annualUsd: 95 }
                : p,
            ),
      };
    });
    const changed = (await renderPage()).container.textContent ?? "";
    for (const value of ["$199", "$179", "$9.49", "$95"]) {
      expect(changed, `shows ${value} after the catalog changes`).toContain(
        value,
      );
    }
    for (const value of ["$149", "$129", "$7.99"]) {
      expect(changed, `${value} is typed into the page`).not.toContain(value);
    }
  });

  it("AC-3.2 The privacy section explains the 2026 policy", async () => {
    const { container } = await renderPage();
    const text = section(container, "privacy-summary").textContent ?? "";
    expect(text).toContain("Hey Copper");
    expect(text).toMatch(/cloud/i);
    expect(text).toContain("30 days");
    expect(text).toContain("12 months");
    expect(text).toMatch(/delete/i);
    expect(text).toContain("Copper app");
  });

  it('AC-3.3 Nothing on the page says Copper "never records"', async () => {
    const { container } = await renderLandingPage();
    expect(container.textContent).not.toMatch(/never\s+record/i);
  });

  it("AC-4.1 The See products button is Copper, and the page uses only brand colors", async () => {
    const { container } = await renderPage();
    const button = within(section(container, "hero")).getByRole("link", {
      name: /see products/i,
    });
    const styled = button.closest("[class*='bg-']") ?? button;
    expect(styled.className, "See products uses bg-primary (Copper)").toMatch(
      /(^|\s)bg-(primary|\[#b87333\])(\s|$)/i,
    );

    const code = [...filesUnder("app"), ...filesUnder("components")].filter(
      (file) =>
        /\.(tsx?|jsx?)$/.test(file) &&
        !/components\/(ui|ai-elements)\//.test(file),
    );
    for (const file of code) {
      const colors = readFileSync(file, "utf8").match(
        /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi,
      );
      for (const color of colors ?? []) {
        const hex = color.slice(1).toLowerCase();
        expect(
          BRAND_COLORS.includes(hex) || ["fff", "ffffff"].includes(hex),
          `${file} uses non-brand color ${color}`,
        ).toBe(true);
      }
    }
  });
});
