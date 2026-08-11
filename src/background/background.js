/**
 * background.js — Service Worker (Manifest V3, ES Module)
 *
 * Handles:
 * 1. Opening the Chrome Side Panel
 * 2. Fetching problem data from LeetCode's internal GraphQL API
 * 3. Calling OpenAI, Gemini, or InferX (DeepSeek) with the analysis prompt
 * 4. Caching results in chrome.storage.local
 * 5. Saving analysis history (last 20 entries)
 */

import { buildAnalysisPrompt, isLanguageSupported } from '../utils/prompt.js';
import { getRecommendations } from '../utils/recommendations.js';

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
  const cached = await getCached(cacheKey);
  if (cached) {
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

  // 5. Build prompt & call LLM
  const prompt = buildAnalysisPrompt({ problemData, code, language });
  let rawResponse;
  try {
    rawResponse = await callLLM(prompt, settings);
  } catch (err) {
    throw new Error(`AI call failed: ${err.message}`);
  }

  // 6. Parse JSON from LLM response
  const analysis = parseAnalysisResponse(rawResponse);

  // 7. Get local recommendations (instant — reads bundled JSON files)
  const tags = (problemData?.topicTags ?? []).map(t => t.slug);
  const recommendations = await getRecommendations(
    titleSlug,
    tags,
    problemData?.difficulty ?? '',
    6
  ).catch(() => []);

  const result = {
    ...analysis,
    _status: 'complete',
    titleSlug,
    problemTitle: problemData?.title ?? titleSlug,
    difficulty: problemData?.difficulty ?? 'Unknown',
    language,
    code,
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
        topicTags { name }
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
  if (settings.provider === 'openai') {
    return callOpenAI(prompt, settings);
  } else if (settings.provider === 'gemini') {
    return callGemini(prompt, settings);
  } else if (settings.provider === 'inferx') {
    return callInferX(prompt, settings);
  }
  throw new Error(`Unknown provider: ${settings.provider}`);
}

/**
 * InferX — OpenAI-compatible endpoint hosting DeepSeek models.
 * Base URL: https://model.inferx.net/endpoints/v1
 *
 * Includes exponential backoff for HTTP 429 (rate limit).
 * Respects the Retry-After header if present.
 */
async function callInferX(prompt, { apiKey, model }) {
  const effectiveModel = model || 'deepseek-v4-flash';
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1000; // 1s, 2s, 4s

  const body = JSON.stringify({
    model: effectiveModel,
    messages: [
      {
        role: 'system',
        content:
          'You are an expert algorithm analyst. Always respond with valid JSON only — no markdown, no extra text.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
  });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const resp = await fetch('https://model.inferx.net/endpoints/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });

    // Success
    if (resp.ok) {
      const data = await resp.json();
      return data.choices?.[0]?.message?.content ?? '';
    }

    // Rate limited — retry with backoff
    if (resp.status === 429 && attempt < MAX_RETRIES) {
      // Honour Retry-After header if server provides it (in seconds)
      const retryAfter = resp.headers.get('Retry-After');
      const waitMs = retryAfter
        ? Math.min(parseFloat(retryAfter) * 1000, 30_000) // cap at 30s
        : BASE_DELAY_MS * Math.pow(2, attempt);           // 1s, 2s, 4s

      console.warn(
        `[BG] InferX rate limited (attempt ${attempt + 1}/${MAX_RETRIES}). Retrying in ${waitMs}ms...`
      );
      await new Promise(res => setTimeout(res, waitMs));
      continue;
    }

    // Other error — surface immediately
    const err = await resp.json().catch(() => ({}));
    if (resp.status === 429) {
      throw new Error(
        'InferX rate limit reached. Please wait a moment and try again.'
      );
    }
    throw new Error(err.error?.message ?? `InferX HTTP ${resp.status}`);
  }

  // Exhausted all retries
  throw new Error('InferX rate limit reached after 3 retries. Please try again in a few seconds.');
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
  return data.choices?.[0]?.message?.content ?? '';
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
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ─── Response Parser ──────────────────────────────────────────────────────────

function parseAnalysisResponse(raw) {
  try {
    const parsed = JSON.parse(raw);
    // Validate required fields
    if (!parsed.approach || !parsed.timeComplexity || !parsed.spaceComplexity) {
      throw new Error('Incomplete response schema');
    }
    return parsed;
  } catch (e) {
    // Try to extract JSON from response if model added extra text
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (_) {}
    }
    throw new Error('Could not parse AI response. Try again.');
  }
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(
      { apiKey: '', provider: 'inferx', model: 'deepseek-v4-flash' },
      resolve
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
