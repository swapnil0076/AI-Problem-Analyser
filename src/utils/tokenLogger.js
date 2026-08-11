/**
 * tokenLogger.js — Structured Token Analysis & Cost Logging System.
 *
 * Tracks, logs, and calculates exact token consumption and estimated API cost
 * for every analysis call, maintaining cumulative stats in chrome.storage.local.
 */

// Model pricing per 1,000,000 tokens (USD)
const PRICING = {
  // NVIDIA Integrate API
  'google/gemma-4-31b-it':          { input: 0.20, output: 0.40 },
  'meta/llama-3.1-405b-instruct':    { input: 1.00, output: 1.00 },
  'nvidia/nemotron-4-340b-instruct': { input: 0.50, output: 1.00 },

  // InferX / DeepSeek
  'deepseek-v4-flash': { input: 0.14, output: 0.28 },
  'deepseek-v3':       { input: 0.27, output: 1.10 },

  // OpenAI
  'gpt-4o-mini':       { input: 0.15, output: 0.60 },
  'gpt-4o':            { input: 2.50, output: 10.00 },
  'gpt-4-turbo':       { input: 10.00, output: 30.00 },

  // Gemini
  'gemini-1.5-flash':  { input: 0.075, output: 0.30 },
  'gemini-1.5-pro':    { input: 1.25,  output: 5.00 },
  'gemini-2.0-flash':  { input: 0.10,  output: 0.40 },
};

/**
 * Calculate estimated cost in USD for a given model & token count.
 */
export function calculateCost(model, promptTokens, completionTokens) {
  const rates = PRICING[model] ?? PRICING['deepseek-v4-flash'];
  const inputCost  = (promptTokens / 1_000_000) * rates.input;
  const outputCost = (completionTokens / 1_000_000) * rates.output;
  return inputCost + outputCost;
}

/**
 * Record token usage to chrome.storage.local and output a rich DevTools log.
 */
export async function recordAndLogTokenUsage({ provider, model, usage, titleSlug }) {
  const promptTokens     = usage?.promptTokens     ?? 0;
  const completionTokens = usage?.completionTokens ?? 0;
  const totalTokens      = usage?.totalTokens      ?? (promptTokens + completionTokens);
  const cost = calculateCost(model, promptTokens, completionTokens);

  // Read existing cumulative stats
  const stats = await getTokenStats();

  const newTotalTokens   = stats.totalTokens + totalTokens;
  const newTotalAnalyses = stats.totalAnalyses + 1;
  const newAvgTokens     = Math.round(newTotalTokens / newTotalAnalyses);
  const newTotalCost     = stats.totalCost + cost;

  const updatedStats = {
    totalTokens:   newTotalTokens,
    totalAnalyses: newTotalAnalyses,
    avgTokens:     newAvgTokens,
    totalCost:     newTotalCost,
    lastAnalysis: {
      titleSlug,
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      cost,
      timestamp: Date.now(),
    },
  };

  // Save to local storage
  await new Promise(resolve => chrome.storage.local.set({ tokenLoggerStats: updatedStats }, resolve));

  // Console output for Developer Tools background worker
  printDevToolsLog({
    titleSlug,
    provider,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    cost,
    stats: updatedStats,
  });

  return updatedStats;
}

/**
 * Read cumulative token stats from chrome.storage.local.
 */
export async function getTokenStats() {
  return new Promise(resolve => {
    chrome.storage.local.get({
      tokenLoggerStats: {
        totalTokens: 0,
        totalAnalyses: 0,
        avgTokens: 0,
        totalCost: 0,
        lastAnalysis: null,
      },
    }, ({ tokenLoggerStats }) => resolve(tokenLoggerStats));
  });
}

/**
 * Reset cumulative token statistics.
 */
export async function clearTokenStats() {
  return new Promise(resolve => {
    chrome.storage.local.remove('tokenLoggerStats', resolve);
  });
}

/**
 * Print formatted, color-coded token analysis log in background console.
 */
function printDevToolsLog({ titleSlug, provider, model, promptTokens, completionTokens, totalTokens, cost, stats }) {
  const formattedCost     = cost < 0.0001 ? '< $0.0001' : `$${cost.toFixed(5)}`;
  const formattedTotalCost = stats.totalCost < 0.0001 ? '< $0.0001' : `$${stats.totalCost.toFixed(5)}`;

  console.groupCollapsed(
    `%c📊 [Token Logger] ${titleSlug} — ${totalTokens} tokens (${formattedCost})`,
    'color: #a78bfa; font-weight: bold; font-size: 12px;'
  );

  console.log(`%cProblem:          %c${titleSlug}`, 'color: #8b949e', 'color: #e6edf3; font-weight: 600;');
  console.log(`%cProvider / Model:  %c${provider} (${model})`, 'color: #8b949e', 'color: #60a5fa;');
  console.log('─'.repeat(45));
  console.log(`%cInput (Prompt):    %c${promptTokens} tokens`, 'color: #8b949e', 'color: #3b82f6;');
  console.log(`%cOutput (Response): %c${completionTokens} tokens`, 'color: #8b949e', 'color: #10b981;');
  console.log(`%cTotal Analysis:    %c${totalTokens} tokens`, 'color: #8b949e', 'color: #a78bfa; font-weight: bold;');
  console.log(`%cEstimated Cost:    %c${formattedCost}`, 'color: #8b949e', 'color: #f59e0b;');
  console.log('─'.repeat(45));
  console.log(
    `%cCumulative Total:  %c${stats.totalTokens.toLocaleString()} tokens across ${stats.totalAnalyses} calls (Avg: ${stats.avgTokens} tokens/call, Est. Total: ${formattedTotalCost})`,
    'color: #8b949e',
    'color: #e6edf3; font-style: italic;'
  );
  console.groupEnd();
}
