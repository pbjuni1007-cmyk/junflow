// ANSI escape sequences
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

// TUI box-drawing characters
const BOX_DRAWING_RE = /[╭╮╰╯│─┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬]/g;

// CLI prompt artifacts
const PROMPT_RE = /^(codex>|gemini>|>)\s*/gm;

// Spinner/progress artifacts
const SPINNER_RE = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g;

/**
 * Strip ANSI escape codes from text
 */
function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

/**
 * Remove TUI artifacts (box drawing, prompts, spinners)
 */
function cleanTuiArtifacts(text: string): string {
  return text
    .replace(BOX_DRAWING_RE, '')
    .replace(PROMPT_RE, '')
    .replace(SPINNER_RE, '')
    .replace(/^\s*\n/gm, '\n') // collapse blank lines
    .replace(/\n{3,}/g, '\n\n'); // max 2 consecutive newlines
}

/**
 * Extract text content from NDJSON lines (Gemini stream-json format).
 * Each line may be a JSON object with text/content/output fields.
 * Non-JSON lines pass through as raw text.
 */
function extractFromNdjson(raw: string): string {
  const lines = raw.split('\n');
  const parts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed);
        const text = obj.text ?? obj.content ?? obj.output ?? obj.message;
        if (typeof text === 'string' && text.trim()) {
          parts.push(text);
        }
      } catch {
        // Not valid JSON — treat as raw text
        parts.push(trimmed);
      }
    } else {
      parts.push(trimmed);
    }
  }

  return parts.join('\n');
}

/**
 * Parse and clean CLI output.
 * 1. Strip ANSI escapes
 * 2. Extract from NDJSON if applicable
 * 3. Remove TUI artifacts
 * 4. Truncate to maxBytes
 */
export function parseCliOutput(
  raw: string,
  maxBytes: number = 51200,
): { output: string; truncated: boolean } {
  let text = stripAnsi(raw);

  // Try NDJSON extraction if multiple JSON-like lines detected
  const jsonLineCount = text.split('\n').filter((l) => l.trim().startsWith('{')).length;
  if (jsonLineCount > 2) {
    text = extractFromNdjson(text);
  }

  text = cleanTuiArtifacts(text).trim();

  // Truncate if needed
  const bytes = Buffer.byteLength(text, 'utf-8');
  if (bytes > maxBytes) {
    // Binary search for the right cut point
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (Buffer.byteLength(text.slice(0, mid), 'utf-8') <= maxBytes - 50) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    text = text.slice(0, lo) + '\n\n[... output truncated]';
    return { output: text, truncated: true };
  }

  return { output: text, truncated: false };
}
