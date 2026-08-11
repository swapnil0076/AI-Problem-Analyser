# LeetCode AI Analyzer — Chrome Extension

A Chrome extension that reads your LeetCode solution, sends it to an AI (InferX/DeepSeek, OpenAI, or Gemini), and returns analysis in a clean side panel — including **approach identification, time/space complexity, efficiency rating, improvement suggestions, and recommended next problems**.

---

## Features

| Feature | Detail |
|---------|--------|
| 🎯 **Approach Detection** | Identifies algorithmic pattern (two pointers, DP, BFS, etc.) |
| ⏱ **Time Complexity** | Big-O with line-by-line justification |
| 📦 **Space Complexity** | Auxiliary space + call stack analysis |
| 📊 **Efficiency Rating** | 1–10 score with gradient bar |
| 💡 **Suggestions** | 2–3 specific, actionable improvements |
| 🔗 **Recommended Problems** | 6 similar problems from local DB (instant, no API call) |
| ⚡ **Pre-fetch** | Problem data fetched on page load — not on Analyze click |
| 🔷 **InferX / DeepSeek** | Default provider — fast, cheap DeepSeek V4 Flash |

---

## Project Structure

```
Extension/
├── manifest.json                  # MV3, Side Panel API, permissions
├── README.md
├── scripts/
│   └── scrape-leetcode.js         # One-time scraper (already run — don't re-run)
├── data/                          # Pre-scraped problem database (3240 free problems)
│   ├── meta.json                  # Stats: total, tag list, scrape date
│   ├── all-problems.json          # Full flat list
│   ├── index.json                 # { titleSlug → { title, difficulty, acRate, tags } }
│   ├── by-difficulty/
│   │   ├── easy.json              # 828 problems
│   │   ├── medium.json            # 1736 problems
│   │   └── hard.json              # 676 problems
│   └── by-tag/
│       ├── array.json             # 1099 problems
│       ├── dynamic-programming.json
│       ├── hash-table.json
│       └── ... (139 tag files total)
├── icons/
│   ├── icon16.png, icon48.png, icon128.png
├── src/
│   ├── content/
│   │   ├── content.js             # Floating Analyze button, pre-fetch on load, SPA detection
│   │   └── bridge.js              # Monaco editor API reader (page context)
│   ├── background/
│   │   └── background.js          # Service worker: GraphQL, LLM calls, recommendations
│   └── utils/
│       ├── prompt.js              # Compact chain-of-thought prompt builder
│       └── recommendations.js     # Local problem DB reader + scoring engine
├── sidepanel/
│   ├── sidepanel.html             # 5 UI states + recommendations card
│   ├── sidepanel.css              # Premium dark theme, glassmorphism
│   └── sidepanel.js               # storage.onChanged driven renderer
└── popup/
    ├── popup.html                 # Settings + History tabs
    ├── popup.css
    └── popup.js                   # Provider/model/API key management
```

---

## Setup

### 1. Get an API Key

| Provider | Where to get key | Key format |
|----------|-----------------|------------|
| **InferX** (default) | https://inferx.net | `ix_...` |
| OpenAI | https://platform.openai.com/api-keys | `sk-...` |
| Gemini | https://aistudio.google.com/app/apikey | `AIza...` |

### 2. Load the Extension in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `Extension/` folder
4. Pin the extension to your toolbar

### 3. Configure Your API Key

1. Click the extension icon in your toolbar
2. **InferX** is pre-selected (fastest, cheapest)
3. Paste your API key → **Save Settings**

### 4. Use It

1. Navigate to any LeetCode problem (e.g. `leetcode.com/problems/two-sum`)
2. Write your solution in the editor
3. Click the **AI Analyze** button (purple gradient, bottom-right)
4. The side panel opens automatically with full analysis + recommended problems

---

## How It Works — Speed Optimizations

```
Page loads → content.js fires PREFETCH_PROBLEM immediately
                    ↓
            background.js fetches LeetCode GraphQL (~400ms)
                    ↓ (cached in memory)

User clicks Analyze → code read from Monaco API (bridge.js)
                    ↓
            background.js finds cached problem data (skips GraphQL!)
                    ↓
            Compact prompt sent to InferX/OpenAI/Gemini
                    ↓
            Recommendations read from local data/ (instant, no API)
                    ↓
            Results stored → sidepanel.js renders via storage.onChanged
```

**Why fast:**
- **Pre-fetch**: GraphQL is removed from the critical path (runs silently on page load)
- **Compact prompt**: ~40% shorter than naive approach → faster time-to-first-token
- **Local recommendations**: 139 tag-indexed JSON files bundled with extension, zero latency
- **24h analysis cache**: same code → instant result (⚡ cached badge shown)
- **429 retry**: exponential backoff (1s → 2s → 4s) with `Retry-After` header respect

