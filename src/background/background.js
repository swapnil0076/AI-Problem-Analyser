/**
 * background.js — Service Worker (Manifest V3, ES Module)
 *
 * Handles:
 * 1. Opening the Chrome Side Panel
 * 2. Fetching problem data from LeetCode's internal GraphQL API
 * 3. Running local agent tools (codeAnalyzer) — zero API cost pre-analysis
 * 4. Calling the LLM with pre-analyzed hints (drastically fewer reasoning tokens)
 * 5. Caching results in chrome.storage.local
 * 6. Saving analysis history (last 20 entries)
 */

import { buildAnalysisPrompt, buildAnalysisPromptWithHints, isLanguageSupported } from '../utils/prompt.js';
import { analyzeCode } from '../utils/codeAnalyzer.js';
import { getRecommendations } from '../utils/recommendations.js';
import { recordAndLogTokenUsage, getTokenStats } from '../utils/tokenLogger.js';

const LEETCODE_GRAPHQL = 'https://leetcode.com/graphql';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_HISTORY = 20;

// ─── Message Router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'OPEN_SIDE_PANEL':
      if (sender.tab?.windowId) {
        chrome.sidePanel
          .open({ windowId: sender.tab.windowId })
          .catch(err => console.warn('[BG] Side panel open failed:', err));
      }
      sendResponse({ success: true });
      break;

    case 'ANALYZE_CODE':
      handleAnalysis(message.payload, sender.tab)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(err => {
          console.error('[BG] Analysis error:', err);
          sendResponse({ success: false, error: err.message });
        });
      return true; // Keep message channel open for async

    case 'UNSUPPORTED_PROBLEM':
      chrome.storage.local.set({
        latestAnalysis: {
          _status: 'unsupported',
          titleSlug: message.payload.titleSlug,
          timestamp: Date.now(),
        },
      });
      sendResponse({ success: true });
      break;

    case 'PREFETCH_PROBLEM':
      // Pre-fetch and cache problem data immediately on page load.
      // By the time user clicks Analyze, GraphQL is already done — removes it from hot path.
      prefetchProblemData(message.payload.titleSlug);
      sendResponse({ success: true });
      break;

    case 'GET_TOKEN_STATS':
      getTokenStats()
        .then(stats => sendResponse({ success: true, data: stats }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'CLEAR_PROBLEM_CACHE':
      clearProblemCache(message.payload?.titleSlug)
        .then(count => sendResponse({ success: true, cleared: count }))
        .catch(err  => sendResponse({ success: false, error: err.message }));
      return true;

    default:
      break;
  }
});

// ─── Main Analysis Flow ───────────────────────────────────────────────────────

async function handleAnalysis({ titleSlug, code, language }, tab) {
  // 0. Notify side panel: loading state
  await setAnalysisState({ _status: 'loading', titleSlug, timestamp: Date.now() });

  // 1. Language guard
  if (!isLanguageSupported(language)) {
    const result = { _status: 'unsupported', titleSlug, language, timestamp: Date.now() };
    await setAnalysisState(result);
    return result;
  }

  // 2. Check local cache
  const cacheKey = `cache:${titleSlug}:${simpleHash(code)}`;
  let cached = await getCached(cacheKey);
  if (cached) {
    if (!cached.recommendations || cached.recommendations.length === 0) {
      cached.recommendations = await getRecommendations(
        titleSlug,
        [],
        cached.difficulty ?? '',
        6
      ).catch(() => []);
      await setCached(cacheKey, cached);
    }
    await setAnalysisState({ ...cached, _status: 'complete', _fromCache: true });
    return cached;
  }

  // 3. Fetch problem data from LeetCode GraphQL
  let problemData;
  try {
    problemData = await fetchProblemDataCached(titleSlug);
  } catch (err) {
    throw new Error(`Failed to load problem data: ${err.message}`);
  }

  // 4. Load user settings
  const settings = await getSettings();
  if (!settings.apiKey) {
    throw new Error('No API key configured. Open the extension popup to add your API key.');
  }

  // 5a. Run local agent tools — zero tokens, instant static analysis
  const hints = analyzeCode(code, language, problemData?.topicTags ?? []);
  console.log('[BG] Local analysis:', JSON.stringify(hints, null, 2));

  // 5b. Build short "confirm + format" prompt using pre-analyzed hints
  //     LLM reasoning drops from ~2,300 tokens → ~150 tokens
  const prompt = buildAnalysisPromptWithHints({ problemData, code, language, hints });

  // 5c. Call LLM with reduced reasoning budget
  let llmResult;
  try {
    llmResult = await callLLM(prompt, settings);
  } catch (err) {
    throw new Error(`AI call failed: ${err.message}`);
  }

  // Record and print structured token analysis log in background console
  const tokenStats = await recordAndLogTokenUsage({
    provider: settings.provider,
    model: settings.model,
    usage: llmResult.usage,
    titleSlug,
  }).catch(err => console.warn('[BG] Token logger error:', err));

  // 6. Parse JSON from LLM response
  console.log('[BG] Raw LLM response:', llmResult.text); // diagnostic — remove after fix
  const analysis = parseAnalysisResponse(llmResult.text);

  // 7. Get local recommendations (instant — reads bundled JSON files)
  const tags = problemData?.topicTags ?? [];
  const recommendations = await getRecommendations(
    titleSlug,
    tags,
    problemData?.difficulty ?? '',
    6
  ).catch(err => {
    console.warn('[BG] Recommendations error:', err);
    return [];
  });

  const result = {
    ...analysis,
    _status: 'complete',
    titleSlug,
    problemTitle: problemData?.title ?? titleSlug,
    difficulty: problemData?.difficulty ?? 'Unknown',
    language,
    code,
    exampleTestcases: problemData?.exampleTestcases ?? '',
    usage: llmResult.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    recommendations,
    timestamp: Date.now(),
  };

  // 7. Cache + store + history
  await Promise.all([
    setCached(cacheKey, result),
    setAnalysisState(result),
    appendHistory(result),
  ]);

  return result;
}

