# LeetCode AI Problem Analyser — Chrome Extension

A high-performance Chrome extension that reads your LeetCode solution directly from the Monaco editor, performs **instant local static analysis via agent tools**, calls AI with pre-analyzed hints to save **~8–10x tokens**, and renders a comprehensive analysis in a sleek dark-themed side panel.

Includes **algorithmic approach detection**, **Big-O time/space complexity**, **interactive 2D Dry Run Flowchart diagrams**, **efficiency ratings**, **improvement suggestions**, and **practice problem recommendations**.

---

## ✨ Features & Capabilities

| Feature | Description |
|---------|-------------|
| 🔀 **2D Dry Run Flowcharts** | Interactive SVG flowchart rendered directly in the side panel with process boxes, decision diamonds, Yes/No branch paths, and loop-back cycles. |
| 🪟 **Standalone Popup Window** | Click `⛶` to open a full-sized **960 × 780 px dedicated window** on your screen with interactive zoom (`+`, `−`, `⟲ Reset`) and execution trace steps. |
| 🧠 **Local Static Agent Tools** | Built-in zero-cost analyzers (`codeAnalyzer.js`) pre-compute patterns, loop depths, and data structures in **~1ms before the LLM call**. |
| 🏷️ **8–10x Token Reduction** | Uses a "verify, don't discover" prompt architecture with local hints, cutting token usage from **~3,000+ tokens down to ~350–450 tokens/call**. |
| 🎯 **Approach & Pattern Detection** | Identifies 12+ algorithmic paradigms (Hash Map, Two Pointers, Binary Search, Sliding Window, DP, BFS/DFS, Fast/Slow Pointers, etc.). |
| ⏱ **Time & Space Complexity** | Precise Big-O notations with concise line-by-line justification. |
| 📊 **Efficiency Score & Rating** | 1–10 visual efficiency gauge with animated rating bar. |
| 💡 **Actionable Suggestions** | 2–3 concrete tips for code optimization and edge case handling. |
| 🔗 **Local Recommendations** | Instant offline problem suggestions from a bundled database of 3,240+ LeetCode problems (zero API cost). |
| ⚡ **Pre-fetch Engine** | Problem metadata fetched silently on page load so analysis is instant when you click Analyze. |

---

## 🔀 Dry Run Flowchart & Visual Trace

The extension includes a built-in **Algorithmic Flowchart Generator** (`src/utils/flowchartGenerator.js`):

```
                  ┌─────────────────────────────────────┐
                  │ Loop through nums, using index i    │
                  └─────────┬─────────────────┬─────────┘
                            │                 │ (Loop finishes)
             ┌──────────────┴──────────┐      ▼
             ▼                         │   ┌────────────────────────────────┐
┌───────────────────────────────┐      │   │ (Implicit: No solution found)  │
│ Calculate complement = ...    │      │   └────────────────────────────────┘
└────────────┬──────────────────┘      │
             ▼                         │
            ╱ ╲                        │
           ╱   ╲                       │
          │ Check complement in map?   │
           ╲   ╱                       │
            ╲ ╱                        │
             │                         │
      [Yes]  │               [No]      │
             ▼                         ▼
┌───────────────────────────────┐    ┌──────────────────────────────────┐
│ Return [map[complement], i]   │    │ Add nums[i] and i to number_map  │
└───────────────────────────────┘    └────────────────┬─────────────────┘
                                                      │
                                                      └─────── (Loop back) ───► (Loop top)
```

- **In-Panel View**: Embedded directly below the Approach card with a shimmer skeleton loading state.
- **Interactive Trace Steps**: Numbered execution pills below the diagram. Hovering over any step highlights its corresponding node on the flowchart!
- **Standalone Screen Window**: Clicking `⛶` expands the diagram into a standalone popup window with zoom controls (`50%` to `250%`).

---

## 🧠 Local Agent Tools Architecture (Token Economics)

Instead of relying solely on expensive external LLM reasoning tokens, the extension uses a **fixed local agent pipeline**:

```
User Code on LeetCode
         ↓
1. Local Agent Tools (src/utils/codeAnalyzer.js)  ───► [0 tokens, ~1ms]
   ├── detectPattern(): 12+ pattern regex rules + tag analysis
   ├── estimateComplexity(): AST loop nesting counter, recursion & memo detection
   └── detectDataStructures(): Scans for Maps, Sets, Queues, Heaps, Trees, etc.
         ↓
2. Hints Prompt Builder (src/utils/prompt.js)    ───► Injects pre-analyzed facts
   └── "Local analysis: Two Pointers, O(n). Confirm and fill JSON."
         ↓
3. LLM API Call (src/background/background.js)   ───► ~150 reasoning tokens
   └── OpenRouter / OpenAI / Gemini / NVIDIA (response_format: json_object)
         ↓
4. Flowchart Engine + UI Renderer               ───► Sidepanel & Popup Window
```

### Token Savings Comparison