---

## Architecture

```
leetcode.com/problems/<slug>
        │
        ├── content.js (injected)   → floating button + pre-fetch signal
        └── bridge.js (page ctx)    → reads window.monaco editor
                │ postMessage
                ↓
        content.js → chrome.runtime.sendMessage
                │
                ↓
        background.js (service worker)
                ├── Memory cache: problem data (1h TTL)
                ├── LeetCode /graphql → problem title, tags, difficulty
                ├── InferX / OpenAI / Gemini → LLM analysis
                ├── data/by-tag/*.json → recommendations (local, instant)
                ├── chrome.storage.local → 24h analysis cache + history
                └── latestAnalysis storage → triggers sidepanel render
                │
                ↓
        sidepanel.js (storage.onChanged listener)
                └── renders 5 states: empty / loading / error / unsupported / results
```

---

## Problem Database

Scraped once from LeetCode's public GraphQL API using `scripts/scrape-leetcode.js`.

| Stat | Value |
|------|-------|
| Total problems | 4018 |
| Free problems | **3240** |
| Paid-only | 778 |
| Tag categories | **139** |
| Easy | 828 |
| Medium | 1736 |
| Hard | 676 |
| Last scraped | August 2026 |

> **To refresh the database** (e.g. LeetCode adds new problems):
> ```bash
> node scripts/scrape-leetcode.js
> git add data/
> git commit -m "chore: refresh problem database"
> git push
> ```

---

## Models Supported

| Provider | Models | Notes |
|----------|--------|-------|
| **InferX** | DeepSeek V4 Flash ⭐, DeepSeek V3 | Default — fast + cheap |
| OpenAI | GPT-4o Mini, GPT-4o, GPT-4 Turbo | Reliable JSON output |
| Gemini | Gemini 1.5 Flash, 1.5 Pro, 2.0 Flash | Good for long problems |

---

## Token Usage & Efficiency (System Token Logger)

The extension includes a structured **Token Logger System** (`src/utils/tokenLogger.js`) that tracks per-call token breakdown, calculates exact model costs, maintains cumulative stats in local storage, and logs color-coded metrics to the Chrome DevTools console.

### Average Token Breakdown

| Metric | Average Tokens | Details |
|--------|---------------|---------|
| **Prompt Input (In)** | **300 – 400 tokens** | System prompt, 800-char sliced problem statement, solution code, schema |
| **Output Response (Out)** | **120 – 180 tokens** | JSON response: approach, TC, SC, rating, 2 suggestions, optimal complexity |
| **Total per Analysis** | **~450 – 550 tokens** | **Average total tokens consumed per analysis call** |

### Estimated Cost per 1,000 Analyses

| Provider | Model | Est. Cost / 1k Analyses | Analyses per $1.00 |
|----------|-------|-------------------------|-------------------|
| **InferX** | DeepSeek V4 Flash | ~$0.07 | **~14,000 analyses** |
| **OpenAI** | GPT-4o Mini | ~$0.10 | **~10,000 analyses** |
| **Google** | Gemini 1.5 Flash | ~$0.08 | **~12,500 analyses** |

### DevTools Background Console Output
Whenever an analysis is triggered, `tokenLogger.js` prints a formatted log in the extension service worker console:
```text
📊 [Token Logger] two-sum — 470 tokens ($0.00003)
  Problem:          two-sum
  Provider / Model: inferx (deepseek-v4-flash)
  Input (Prompt):    320 tokens
  Output (Response): 150 tokens
  Total Analysis:    470 tokens
  Estimated Cost:    $0.00003
  Cumulative Total:  1,410 tokens across 3 calls (Avg: 470 tokens/call, Est. Total: $0.00010)
```

---

## Recommendation Engine

Located in `src/utils/recommendations.js`. Scoring algorithm:

```
For each candidate problem in the same tags:
  score += 1 per shared tag
  score += 2 if difficulty matches current problem

Sort by score DESC, then acceptance rate DESC
Return top 6 results
```

Problems are read from bundled `data/by-tag/<tag>.json` files — **zero network calls, instant results**.

---

## Limitations

- SQL, Shell, and Bash problems show an "Unsupported" message
- Requires **Chrome 114+** for the Side Panel API
- LLM Big-O analysis can be wrong for complex recursive/DP solutions — always verify
- Problem database reflects LeetCode's state at last scrape date (see `data/meta.json`)

---

## Privacy

- Your API key is stored in `chrome.storage.local` only — never sent anywhere except your chosen AI provider
- Problem data is fetched from LeetCode's own API (same as their UI)
- No telemetry, no tracking, no backend server
