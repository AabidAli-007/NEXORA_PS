import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface MarkdownMessageProps {
  content: string;
}

interface TokenSpan {
  text: string;
  tone: 'plain' | 'keyword' | 'string' | 'comment' | 'number';
}

const CODE_KEYWORDS = new Set([
  'const',
  'let',
  'var',
  'function',
  'return',
  'async',
  'await',
  'if',
  'else',
  'for',
  'while',
  'import',
  'from',
  'export',
  'default',
  'class',
  'new',
  'try',
  'catch',
  'throw',
  'def',
  'elif',
  'pass',
  'with',
  'as',
  'in',
  'is',
  'not',
  'and',
  'or',
  'True',
  'False',
  'None',
  'true',
  'false',
  'null',
  'undefined',
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'ON',
  'GROUP',
  'BY',
  'HAVING',
  'ORDER',
  'AS',
  'COUNT',
  'SUM',
  'AVG',
  'INSERT',
  'INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE',
  'CREATE',
  'TABLE',
  'select',
  'from',
  'where',
  'join',
  'left',
  'inner',
  'on',
  'group',
  'by',
  'having',
  'order',
]);

function tokenizeCodeLine(line: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  const regex = /(\/\/.*$|#.*$|--.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/gm;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      spans.push({ text: line.slice(lastIndex, match.index), tone: 'plain' });
    }
    const token = match[0];
    if (token.startsWith('//') || token.startsWith('#') || token.startsWith('--')) {
      spans.push({ text: token, tone: 'comment' });
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
      spans.push({ text: token, tone: 'string' });
    } else if (/^\d/.test(token)) {
      spans.push({ text: token, tone: 'number' });
    } else if (CODE_KEYWORDS.has(token)) {
      spans.push({ text: token, tone: 'keyword' });
    } else {
      spans.push({ text: token, tone: 'plain' });
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < line.length) {
    spans.push({ text: line.slice(lastIndex), tone: 'plain' });
  }
  return spans.length > 0 ? spans : [{ text: line, tone: 'plain' }];
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API unavailable
    }
  }

  const lines = code.replace(/\n$/, '').split('\n');

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-[#312F29] bg-[#1C1B18] text-[#F8F6EF]">
      <div className="flex items-center justify-between border-b border-[#312F29] bg-[#24231F] px-3.5 py-2 text-[11px]">
        <span className="font-mono font-medium text-[#E8B52E]">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-[#F8F6EF]/80 hover:bg-[#312F29] hover:text-[#F8F6EF] cursor-pointer whitespace-nowrap shrink-0"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-[#E8B52E]" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-xs leading-relaxed">
        <code>
          {lines.map((line, lineIdx) => (
            <div key={lineIdx} className="whitespace-pre">
              {tokenizeCodeLine(line).map((span, spanIdx) => {
                const colorClass =
                  span.tone === 'keyword'
                    ? 'text-[#E8B52E] font-medium'
                    : span.tone === 'string'
                      ? 'text-[#A8C686]'
                      : span.tone === 'comment'
                        ? 'text-[#89877F] italic'
                        : span.tone === 'number'
                          ? 'text-[#E89B6C]'
                          : 'text-[#F8F6EF]';
                return (
                  <span key={spanIdx} className={colorClass}>
                    {span.text}
                  </span>
                );
              })}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={keyIdx++}
          className="rounded bg-[#F4E3B2]/55 px-1.5 py-0.5 font-mono text-[0.85em] text-[#24231F]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={keyIdx++} className="font-semibold text-[#24231F]">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <em key={keyIdx++} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(token);
      if (linkMatch) {
        nodes.push(
          <a
            key={keyIdx++}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-[#E8B52E] underline-offset-2 font-medium text-[#24231F] hover:text-[#77764B]"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        nodes.push(token);
      }
    }
    lastIdx = match.index + token.length;
  }

  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }
  return nodes;
}

function renderMarkdownSegment(segment: string): React.ReactNode[] {
  const lines = segment.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let keyCounter = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      elements.push(<hr key={keyCounter++} className="my-3 border-[#E8E3D8]" />);
      i += 1;
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const depth = headingMatch[1].length;
      const cls =
        depth <= 2
          ? 'mt-3 mb-1.5 text-base font-semibold text-[#24231F]'
          : 'mt-2.5 mb-1 text-sm font-semibold text-[#24231F]';
      elements.push(
        <div key={keyCounter++} className={cls}>
          {renderInline(headingMatch[2])}
        </div>
      );
      i += 1;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      elements.push(
        <blockquote
          key={keyCounter++}
          className="my-2.5 rounded-xl border border-[#E8E3D8] bg-[#F8F6EF] px-3.5 py-2.5 text-xs sm:text-sm text-[#24231F]/90"
        >
          {renderInline(quoteLines.join(' '))}
        </blockquote>
      );
      continue;
    }

    // Markdown table
    if (
      trimmed.startsWith('|') &&
      i + 1 < lines.length &&
      /^\|\s*[-:]+/.test(lines[i + 1].trim())
    ) {
      const parseRow = (r: string) =>
        r
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());

      const headers = parseRow(trimmed);
      i += 2; // skip header & separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseRow(lines[i]));
        i += 1;
      }
      elements.push(
        <div key={keyCounter++} className="my-3 overflow-x-auto rounded-xl border border-[#E8E3D8]">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-[#F8F6EF] text-[#24231F]">
              <tr>
                {headers.map((h, idx) => (
                  <th key={idx} className="border-b border-[#E8E3D8] px-3 py-2 font-semibold">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E3D8] bg-white">
              {rows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {headers.map((_, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 text-[#24231F]/90 tabular-nums">
                      {renderInline(row[cIdx] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i += 1;
      }
      elements.push(
        <ul key={keyCounter++} className="my-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i += 1;
      }
      elements.push(
        <ol key={keyCounter++} className="my-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Regular paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,4}\s+|[-*+]\s+|\d+[.)]\s+|>\s?|```|\|)/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    elements.push(
      <p key={keyCounter++} className="my-2 text-sm leading-relaxed first:mt-0 last:mb-0">
        {renderInline(paraLines.join(' '))}
      </p>
    );
  }

  return elements;
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  const parts: { type: 'text' | 'code'; content: string; language?: string }[] = [];
  const fenceRegex = /```([A-Za-z0-9_+-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    parts.push({
      type: 'code',
      language: match[1].trim(),
      content: match[2],
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return (
    <div className="space-y-1 break-words">
      {parts.map((part, idx) =>
        part.type === 'code' ? (
          <CodeBlock key={idx} language={part.language || ''} code={part.content} />
        ) : (
          <div key={idx}>{renderMarkdownSegment(part.content)}</div>
        )
      )}
    </div>
  );
}
