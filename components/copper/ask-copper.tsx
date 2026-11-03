"use client";

// Ask Copper: a floating button that opens a chat panel. The panel asks the
// askCopper Server Action and draws each streamed step (see ask/answer.tsx).
// Tools on and tools off are two separate conversations, so the tools-off
// model can't copy an answer the tools already worked out.
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUpIcon, MessageCircleIcon } from "lucide-react";
import { Answer } from "@/components/copper/ask/answer";
import { Guide } from "@/components/copper/ask/guide";
import { SetupRequired } from "@/components/setup-required";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { readLive } from "@/lib/ai/live";
import { askCopper, type ChatMessage } from "@/lib/copper/assistant/ask";
import type { Progress } from "@/lib/copper/assistant/progress";

const STARTERS = [
  "How much is Copper Home with Copper Plus, paid yearly, for 2 years?",
  "Is Copper Notes in Night Sky in stock?",
  "Is Copper Plus cheaper monthly or yearly?",
];

type Turn = { id: number; question: string; progress: Progress };
type Chats = { on: Turn[]; off: Turn[] };

const FAILED: Progress = {
  steps: [],
  reply: "Sorry, something went wrong. Please try again.",
  status: "error",
};

export function AskCopper({ aiConfigured }: { aiConfigured: boolean }) {
  const [open, setOpen] = useState(false);
  const [useTools, setUseTools] = useState(true);
  const [chats, setChats] = useState<Chats>({ on: [], off: [] });
  const [draft, setDraft] = useState("");
  const nextId = useRef(1);
  const body = useRef<HTMLDivElement>(null);

  const key = useTools ? "on" : "off";
  const turns = chats[key];
  const busy = turns.at(-1)?.progress.status === "working";

  // Open from the launcher, the header's Ask Copper link, or a /#ask address.
  // The link is also watched for clicks: once the address already ends in #ask,
  // clicking it again fires no hashchange.
  useEffect(() => {
    const onHash = () => window.location.hash === "#ask" && setOpen(true);
    const initial = window.setTimeout(onHash, 0);
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.('a[href="#ask"]')) setOpen(true);
    };
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
    };
  }, []);

  // Keep the newest step in view as the answer streams in.
  useEffect(() => {
    const element = body.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [chats, open, key]);

  const setProgress = useCallback(
    (chat: keyof Chats, id: number, progress: Progress) =>
      setChats((current) => ({
        ...current,
        [chat]: current[chat].map((turn) =>
          turn.id === id ? { ...turn, progress } : turn,
        ),
      })),
    [],
  );

  const ask = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || busy) return;
      const chat = key;
      const id = nextId.current++;

      // Only this chat's own history is sent: the questions and Copper's
      // finished replies, never steps or tool data.
      const messages: ChatMessage[] = turns.flatMap((turn) => [
        { role: "user" as const, content: turn.question },
        ...(turn.progress.status !== "working" && turn.progress.reply
          ? [{ role: "assistant" as const, content: turn.progress.reply }]
          : []),
      ]);
      messages.push({ role: "user", content: text });

      const first: Progress = { steps: [], reply: "", status: "working" };
      setChats((current) => ({
        ...current,
        [chat]: [...current[chat], { id, question: text, progress: first }],
      }));
      setDraft("");

      try {
        const { progress } = await askCopper({
          messages,
          useTools: chat === "on",
        });
        for await (const update of readLive(progress)) {
          setProgress(chat, id, update);
        }
      } catch {
        setProgress(chat, id, FAILED);
      }
    },
    [busy, key, setProgress, turns],
  );

  return (
    <>
      <button
        type="button"
        data-testid="ask-copper-launcher"
        onClick={() => setOpen(true)}
        className="bg-primary text-primary-foreground focus-visible:ring-ring/60 fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold shadow-lg transition-transform outline-none hover:-translate-y-0.5 focus-visible:ring-4 sm:right-6 sm:bottom-6"
      >
        <MessageCircleIcon className="size-5" aria-hidden />
        Ask Copper
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          data-testid="ask-copper"
          side="right"
          showCloseButton={false}
          className="flex w-full flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          {/* Header: always Night Sky, so the dark theme is applied here */}
          <div className="dark">
            <div className="bg-background text-foreground">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="bg-primary flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
                  <Image
                    src="/assets/brand/copper-mascot.png"
                    alt="Copper the robot"
                    width={40}
                    height={40}
                    className="size-10 object-cover"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-foreground text-base font-bold">
                    Ask Copper
                  </SheetTitle>
                  <SheetDescription className="text-muted-foreground text-xs">
                    Prices, totals and stock, checked with tools.
                  </SheetDescription>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="hover:bg-muted focus-visible:ring-ring/60 rounded-full p-2 outline-none focus-visible:ring-3"
                >
                  ✕
                </button>
              </div>
              <div className="bg-muted/60 flex items-center justify-between gap-3 px-4 py-2">
                <div>
                  <p className="text-sm font-semibold">Use tools</p>
                  <p className="text-muted-foreground text-xs">
                    {useTools ? "Checks every answer" : "Model guesses alone"}
                  </p>
                </div>
                <Switch
                  checked={useTools}
                  onCheckedChange={setUseTools}
                  aria-label="Use tools"
                />
              </div>
            </div>
          </div>

          {!aiConfigured ? (
            <div className="bg-secondary flex-1 overflow-y-auto px-4">
              <SetupRequired service="ai" />
            </div>
          ) : (
            <>
              <div
                ref={body}
                className="bg-secondary flex-1 space-y-6 overflow-y-auto px-4 py-4"
              >
                {turns.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    {useTools
                      ? "Ask about prices, totals or stock. Copper checks with its tools and shows its work."
                      : "Tools are off. Copper answers from memory alone, so watch for guesses."}
                  </p>
                )}
                {/* Copper the robot starts the "help me choose" questions himself */}
                {turns.length === 0 && useTools && <Guide />}
                {turns.map((turn) => (
                  <section key={turn.id} className="space-y-3">
                    <p className="bg-primary text-primary-foreground ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm px-3 py-2 text-sm">
                      {turn.question}
                    </p>
                    <Answer progress={turn.progress} useTools={useTools} />
                  </section>
                ))}

                {/* Starters stay on offer after every answer, except mid-reply */}
                {!busy && (
                  <div className="flex flex-col items-start gap-2">
                    {STARTERS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => ask(starter)}
                        className="bg-card hover:border-primary focus-visible:ring-ring/60 rounded-xl border px-3 py-2 text-left text-sm shadow-sm outline-none focus-visible:ring-3"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void ask(draft);
                }}
                className="bg-background flex items-center gap-2 border-t p-3"
              >
                <input
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  aria-label="Your question"
                  placeholder="Ask about prices or stock…"
                  className="bg-card focus-visible:ring-ring/50 min-w-0 flex-1 rounded-full border px-4 py-2 text-sm outline-none focus-visible:ring-3"
                />
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={busy || draft.trim() === ""}
                  className="bg-primary text-primary-foreground focus-visible:ring-ring/60 flex size-10 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 disabled:opacity-50"
                >
                  <ArrowUpIcon className="size-5" aria-hidden />
                </button>
              </form>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
