"use client";

import { useState } from "react";

/* ---------------------------------------------------------------------- */
/* Inline formatting: **bold**, *italic*, `code`, [text](url)             */
/* ---------------------------------------------------------------------- */

function renderInline(text, keyPrefix) {
  const nodes = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("[")) {
      const m = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (m) {
        nodes.push(
          <a key={key} href={m[2]} target="_blank" rel="noreferrer">
            {m[1]}
          </a>
        );
      }
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/* ---------------------------------------------------------------------- */
/* Fenced code block with a copy button                                   */
/* ---------------------------------------------------------------------- */

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available */
    }
  }

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span>{lang || "code"}</span>
        <button onClick={handleCopy} className="copy-btn">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="code-block">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Main Block Parser: Tables, Headers, Lists, Paragraphs & Code           */
/* ---------------------------------------------------------------------- */

export default function Markdown({ text }) {
  if (!text) return null;

  const segments = text.split(/```(\w*)\n?([\s\S]*?)```/g);
  const blocks = [];

  for (let i = 0; i < segments.length; i += 3) {
    const prose = segments[i];
    const lang = segments[i + 1];
    const code = segments[i + 2];

    if (prose) blocks.push(...parseProse(prose, `p${i}`));
    if (code !== undefined) {
      blocks.push(
        <CodeBlock key={`code${i}`} lang={lang} code={code.replace(/\n$/, "")} />
      );
    }
  }

  return <div className="markdown-content">{blocks}</div>;
}

function parseProse(prose, keyPrefix) {
  const lines = prose.split("\n");
  const out = [];
  let listBuffer = [];
  let listType = null;
  let tableBuffer = [];

  function flushList() {
    if (!listBuffer.length) return;
    const Tag = listType === "ol" ? "ol" : "ul";
    out.push(
      <Tag key={`${keyPrefix}-list-${out.length}`}>
        {listBuffer.map((item, idx) => (
          <li key={idx}>{renderInline(item, `${keyPrefix}-li-${idx}`)}</li>
        ))}
      </Tag>
    );
    listBuffer = [];
    listType = null;
  }

  function flushTable() {
    if (!tableBuffer.length) return;
    const tableKey = `${keyPrefix}-table-${out.length}`;

    // Filter out separator lines like |---|---|
    const validRows = tableBuffer.filter(
      (r) => !/^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)*\|?$/.test(r)
    );

    if (validRows.length > 0) {
      const headerRow = validRows[0]
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());

      const bodyRows = validRows.slice(1).map((row) =>
        row
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim())
      );

      out.push(
        <table key={tableKey}>
          <thead>
            <tr>
              {headerRow.map((col, idx) => (
                <th key={idx}>{renderInline(col, `${tableKey}-th-${idx}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx}>
                    {renderInline(cell, `${tableKey}-td-${rIdx}-${cIdx}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    tableBuffer = [];
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const key = `${keyPrefix}-${idx}`;

    if (!trimmed) {
      flushList();
      flushTable();
      return;
    }

    // Horizontal Rule Parsing
    if (/^(---|___|\*\*\*)$/.test(trimmed)) {
      flushList();
      flushTable();
      out.push(<hr key={key} />);
      return;
    }

    // Markdown Table Row Detection
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList();
      tableBuffer.push(trimmed);
      return;
    } else {
      flushTable();
    }

    // Heading Detection
    const h = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushList();
      const level = h[1].length;
      const HeadingTag = `h${Math.min(level + 1, 6)}`;
      out.push(
        <HeadingTag key={key}>{renderInline(h[2], key)}</HeadingTag>
      );
      return;
    }

    // Ordered List Detection
    const ol = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listBuffer.push(ol[1]);
      return;
    }

    // Unordered List Detection
    const ul = trimmed.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listBuffer.push(ul[1]);
      return;
    }

    flushList();
    out.push(<p key={key}>{renderInline(trimmed, key)}</p>);
  });

  flushList();
  flushTable();
  return out;
}