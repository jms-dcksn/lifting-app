export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "gain"; value: string; strong: boolean };

export type MarkdownBlock =
  | { type: "paragraph"; inlines: Inline[] }
  | { type: "list"; items: Inline[][] };

const SOURCE_LINE = /^(?:\*\*)?Source:\s*(.+?)(?:\*\*)?\s*$/i;
const GAIN = /\+\d+(?:\.\d+)?%/g;
const LIST_ITEM = /^\s*[-*]\s+(.+)$/;

export function splitCoachReply(text: string): { body: string; sources: string[] } {
  const sources: string[] = [];
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    const match = line.trim().match(SOURCE_LINE);
    if (!match) {
      kept.push(line);
      continue;
    }
    const source = match[1].replace(/\*\*/g, "").trim();
    if (source) sources.push(source);
  }
  return { body: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), sources };
}

export function parseCoachMarkdown(body: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;

  function flushParagraph() {
    const text = paragraph.join(" ").replace(/[ \t]+/g, " ").trim();
    paragraph = [];
    if (!text) return;
    blocks.push({ type: "paragraph", inlines: parseInlines(text) });
  }

  function flushList() {
    if (!list?.length) {
      list = null;
      return;
    }
    blocks.push({ type: "list", items: list.map((item) => parseInlines(item)) });
    list = null;
  }

  for (const raw of body.split("\n")) {
    if (!raw.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const item = raw.match(LIST_ITEM);
    if (item) {
      flushParagraph();
      list ??= [];
      list.push(item[1].trim());
      continue;
    }
    if (list && /^\s{2,}\S/.test(raw)) {
      list[list.length - 1] += ` ${raw.trim()}`;
      continue;
    }
    flushList();
    paragraph.push(raw.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

function parseInlines(text: string): Inline[] {
  const chunks = text.split("**");
  const inlines: Inline[] = [];
  chunks.forEach((chunk, index) => {
    if (!chunk) return;
    pushChunk(inlines, chunk, index % 2 === 1);
  });
  return inlines;
}

function pushChunk(inlines: Inline[], chunk: string, strong: boolean) {
  let last = 0;
  for (const match of chunk.matchAll(GAIN)) {
    const start = match.index ?? 0;
    if (start > last) pushPlain(inlines, chunk.slice(last, start), strong);
    inlines.push({ type: "gain", value: match[0], strong });
    last = start + match[0].length;
  }
  if (last < chunk.length) pushPlain(inlines, chunk.slice(last), strong);
}

function pushPlain(inlines: Inline[], value: string, strong: boolean) {
  if (!value) return;
  inlines.push(strong ? { type: "strong", value } : { type: "text", value });
}