| Phase | Naive Approach | Local Agent Pipeline |
|---|---|---|
| Prompt Overhead | ~800 tokens | **~250 tokens** |
| Reasoning Chain | ~2,300 tokens | **~100–150 tokens** |
| JSON Output | ~300 tokens | **~150 tokens** |
| **Total per Analysis** | **~3,400 tokens** | **~350–450 tokens (~8–10x savings!)** |

---

## 🤖 Supported AI Providers & Free Models

Configure your provider and API key directly in the extension popup:

| Provider | Supported Models | Pricing |
|----------|-----------------|---------|
| **OpenRouter** (Default) | `DoTS-3 Note Preview`, `Google Gemma 4 26B`, `LiquidAI LFM 2.5`, `NVIDIA Nemotron 3.5` | **Free tier available** (`:free`) |
| **NVIDIA Integrate** | `Gemma 4 31B`, `Llama 3.1 405B`, `Nemotron 4 340B` | Fast inference |
| **OpenAI** | `GPT-4o Mini`, `GPT-4o`, `GPT-4 Turbo` | Pay-as-you-go |
| **Google Gemini** | `Gemini 1.5 Flash`, `Gemini 2.0 Flash`, `Gemini 1.5 Pro` | Generous free tier |

---

## 📂 Project Structure

```
Extension/
├── manifest.json                     # Manifest V3 (Side Panel, Storage, Scripting)
├── README.md                         # Documentation & Architecture Guide
├── dryrun/                           # Dedicated Standalone Flowchart Popup Window
│   ├── dryrun.html                   # Full-screen Flowchart Viewer
│   ├── dryrun.css                    # Dark theme, canvas layout & zoom controls
│   └── dryrun.js                     # Storage listener, zoom & node highlight logic
├── sidepanel/                        # Chrome Side Panel UI
│   ├── sidepanel.html                # Approach, Flowchart, Complexity, Suggestions, Recs
│   ├── sidepanel.css                 # Dark theme styling, glassmorphism & responsive layouts
│   └── sidepanel.js                  # UI controller & SVG flowchart initiator
├── popup/                            # Extension Popup (Settings & History)
│   ├── popup.html                    # Model selection, API key & Token Stats
│   ├── popup.css                     # Modal & form styling
│   └── popup.js                      # Storage persistence & key management
├── src/
│   ├── background/
│   │   └── background.js             # Service Worker: GraphQL, Agent Tools & LLM caller
│   ├── content/
│   │   ├── content.js                # Floating "AI Analyze" button & prefetch trigger
│   │   └── bridge.js                 # Monaco Editor code extractor (injected)
│   └── utils/
│       ├── codeAnalyzer.js           # 🛠️ Local Agent Tools (Pattern, Complexity, DS)
│       ├── flowchartGenerator.js     # 🔀 2D Branching SVG Flowchart Generator
│       ├── prompt.js                 # 📝 Hints-based prompt builder (JSON-first)
│       ├── recommendations.js        # 🔗 Local offline problem matcher
│       └── tokenLogger.js            # 📊 Detailed token & cost metrics logger
└── data/                             # Pre-scraped offline database (3,240+ problems)
    ├── index.json                    # Slug index
    ├── by-difficulty/                # easy.json, medium.json, hard.json
    └── by-tag/                       # 139 indexed category files
```

---

## 🚀 Getting Started

### 1. Get a Free API Key
- Get an OpenRouter key at [openrouter.ai/keys](https://openrouter.ai/keys) *(free models included)*
- Or get an API key from [Google AI Studio](https://aistudio.google.com/), [OpenAI](https://platform.openai.com/), or [NVIDIA Build](https://build.nvidia.com/).

### 2. Install the Extension in Chrome
1. Clone this repository or download the folder:
   ```bash
   git clone https://github.com/swapnil0076/AI-Problem-Analyser.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the `Extension/` directory.
5. Pin the extension to your Chrome toolbar.

### 3. Save Your Settings
1. Click the extension icon in your toolbar.
2. Select your preferred provider (e.g. **OpenRouter**) and model.
3. Paste your API key and click **Save Settings**.

### 4. Analyze Any Problem
1. Navigate to any LeetCode problem (e.g. [leetcode.com/problems/two-sum](https://leetcode.com/problems/two-sum/)).
2. Write your solution code in the editor.
3. Click the floating **AI Analyze** button in the bottom right corner.
4. The side panel will open with your full analysis, Big-O breakdown, and 2D flowchart diagram!
5. Click `⛶` to expand the diagram into a standalone window on your screen.

---

## 🔒 Privacy & Security

- **Local-First Processing**: Code analysis heuristics and problem recommendations run 100% locally on your machine.
- **Secure Key Storage**: API keys are stored solely in `chrome.storage.local` on your browser and are never transmitted to any third-party server.
- **Direct Requests**: AI queries are dispatched directly from your browser's service worker to your chosen AI provider endpoint.

---

## 📄 License

MIT License © 2026 Swapnil.