// ─── Cache Clear Helper ────────────────────────────────────────────────────────

/**
 * Removes all cache entries for a given titleSlug from chrome.storage.local.
 * Cache keys have the pattern: cache:{titleSlug}:{hash}
 */
async function clearProblemCache(titleSlug) {
  if (!titleSlug) return 0;
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(null, (allItems) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      const prefix = `cache:${titleSlug}:`;
      const keysToRemove = Object.keys(allItems).filter(k => k.startsWith(prefix));
      if (keysToRemove.length === 0) return resolve(0);
      chrome.storage.local.remove(keysToRemove, () => {
        console.log(`[BG] Cleared ${keysToRemove.length} cache entries for "${titleSlug}"`);
        resolve(keysToRemove.length);
      });
    });
  });
}



// ─── Problem Data Pre-fetcher ─────────────────────────────────────────────────

const PROBLEM_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const _problemCache = new Map(); // titleSlug → { data, fetchedAt }

/** Fire-and-forget: warms cache on page load, eliminating GraphQL from hot path. */
async function prefetchProblemData(titleSlug) {
  if (_problemCache.has(titleSlug)) return;
  try {
    const data = await fetchProblemData(titleSlug);
    _problemCache.set(titleSlug, { data, fetchedAt: Date.now() });
    console.log(`[BG] Pre-fetched: ${titleSlug}`);
  } catch (err) {
    console.warn(`[BG] Pre-fetch failed for ${titleSlug}:`, err.message);
  }
}

/** Returns cached problem data if fresh, otherwise fetches. */
async function fetchProblemDataCached(titleSlug) {
  const cached = _problemCache.get(titleSlug);
  if (cached && Date.now() - cached.fetchedAt < PROBLEM_CACHE_TTL) return cached.data;
  const data = await fetchProblemData(titleSlug);
  _problemCache.set(titleSlug, { data, fetchedAt: Date.now() });
  return data;
}

// ─── LeetCode GraphQL ─────────────────────────────────────────────────────────

async function fetchProblemData(titleSlug) {
  const query = `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        title
        difficulty
        content
        topicTags { name slug }
        stats
        exampleTestcases
      }
    }
  `;

  const resp = await fetch(LEETCODE_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: `https://leetcode.com/problems/${titleSlug}/`,
    },
    body: JSON.stringify({
      operationName: 'questionData',
      variables: { titleSlug },
      query,
    }),
    credentials: 'include', // User's session cookie is sent automatically
  });

  if (!resp.ok) throw new Error(`GraphQL HTTP error ${resp.status}`);
  const json = await resp.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? 'GraphQL error');
  return json.data?.question ?? null;
}

// ─── LLM Callers ─────────────────────────────────────────────────────────────

async function callLLM(prompt, settings) {
  if (settings.provider === 'openrouter') {
    return callOpenRouter(prompt, settings);
  } else if (settings.provider === 'nvidia') {
    return callNvidia(prompt, settings);
  } else if (settings.provider === 'openai') {
    return callOpenAI(prompt, settings);
  } else if (settings.provider === 'gemini') {
    return callGemini(prompt, settings);
  }
  throw new Error(`Unknown provider: ${settings.provider}`);
}

