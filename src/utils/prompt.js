/**
 * prompt.js — Language-aware prompt builder for LeetCode AI analysis.
 *
 * Optimized for speed: compact JSON schema inline, concise instructions.
 * Still uses chain-of-thought (reasoning BEFORE answer) to reduce Big-O hallucinations.
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

/**
 * Compact prompt — ~40% shorter than original while keeping chain-of-thought.
 * Inline JSON schema avoids the model re-reading a verbose description.
 */
export function buildAnalysisPrompt({ problemData, code, language }) {
  const langNote = LANGUAGE_NOTES[language?.toLowerCase()] ?? `Language: ${language}`;
  // Trim problem statement harder — 800 chars is enough for context
  const stmt = stripHtml(problemData?.content ?? '').slice(0, 800);
  const title = problemData?.title ?? 'Unknown';
  const difficulty = problemData?.difficulty ?? '';
  const tags = (problemData?.topicTags ?? []).map(t => t.name).join(', ');

  return `Expert algorithm analyst. Analyze this LeetCode solution, reason step-by-step, then output ONLY valid JSON.

## Problem: ${title} (${difficulty})${tags ? `\nTags: ${tags}` : ''}
${stmt}

## Solution [${langNote}]
\`\`\`${language}
${code}
\`\`\`

Reason through: (1) pattern/approach, (2) time complexity tracing each loop/call, (3) space complexity counting aux structures + stack, (4) edge cases, (5) 2-3 specific improvements.

Then output ONLY this JSON (no markdown, no extra text):
{"approach":{"name":"<pattern>","description":"<2 sentences>"},"timeComplexity":{"notation":"O(...)","explanation":"<1 sentence>"},"spaceComplexity":{"notation":"O(...)","explanation":"<1 sentence>"},"efficiencyRating":<1-10>,"suggestions":["<specific fix 1>","<specific fix 2>"],"confidence":"<high|medium|low>","optimalComplexity":{"time":"O(...)","space":"O(...)"}}`;
}
