/**
 * prompt.js — Language-aware prompt builder for LeetCode AI analysis.
 *
 * Two prompt strategies:
 *   buildAnalysisPromptWithHints() — used when local agent tools pre-analyzed the code.
 *     The LLM only confirms/refines pre-computed facts and formats JSON.
 *     Reasoning tokens: ~100 (down from ~2,300).
 *
 *   buildAnalysisPrompt() — fallback full prompt (no hints available).
 */

const LANGUAGE_NOTES = {
  python3:    'Python 3 (list slices=O(n) space, dict/set=O(1) avg)',
  python:     'Python 2 (same rules as Python 3)',
  javascript: 'JavaScript (Array.sort=O(n log n), Map/Set=O(1) avg)',
  typescript: 'TypeScript/JS (same rules as JavaScript)',
  java:       'Java (Collections.sort=O(n log n), HashMap=O(1) avg)',
  cpp:        'C++ (std::sort=O(n log n), unordered_map=O(1) avg, map=O(log n))',
  c:          'C (manual memory, mind stack vs heap)',
  csharp:     'C# (LINQ may be O(n), Dictionary=O(1) avg)',
  golang:     'Go (map=O(1) avg, slice backed by array)',
  rust:       'Rust (Vec push=O(1) amortized, HashMap=O(1) avg)',
  kotlin:     'Kotlin/JVM (same rules as Java)',
  swift:      'Swift (Array/Dictionary same as C-family)',
  ruby:       'Ruby (Hash=O(1) avg, sort=O(n log n))',
  scala:      'Scala/JVM (immutable vs mutable collections differ)',
  php:        'PHP (array functions may hide O(n) costs)',
};

const UNSUPPORTED_TYPES = ['mysql', 'mssql', 'oraclesql', 'postgresql', 'bash', 'shell'];

export function isLanguageSupported(language) {
  return !UNSUPPORTED_TYPES.includes(language?.toLowerCase());
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Primary: Hints-Based Prompt (used when local agent tools ran) ─────────────

/**
 * Builds a short "confirm and format" prompt using pre-analyzed hints.
 * The LLM doesn't reason from scratch — it just verifies and fills the JSON.
 *
 * @param {{ problemData, code, language, hints }} opts
 *   hints = { pattern, complexity, structures } from analyzeCode()
 * @returns {string}
 */
export function buildAnalysisPromptWithHints({ problemData, code, language, hints }) {
  const langNote   = LANGUAGE_NOTES[language?.toLowerCase()] ?? language;
  const title      = problemData?.title ?? 'Unknown';
  const difficulty = problemData?.difficulty ?? '';
  const tags       = (problemData?.topicTags ?? []).map(t => t.name).join(', ');
  const stmt       = stripHtml(problemData?.content ?? '').slice(0, 200);
  const { pattern, complexity, structures } = hints;

  return `Fill this JSON for the LeetCode solution below. Your response must begin with { and end with }. No other text.

{"approach":{"name":"FILL","description":"FILL 2 sentences"},"timeComplexity":{"notation":"FILL e.g. O(n)","explanation":"FILL 1 sentence"},"spaceComplexity":{"notation":"FILL","explanation":"FILL 1 sentence"},"efficiencyRating":FILL_1_to_10,"suggestions":["FILL specific fix 1","FILL specific fix 2"],"confidence":"FILL high|medium|low","optimalComplexity":{"time":"FILL","space":"FILL"}}

Problem: ${title} (${difficulty})${tags ? ` [${tags}]` : ''} — ${stmt}

Code [${langNote}]: ${code}

Local static analysis (verify, correct if wrong):
- Pattern: ${pattern.name} (${pattern.confidence} confidence)
- Time: ${complexity.time}${complexity.hasSort ? ', sort detected' : ''}, loop depth ${complexity.loopDepth}
- Space: ${complexity.space}, recursion: ${complexity.hasRecursion ? 'yes' : 'no'}${complexity.hasMemo ? ' memoized' : ''}
- Structures: ${structures.join(', ')}`;
}

// ─── Fallback: Full Reasoning Prompt (no hints) ───────────────────────────────

/**
 * Fallback prompt — used only if local analysis is unavailable.
 * Token-optimized version (400-char problem statement, compact schema).
 */
export function buildAnalysisPrompt({ problemData, code, language }) {
  const langNote   = LANGUAGE_NOTES[language?.toLowerCase()] ?? language;
  const stmt       = stripHtml(problemData?.content ?? '').slice(0, 300);
  const title      = problemData?.title ?? 'Unknown';
  const difficulty = problemData?.difficulty ?? '';
  const tags       = (problemData?.topicTags ?? []).map(t => t.name).join(', ');

  return `Fill this JSON for the LeetCode solution below. Your response must begin with { and end with }. No other text.

{"approach":{"name":"FILL","description":"FILL 2 sentences"},"timeComplexity":{"notation":"FILL e.g. O(n)","explanation":"FILL 1 sentence"},"spaceComplexity":{"notation":"FILL","explanation":"FILL 1 sentence"},"efficiencyRating":FILL_1_to_10,"suggestions":["FILL specific fix 1","FILL specific fix 2"],"confidence":"FILL high|medium|low","optimalComplexity":{"time":"FILL","space":"FILL"}}

Problem: ${title} (${difficulty})${tags ? ` [${tags}]` : ''} — ${stmt}

Code [${langNote}]: ${code}`;
}
