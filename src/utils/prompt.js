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
  const langNote  = LANGUAGE_NOTES[language?.toLowerCase()] ?? language;
  const title     = problemData?.title ?? 'Unknown';
  const difficulty = problemData?.difficulty ?? '';
  const tags      = (problemData?.topicTags ?? []).map(t => t.name).join(', ');
  // Very short problem context — 200 chars is enough since hints carry the analysis
  const stmt      = stripHtml(problemData?.content ?? '').slice(0, 200);

  const { pattern, complexity, structures } = hints;

  // Serialize local analysis results into the prompt
  const hintsBlock = [
    `Pattern detected : ${pattern.name} (confidence: ${pattern.confidence})`,
    `Time estimate    : ${complexity.time}${complexity.hasSort ? ' (sort present)' : ''}`,
    `Space estimate   : ${complexity.space}`,
    `Loop depth       : ${complexity.loopDepth}`,
    `Recursion        : ${complexity.hasRecursion ? 'yes' : 'no'}${complexity.hasMemo ? ' (memoized)' : ''}`,
    `Data structures  : ${structures.join(', ')}`,
  ].join('\n');

  return `LeetCode solution analyzer. Local static analysis already ran — verify and output JSON.

Problem: ${title} (${difficulty})${tags ? ` [${tags}]` : ''}
${stmt}

Code [${langNote}]:
\`\`\`${language}
${code}
\`\`\`

── Local analysis results (verify these, correct if wrong) ──
${hintsBlock}

Based on the code and the above hints, output ONLY this JSON (no markdown, no extra text):
{"approach":{"name":"<pattern>","description":"<2 sentences>"},"timeComplexity":{"notation":"O(...)","explanation":"<1 sentence>"},"spaceComplexity":{"notation":"O(...)","explanation":"<1 sentence>"},"efficiencyRating":<1-10>,"suggestions":["<fix1>","<fix2>"],"confidence":"<high|medium|low>","optimalComplexity":{"time":"O(...)","space":"O(...)"}}`;
}

// ─── Fallback: Full Reasoning Prompt (no hints) ───────────────────────────────

/**
 * Fallback prompt — used only if local analysis is unavailable.
 * Token-optimized version (400-char problem statement, compact schema).
 */
export function buildAnalysisPrompt({ problemData, code, language }) {
  const langNote  = LANGUAGE_NOTES[language?.toLowerCase()] ?? language;
  const stmt      = stripHtml(problemData?.content ?? '').slice(0, 400);
  const title     = problemData?.title ?? 'Unknown';
  const difficulty = problemData?.difficulty ?? '';
  const tags      = (problemData?.topicTags ?? []).map(t => t.name).join(', ');

  return `Analyze this LeetCode solution. Output ONLY valid JSON, no markdown.

Problem: ${title} (${difficulty})${tags ? ` [${tags}]` : ''}
${stmt}

Code [${langNote}]:
\`\`\`${language}
${code}
\`\`\`

JSON schema (fill every field):
{"approach":{"name":"<pattern>","description":"<2 sentences>"},"timeComplexity":{"notation":"O(...)","explanation":"<1 sentence>"},"spaceComplexity":{"notation":"O(...)","explanation":"<1 sentence>"},"efficiencyRating":<1-10>,"suggestions":["<fix1>","<fix2>"],"confidence":"<high|medium|low>","optimalComplexity":{"time":"O(...)","space":"O(...)"}}`;
}