/**
 * OpenRouter API — OpenAI-compatible endpoint routing to many models.
 * Docs: https://openrouter.ai/docs
 */
async function callOpenRouter(prompt, { apiKey, model }) {
  if (!apiKey) {
    throw new Error('OpenRouter API key required. Please enter your API key in extension settings.');
  }
  const effectiveModel = model || 'dots-studio/dots-3-note-preview:free';

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/swapnil0076/AI-Problem-Analyser',
      'X-Title': 'LeetCode AI Analyzer',
    },
    body: JSON.stringify({
      model: effectiveModel,
      messages: [
        { role: 'user', content: prompt },
      ],
      max_tokens: 2000,  // This model reasons heavily in content before JSON — needs room
      response_format: { type: 'json_object' }, // Force direct JSON output, no preamble
      // Note: do NOT set reasoning.max_tokens — it shares the pool with content and starves output
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const msg = err.error?.message ?? `OpenRouter HTTP ${resp.status}`;
    throw new Error(msg);
  }

  const data = await resp.json();
  console.log('[BG] Full API response:', JSON.stringify({
    finish_reason: data.choices?.[0]?.finish_reason,
    content: data.choices?.[0]?.message?.content,
    usage: data.usage,
  }));

  // Some reasoning models return empty content with text in reasoning_details
  const message = data.choices?.[0]?.message ?? {};
  const text =
    (message.content && message.content.trim())
      ? message.content.trim()
      : (message.reasoning_details?.[0]?.text?.trim() ?? '');

  const finishReason = data.choices?.[0]?.finish_reason;
  if (finishReason && finishReason !== 'stop') {
    console.warn(`[BG] finish_reason: "${finishReason}" — response may be truncated`);
  }
  const usage = {
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    totalTokens: data.usage?.total_tokens ?? 0,
  };
  return { text, usage };
}

/**
 * NVIDIA Integrate API — OpenAI-compatible endpoint hosting high-parameter models.
 * Base URL: https://integrate.api.nvidia.com/v1/chat/completions
 */
async function callNvidia(prompt, { apiKey, model }) {
  if (!apiKey) {
    throw new Error('NVIDIA API key required. Please enter your API key in extension settings.');
  }
  const primaryModel = (model && model !== 'google/gemma-4-31b-it') ? model : 'meta/llama-3.3-70b-instruct';
  const fallbackModel = 'meta/llama-3.1-70b-instruct';

  async function makeRequest(targetModel) {
    const resp = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content:
              'You are an expert algorithm analyst. Always respond with valid JSON only — no markdown, no extra text.',
          },
          { role: 'user', content: prompt },
        ],
        model: targetModel,
        max_tokens: 4096,
        temperature: 0.2,
        top_p: 0.95,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      const msg = err.detail ?? err.message ?? `NVIDIA HTTP ${resp.status}`;
      throw new Error(msg);
    }

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    const usage = {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    };
    return { text, usage };
  }

  try {
    return await makeRequest(primaryModel);
  } catch (err) {
    // If auth failed, don't retry fallback
    if (err.message.includes('401') || err.message.includes('403') || err.message.includes('key')) {
      throw err;
    }
    // Retry with fallback model if primary model endpoint fails
    if (primaryModel !== fallbackModel) {
      console.warn(`[BG] Primary model ${primaryModel} failed (${err.message}). Retrying with ${fallbackModel}...`);
      return await makeRequest(fallbackModel);
    }
    throw err;
  }
}


async function callOpenAI(prompt, { apiKey, model }) {
  const effectiveModel = model || 'gpt-4o-mini';
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: effectiveModel,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert algorithm analyst. Always respond with valid JSON only — no markdown, no extra text.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2, // Low temp for more deterministic complexity analysis
      max_tokens: 1200,
      response_format: { type: 'json_object' }, // Structured output (GPT-4o+)
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message ?? `OpenAI HTTP ${resp.status}`);
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  const usage = {
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    totalTokens: data.usage?.total_tokens ?? 0,
  };
  return { text, usage };
}

