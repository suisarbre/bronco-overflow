import { Fragment, type ReactNode } from "react";

// Posts are plain text. We only add three things: ```code blocks```,
// `inline code`, and clickable links. Nothing is rendered as HTML.

const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

function linkify(text: string, keyPrefix: string): ReactNode[] {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={`${keyPrefix}-${i}`}
        href={part}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        className="break-all text-link underline underline-offset-2 hover:opacity-80"
      >
        {part}
      </a>
    ) : (
      <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>
    ),
  );
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/`([^`\n]+)`/g).map((part, i) =>
    i % 2 === 1 ? (
      <code key={`${keyPrefix}-${i}`} className="rounded bg-code px-1 py-0.5 font-mono text-[0.9em]">
        {part}
      </code>
    ) : (
      <Fragment key={`${keyPrefix}-${i}`}>{linkify(part, `${keyPrefix}-${i}`)}</Fragment>
    ),
  );
}

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  // Odd segments are the inside of ``` fences (an optional language name on the first line is dropped).
  const segments = text.replace(/\r\n?/g, "\n").split(/```/g);
  return (
    <div className={`space-y-3 whitespace-pre-wrap break-words leading-relaxed ${className}`}>
      {segments.map((segment, i) => {
        if (i % 2 === 1 && i < segments.length - 1) {
          const code = segment.replace(/^[\w+#-]*\n/, "").replace(/\n$/, "");
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded-lg bg-code p-3 font-mono text-sm leading-snug whitespace-pre"
            >
              <code>{code}</code>
            </pre>
          );
        }
        const trimmed = (i % 2 === 1 ? "```" + segment : segment).replace(/^\n+|\n+$/g, "");
        return trimmed ? <p key={i}>{inline(trimmed, String(i))}</p> : null;
      })}
    </div>
  );
}
