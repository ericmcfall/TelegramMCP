export const MESSAGE_LIMIT = 4096;
export const CAPTION_LIMIT = 1024;

const PLAIN_TOKENS = /\s+|\S+/g;
const HTML_TOKENS = /<\/?[a-zA-Z][^>]*>|&#?\w+;|\s+|[^\s<&]+|[<&]/g;
const TAG = /^<(\/?)([a-zA-Z][\w-]*)/;

// Length as Telegram counts it once tags and entities are parsed.
export function visibleLength(text, format) {
  if (format !== 'html') return text.length;
  return text.replace(/<\/?[a-zA-Z][^>]*>/g, '').replace(/&#?\w+;/g, 'x').length;
}

function isBlank(chunk, format) {
  const text = format === 'html' ? chunk.replace(/<\/?[a-zA-Z][^>]*>/g, '') : chunk;
  return text.trim() === '';
}

// Cut without landing between the two halves of a surrogate pair (emoji).
function hardCut(token, size) {
  const code = token.charCodeAt(size - 1);
  return code >= 0xd800 && code <= 0xdbff && size > 1 ? size - 1 : size;
}

// Splits at word boundaries. In html mode, tags left open at a split are
// closed at the end of that part and reopened at the start of the next.
export function splitMessage(text, format = 'plain', limit = MESSAGE_LIMIT) {
  const tokens = text.match(format === 'html' ? HTML_TOKENS : PLAIN_TOKENS) ?? [];
  const parts = [];
  const stack = [];
  let current = '';

  const closers = () =>
    stack.slice().reverse().map((tag) => `</${tag.name}>`).join('');
  const flush = () => {
    const part = current + closers();
    if (!isBlank(part, format)) parts.push(part.trim());
    current = stack.map((tag) => tag.open).join('');
  };
  const room = () => limit - current.length - closers().length;

  for (const token of tokens) {
    const tag = format === 'html' ? token.match(TAG) : null;
    if (tag && !tag[1]) {
      // Keep room for this tag's own closer as well.
      if (token.length + tag[2].length + 3 > room()) flush();
      current += token;
      stack.push({ name: tag[2], open: token });
      continue;
    }
    if (tag) {
      const index = stack.findLastIndex((open) => open.name === tag[2]);
      current += token;
      if (index !== -1) stack.splice(index, 1);
      continue;
    }

    if (token.length > room()) flush();
    let rest = token;
    while (rest.length > room()) {
      const size = hardCut(rest, Math.max(1, room()));
      current += rest.slice(0, size);
      rest = rest.slice(size);
      flush();
    }
    current += rest;
  }
  flush();
  return parts;
}