async function callGemini(prompt, { apiKey, model }) {
  const effectiveModel = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${effectiveModel}:generateContent?key=${apiKey}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1200,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message ?? `Gemini HTTP ${resp.status}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const meta = data.usageMetadata ?? {};
  const usage = {
    promptTokens: meta.promptTokenCount ?? 0,
    completionTokens: meta.candidatesTokenCount ?? 0,
    totalTokens: meta.totalTokenCount ?? ((meta.promptTokenCount ?? 0) + (meta.candidatesTokenCount ?? 0)),
  };
  return { text, usage };
}

// ─── Response Parser ──────────────────────────────────────────────────────────

function parseAnalysisResponse(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Empty response from AI. Try again.');
  }

  // Strip markdown code fences the model sometimes wraps JSON in
  let text = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  // Attempt 1: direct parse
  try {
    const parsed = JSON.parse(text);
    if (parsed.approach && parsed.timeComplexity && parsed.spaceComplexity) return parsed;
  } catch (_) { }

  // Attempt 2: extract the outermost {...} block (handles leading/trailing text)
  const brace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (brace !== -1 && lastBrace !== -1 && lastBrace > brace) {
    try {
      const slice = text.slice(brace, lastBrace + 1);
      const parsed = JSON.parse(slice);
      if (parsed.approach && parsed.timeComplexity && parsed.spaceComplexity) return parsed;
    } catch (_) { }
  }

  // Attempt 3: repair truncated JSON — find last complete field and close the object
  if (brace !== -1) {
    try {
      let partial = text.slice(brace);
      // Remove trailing incomplete key/value (last comma or unclosed string)
      partial = partial
        .replace(/,\s*"[^"]*"?\s*:\s*[^,}\]]*$/, '') // trailing incomplete key:value
        .replace(/,\s*$/, '')                          // trailing comma
        .replace(/"[^"]*$/, '')                        // unclosed string
        .trim();

      // Close any unclosed brackets/braces
      const opens = (partial.match(/\[/g) ?? []).length - (partial.match(/\]/g) ?? []).length;
      const braces = (partial.match(/\{/g) ?? []).length - (partial.match(/\}/g) ?? []).length;
      partial += ']'.repeat(Math.max(0, opens)) + '}'.repeat(Math.max(0, braces));

      const parsed = JSON.parse(partial);
      if (parsed.approach) {
        // Fill any missing required fields with safe defaults
        parsed.timeComplexity  ??= { notation: 'O(?)', explanation: 'Could not determine.' };
        parsed.spaceComplexity ??= { notation: 'O(?)', explanation: 'Could not determine.' };
        parsed.efficiencyRating ??= 5;
        parsed.suggestions     ??= [];
        parsed.confidence      ??= 'low';
        parsed.optimalComplexity ??= { time: 'O(?)', space: 'O(?)' };
        console.warn('[BG] Repaired truncated JSON response');
        return parsed;
      }
    } catch (_) { }
  }

  // All attempts failed — log raw for debugging
  console.error('[BG] Could not parse AI response. Raw output:\n', raw);
  throw new Error('Could not parse AI response. Try again.');
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(
      { apiKey: '', provider: 'openrouter', model: 'dots-studio/dots-3-note-preview:free' },
      settings => {
        // Migrate stale invalid model strings
        const validModels = [
          'dots-studio/dots-3-note-preview:free',
          'google/gemma-4-26b-a4b-it:free',
          'liquid/lfm-2.5-2.6b:free',
          'nvidia/nemotron-3.5-lightning:free',
        ];
        if (!settings.model || !validModels.includes(settings.model)) {
          settings.model = 'dots-studio/dots-3-note-preview:free';
          chrome.storage.local.set({ model: settings.model });
        }
        // Ensure provider is always openrouter
        settings.provider = 'openrouter';
        resolve(settings);
      }
    );
  });
}

async function setAnalysisState(data) {
  return new Promise(resolve =>
    chrome.storage.local.set({ latestAnalysis: data }, resolve)
  );
}

async function getCached(key) {
  return new Promise(resolve => {
    chrome.storage.local.get([key], result => {
      const entry = result[key];
      if (!entry) return resolve(null);
      if (Date.now() - entry.timestamp > CACHE_TTL_MS) return resolve(null);
      resolve(entry);
    });
  });
}

async function setCached(key, data) {
  return new Promise(resolve =>
    chrome.storage.local.set({ [key]: data }, resolve)
  );
}

async function appendHistory(entry) {
  return new Promise(resolve => {
    chrome.storage.local.get({ analysisHistory: [] }, ({ analysisHistory }) => {
      const slim = {
        titleSlug: entry.titleSlug,
        problemTitle: entry.problemTitle,
        difficulty: entry.difficulty,
        language: entry.language,
        approach: entry.approach?.name,
        timeComplexity: entry.timeComplexity?.notation,
        spaceComplexity: entry.spaceComplexity?.notation,
        efficiencyRating: entry.efficiencyRating,
        usage: entry.usage,
        timestamp: entry.timestamp,
      };
      const updated = [slim, ...analysisHistory].slice(0, MAX_HISTORY);
      chrome.storage.local.set({ analysisHistory: updated }, resolve);
    });
  });
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
