import React, { useEffect, useRef, useState } from "react";
import { HelpCircle, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type HowItWorksProps = {
  helpKey: string;
  title: string;
  purpose: string;
  userAction: string | string[];
  cpqUses: string | string[];
  estimatorNote?: string;
  workflow?: string;
  related?: string[];
  size?: "sm" | "md";
  align?: "start" | "center" | "end";
};

const STORAGE_PREFIX = "cpq-help-seen:";

function toList(v: string | string[]): string[] {
  return Array.isArray(v) ? v : [v];
}

type SectionProps = {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

const Section: React.FC<SectionProps> = ({ label, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border border-border rounded-md">
      <CollapsibleTrigger className="w-full flex items-center justify-between px-2.5 py-2 text-left text-xs font-semibold hover:bg-muted/50 rounded-md">
        <span>{label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2.5 pb-2.5 pt-1 text-xs leading-relaxed">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
};

const HowItWorks: React.FC<HowItWorksProps> = ({
  helpKey,
  title,
  purpose,
  userAction,
  cpqUses,
  estimatorNote,
  workflow,
  related,
  size = "md",
  align = "end",
}) => {
  const storageKey = `${STORAGE_PREFIX}${helpKey}`;
  const [seen, setSeen] = useState<boolean>(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

  useEffect(() => {
    try {
      setSeen(localStorage.getItem(storageKey) === "1");
    } catch {
      setSeen(true);
    }
  }, [storageKey]);

  const markSeen = () => {
    if (!seen) {
      try { localStorage.setItem(storageKey, "1"); } catch { /* noop */ }
      setSeen(true);
    }
  };

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setHasMoreBelow(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll);
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      ro.disconnect();
    };
  });

  const isSm = size === "sm";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <Popover onOpenChange={(open) => { if (open) { markSeen(); setTimeout(checkScroll, 0); } }}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={title}
                className={cn(
                  "relative inline-flex items-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 text-primary font-semibold hover:bg-primary/20 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 transition-colors shrink-0",
                  isSm ? "h-8 px-2.5 text-[11px]" : "h-10 px-3 text-xs",
                  !seen && "animate-pulse ring-2 ring-primary/40",
                )}
              >
                <HelpCircle className={cn(isSm ? "h-3.5 w-3.5" : "h-4 w-4")} />
                <span>How it works</span>
                {!seen && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" aria-hidden="true" />
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            Brief guide on what this section does and how CPQ uses your inputs.
          </TooltipContent>
          <PopoverContent align={align} className="w-96 p-0 text-xs leading-relaxed">
            <div className="px-4 pt-3 pb-2 border-b border-border">
              <p className="font-semibold text-sm">{title}</p>
            </div>

            <div className="relative">
              <div
                ref={scrollRef}
                className="max-h-[60vh] overflow-y-auto px-4 py-3 space-y-2 scrollbar-thin"
              >
                <Section label="Purpose" defaultOpen>
                  <p className="whitespace-pre-line">{purpose}</p>
                </Section>

                <Section label="What to enter or review" defaultOpen>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {toList(userAction).map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </Section>

                <Section label="How CPQ uses this">
                  <ul className="list-disc pl-4 space-y-0.5">
                    {toList(cpqUses).map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </Section>

                {estimatorNote && (
                  <Section label="Estimator note">
                    <p>{estimatorNote}</p>
                  </Section>
                )}

                {workflow && (
                  <Section label="Workflow">
                    <p className="font-mono text-[11px]">{workflow}</p>
                  </Section>
                )}

                {related && related.length > 0 && (
                  <Section label="Related pages">
                    <ul className="list-disc pl-4 space-y-0.5">
                      {related.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </Section>
                )}
              </div>

              {/* Fade + scroll hint when more content exists below */}
              {hasMoreBelow && (
                <>
                  <div className="pointer-events-none absolute bottom-7 left-0 right-0 h-8 bg-gradient-to-t from-popover to-transparent" />
                  <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1 py-1 bg-popover border-t border-border text-[10px] font-medium text-muted-foreground">
                    <ChevronDown className="h-3 w-3 animate-bounce" />
                    Scroll for more
                  </div>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </Tooltip>
    </TooltipProvider>
  );
};

export default HowItWorks;
