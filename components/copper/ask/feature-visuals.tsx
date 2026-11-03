// Two pictures for the end of the "help me choose" robot flow:
//  1. a feature map: the product in the middle, its features around it, with
//     the ones your choice uses lit up and Copper Plus features badged;
//  2. a "behind the scenes" strip: how a request or a recording moves through
//     the device, the cloud and the Copper app.
// Everything shown comes from the recommend_product tool (the Product Bible).
import type { VisualFeature, VisualStep } from "@/lib/copper/assistant/tools";
import { cn } from "@/lib/utils";

type Visual = { features: VisualFeature[]; steps: VisualStep[] };

const W = 340;
const H = 290;
const CX = W / 2;
const CY = H / 2;
const RX = 104;
const RY = 106;
const NODE_H = 26;

function nodeWidth(name: string) {
  return Math.max(84, Math.round(name.length * 5.2 + 16));
}

function FeatureMap({
  features,
  productName,
}: {
  features: VisualFeature[];
  productName: string;
}) {
  const nodes = features.map((feature, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / features.length;
    return {
      ...feature,
      x: CX + RX * Math.cos(angle),
      y: CY + RY * Math.sin(angle),
      width: nodeWidth(feature.name),
    };
  });
  const lit = features.filter((feature) => feature.highlighted);
  const label = `${productName} and its features: ${features
    .map((feature) => feature.name + (feature.plus ? " (Copper Plus)" : ""))
    .join(
      ", ",
    )}. Lit up for you: ${lit.map((feature) => feature.name).join(", ")}.`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      data-testid="feature-map"
      className="h-auto w-full"
    >
      {/* spokes first, so the boxes sit on top of them */}
      {nodes.map((node) => (
        <line
          key={node.name}
          x1={CX}
          y1={CY}
          x2={node.x}
          y2={node.y}
          className={node.highlighted ? "stroke-primary" : "stroke-border"}
          strokeWidth={node.highlighted ? 2.5 : 1.5}
          strokeDasharray={node.highlighted ? undefined : "4 4"}
        />
      ))}

      {/* the product, with Copper the robot */}
      <circle
        cx={CX}
        cy={CY}
        r={42}
        className="fill-secondary stroke-primary"
        strokeWidth={3}
      />
      <clipPath id="pc-hub-clip">
        <circle cx={CX} cy={CY - 9} r={21} />
      </clipPath>
      <image
        href="/assets/brand/copper-mascot.png"
        x={CX - 21}
        y={CY - 30}
        width={42}
        height={42}
        clipPath="url(#pc-hub-clip)"
        preserveAspectRatio="xMidYMid slice"
      />
      <text
        x={CX}
        y={CY + 29}
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="800"
        className="fill-foreground"
      >
        {productName}
      </text>

      {nodes.map((node) => (
        <g
          key={node.name}
          data-highlighted={node.highlighted}
          data-plus={node.plus}
        >
          <rect
            x={node.x - node.width / 2}
            y={node.y - NODE_H / 2}
            width={node.width}
            height={NODE_H}
            rx={13}
            className={
              node.highlighted
                ? "fill-primary stroke-primary"
                : "fill-card stroke-border"
            }
            strokeWidth={1.5}
          />
          <text
            x={node.x}
            y={node.y + 3.5}
            textAnchor="middle"
            fontSize="9.5"
            fontWeight={node.highlighted ? 800 : 600}
            className={
              node.highlighted
                ? "fill-primary-foreground"
                : "fill-muted-foreground"
            }
          >
            {node.name}
          </text>
          {node.plus && (
            <>
              <rect
                x={node.x + node.width / 2 - 22}
                y={node.y - NODE_H / 2 - 7}
                width={26}
                height={13}
                rx={6.5}
                className="fill-chart-3"
              />
              <text
                x={node.x + node.width / 2 - 9}
                y={node.y - NODE_H / 2 + 2.5}
                textAnchor="middle"
                fontSize="8"
                fontWeight="800"
                className="fill-foreground"
              >
                Plus
              </text>
            </>
          )}
        </g>
      ))}
    </svg>
  );
}

const TIER = {
  device: { label: "On the device", dot: "bg-accent" },
  raw_ore: { label: "Raw Ore (low-cost cloud)", dot: "bg-primary" },
  refined: { label: "Refined (Copper Plus)", dot: "bg-chart-3" },
} as const;

function Strip({ steps }: { steps: VisualStep[] }) {
  const tiers = [
    ...new Set(steps.map((step) => step.tier).filter(Boolean)),
  ] as (keyof typeof TIER)[];
  return (
    <>
      <ol data-testid="how-it-works" className="flex flex-col">
        {steps.map((step, index) => (
          <li
            key={step.title}
            data-highlighted={step.highlighted}
            className={cn("flex gap-2.5", !step.highlighted && "opacity-50")}
          >
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold",
                  step.tier ? TIER[step.tier].dot : "bg-secondary",
                  step.highlighted
                    ? "text-foreground ring-primary ring-2"
                    : "text-foreground",
                )}
              >
                {index + 1}
              </span>
              {index < steps.length - 1 && (
                <span aria-hidden className="bg-border my-0.5 w-0.5 flex-1" />
              )}
            </div>
            <div className="pb-3">
              <p className="font-semibold">
                {step.title}
                {step.plus && (
                  <span className="bg-chart-3 text-foreground ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold">
                    Plus
                  </span>
                )}
              </p>
              <p className="text-muted-foreground text-xs">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      {tiers.length > 0 && (
        <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {tiers.map((tier) => (
            <span key={tier} className="flex items-center gap-1">
              <span
                aria-hidden
                className={cn("size-2.5 rounded-full", TIER[tier].dot)}
              />
              {TIER[tier].label}
            </span>
          ))}
        </p>
      )}
    </>
  );
}

export function FeatureVisuals({
  visual,
  productName,
}: {
  visual: Visual;
  productName: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-secondary/40 rounded-xl border p-2">
        <p className="mb-1 px-1 font-semibold">
          How {productName}&apos;s features connect
        </p>
        <FeatureMap features={visual.features} productName={productName} />
        <p className="text-muted-foreground px-1 text-xs">
          Lit up: what you picked. <span className="font-semibold">Plus</span>{" "}
          marks Copper Plus features.
        </p>
      </div>
      <div className="bg-secondary/40 rounded-xl border p-3">
        <p className="mb-2 font-semibold">What happens behind the scenes</p>
        <Strip steps={visual.steps} />
      </div>
    </div>
  );
}
