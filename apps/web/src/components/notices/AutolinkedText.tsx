import { ExternalLink } from "lucide-react";

const URL_REGEX = /(https?:\/\/[^\s<]+|www\.[^\s<]+\.[^\s<]+)/gi;

// Keep trailing punctuation outside link
const TRAILING_PUNCT = /[.,;:!?)\]}]+$/;

function normalizeUrl(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function splitTrailingPunct(url: string): { clean: string; trail: string } {
  const m = url.match(TRAILING_PUNCT);
  if (!m) return { clean: url, trail: "" };
  const trail = m[0];
  return { clean: url.slice(0, -trail.length), trail };
}

export function autolinkParts(text: string): Array<{ type: "text" | "link"; content: string; href?: string; trail?: string }> {
  const parts: Array<{ type: "text" | "link"; content: string; href?: string; trail?: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  // reset regex
  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(text)) !== null) {
    const raw = match[0];
    const idx = match.index;
    if (idx > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, idx) });
    }
    const { clean, trail } = splitTrailingPunct(raw);
    // Avoid linking obviously malformed trailing-only
    if (clean.length < 4) {
      parts.push({ type: "text", content: raw });
    } else {
      parts.push({ type: "link", content: clean, href: normalizeUrl(clean), trail });
    }
    lastIndex = idx + raw.length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }
  return parts;
}

interface Props {
  text: string;
  className?: string;
}

export function AutolinkedText({ text, className }: Props) {
  const parts = autolinkParts(text);
  // whitespace-pre-wrap handled by parent, but ensure breaks preserved
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.type === "text") return <span key={i}>{p.content}</span>;
        // display host without protocol for brevity — but keep full for href
        let label = p.content.replace(/^https?:\/\//i, "");
        // truncate very long links visually but keep href
        if (label.length > 48) label = `${label.slice(0, 44)}…`;
        return (
          <span key={i} className="inline">
            <a
              href={p.href}
              target="_blank"
              rel="noopener noreferrer"
              // prevent modal overlay close when clicking link
              onClick={(e) => e.stopPropagation()}
              className="group/link inline-flex max-w-full items-center gap-1 rounded-[8px] border border-primary/15 bg-primary/[0.08] px-1.5 py-0.5 align-baseline font-medium leading-none text-primary underline decoration-primary/25 decoration-[1.5px] underline-offset-[3px] transition-all hover:border-primary/30 hover:bg-primary hover:text-primary-foreground hover:decoration-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              <span className="min-w-0 truncate">{label}</span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-60 transition-transform group-hover/link:translate-x-[1px] group-hover/link:-translate-y-[1px] group-hover/link:opacity-100" aria-hidden />
            </a>
            {p.trail ? <span>{p.trail}</span> : null}
          </span>
        );
      })}
    </span>
  );
}
