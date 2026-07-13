/**
 * renderMarkdown — Shared, LRU-cached Markdown-to-HTML parser.
 *
 * Consolidates three duplicate inline implementations from:
 *   - ProjectMemory.tsx
 *   - AgentReviewCenter.tsx
 *   - WorkspaceExplorer.tsx
 *
 * Parsed results are cached by content fingerprint so identical
 * documents only parse once, even across re-renders and component
 * remounts. Max 64 entries before evicting oldest.
 */

const CACHE_MAX = 64;
const cache = new Map<string, string>();

function contentKey(text: string): string {
  // Fast fingerprint: length + first 128 chars
  return `${text.length}|${text.slice(0, 128)}`;
}

function evictIfNeeded() {
  if (cache.size >= CACHE_MAX) {
    // Delete oldest entry (Map preserves insertion order)
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
}

function parseMarkdown(text: string): string {
  if (!text) return "";

  // Strip HTML comments before escaping
  let html = text.replace(/<!--[\s\S]*?-->/g, "");

  // Escape HTML special chars
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Fenced code blocks (must run before inline code)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const l = lang ? `<span class="md-lang">${lang}</span>` : "";
    return `<div class="md-codeblock">${l}<pre>${code.trimEnd()}</pre></div>`;
  });

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr class="md-hr" />');

  // Bold+Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="md-bold">$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em class="md-em">$1</em>');

  // Inline code (after fenced blocks already replaced)
  html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');

  // Checklists (before plain list items)
  html = html.replace(
    /^(\s*)- \[x\] (.+)$/gm,
    (_m, spaces, t) =>
      `<div class="md-check done" style="margin-left:${spaces.length * 8}px"><span class="md-checkbox checked">✓</span> ${t}</div>`
  );
  html = html.replace(
    /^(\s*)- \[\/\] (.+)$/gm,
    (_m, spaces, t) =>
      `<div class="md-check in-progress" style="margin-left:${spaces.length * 8}px"><span class="md-checkbox half-checked" style="color:#f59e0b">◐</span> <span style="color:#f59e0b">${t}</span></div>`
  );
  html = html.replace(
    /^(\s*)- \[ \] (.+)$/gm,
    (_m, spaces, t) =>
      `<div class="md-check" style="margin-left:${spaces.length * 8}px"><span class="md-checkbox">○</span> ${t}</div>`
  );

  // Unordered list items
  html = html.replace(
    /^(\s*)- (.+)$/gm,
    (_m, spaces, t) =>
      `<div class="md-li" style="margin-left:${spaces.length * 8}px"><span class="md-bullet">•</span> ${t}</div>`
  );

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<div class="md-blockquote">$1</div>');

  // Collapse excess blank lines
  html = html.replace(/\n{3,}/g, "\n\n");

  return html;
}

/** Public API — returns cached HTML or parses and caches on miss. */
export function renderMarkdown(text: string): string {
  const key = contentKey(text);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const result = parseMarkdown(text);
  evictIfNeeded();
  cache.set(key, result);
  return result;
}

/** React hook that memoizes markdown output, recomputing only when `content` changes. */
export function useMarkdown(content: string): string {
  return renderMarkdown(content);
}
