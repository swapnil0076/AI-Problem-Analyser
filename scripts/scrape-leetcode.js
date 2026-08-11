/**
 * scrape-leetcode.js — One-time LeetCode problem database builder.
 *
 * Run: node scripts/scrape-leetcode.js
 *
 * Output files (written to data/):
 *   all-problems.json          — Full flat list of every free problem
 *   index.json                 — { titleSlug → { tags, difficulty, acRate } }
 *   by-difficulty/easy.json    — Problems filtered by difficulty
 *   by-difficulty/medium.json
 *   by-difficulty/hard.json
 *   by-tag/<tag-slug>.json     — Problems per topic tag (array.json, dp.json, etc.)
 *   meta.json                  — Stats: total count, scrape date, tag list
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = join(__dirname, '..', 'data');
const GRAPHQL    = 'https://leetcode.com/graphql';
const BATCH_SIZE = 100;
const DELAY_MS   = 600; // polite delay between batches

// ─── Fetch one batch ─────────────────────────────────────────────────────────

async function fetchBatch(skip) {
  const query = `
    query problemsetQuestionList($limit: Int, $skip: Int) {
      problemsetQuestionList: questionList(
        categorySlug: ""
        limit: $limit
        skip: $skip
        filters: {}
      ) {
        total: totalNum
        questions: data {
          acRate
          difficulty
          isPaidOnly
          title
          titleSlug
          topicTags { name slug }
        }
      }
    }
  `;

  const resp = await fetch(GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Referer':      'https://leetcode.com/problemset/',
      'User-Agent':   'Mozilla/5.0 (compatible; LeetCode-AI-Analyzer-Scraper/1.0)',
    },
    body: JSON.stringify({
      operationName: 'problemsetQuestionList',
      variables: { limit: BATCH_SIZE, skip },
      query,
    }),
  });

  if (!resp.ok) throw new Error(`GraphQL HTTP ${resp.status} at skip=${skip}`);
  const json = await resp.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? 'GraphQL error');
  return json.data?.problemsetQuestionList;
}

// ─── Delay helper ─────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 LeetCode Problem Scraper');
  console.log('─'.repeat(40));

  // ── Fetch first batch to get total count
  console.log('Fetching batch 1...');
  const first = await fetchBatch(0);
  const total = first.total;
  const allProblems = [...first.questions];

  console.log(`  Total problems on LeetCode: ${total}`);
  console.log(`  Fetched: ${allProblems.length}`);

  // ── Fetch remaining batches
  const batchCount = Math.ceil(total / BATCH_SIZE);
  for (let batch = 1; batch < batchCount; batch++) {
    const skip = batch * BATCH_SIZE;
    console.log(`Fetching batch ${batch + 1}/${batchCount} (skip=${skip})...`);
    await sleep(DELAY_MS);

    try {
      const result = await fetchBatch(skip);
      allProblems.push(...result.questions);
      console.log(`  Fetched: ${allProblems.length}/${total}`);
    } catch (err) {
      console.error(`  ⚠ Batch ${batch + 1} failed: ${err.message}. Retrying in 3s...`);
      await sleep(3000);
      const result = await fetchBatch(skip);
      allProblems.push(...result.questions);
    }
  }

  console.log(`\n✅ Fetched ${allProblems.length} total problems.`);

  // ── Normalize + filter
  const problems = allProblems.map(q => ({
    title:      q.title,
    slug:       q.titleSlug,
    difficulty: q.difficulty,          // "Easy" | "Medium" | "Hard"
    acRate:     Math.round(q.acRate * 10) / 10,
    isPaidOnly: q.isPaidOnly,
    tags:       q.topicTags.map(t => t.slug),
  }));

  // Free problems only (paid-only ones can't be visited without premium)
  const freeProblems = problems.filter(p => !p.isPaidOnly);
  console.log(`   Free problems: ${freeProblems.length}`);
  console.log(`   Paid-only:     ${problems.length - freeProblems.length}`);

  // ── Build structures

  // 1. Index: slug → { tags, difficulty, acRate, title }
  const index = {};
  for (const p of freeProblems) {
    index[p.slug] = {
      title:      p.title,
      difficulty: p.difficulty,
      acRate:     p.acRate,
      tags:       p.tags,
    };
  }

  // 2. By difficulty
  const byDiff = { Easy: [], Medium: [], Hard: [] };
  for (const p of freeProblems) {
    const slim = { title: p.title, slug: p.slug, acRate: p.acRate, tags: p.tags };
    byDiff[p.difficulty]?.push(slim);
  }

  // 3. By tag
  const byTag = {};
  for (const p of freeProblems) {
    for (const tag of p.tags) {
      if (!byTag[tag]) byTag[tag] = [];
      byTag[tag].push({ title: p.title, slug: p.slug, difficulty: p.difficulty, acRate: p.acRate });
    }
  }

  // Sort each tag list by acRate desc (most approachable first)
  for (const tag of Object.keys(byTag)) {
    byTag[tag].sort((a, b) => b.acRate - a.acRate);
  }

  // 4. Meta
  const tagList = Object.entries(byTag)
    .map(([slug, arr]) => ({ slug, count: arr.length }))
    .sort((a, b) => b.count - a.count);

  const meta = {
    scrapedAt:        new Date().toISOString(),
    totalProblems:    problems.length,
    freeProblems:     freeProblems.length,
    paidOnlyProblems: problems.length - freeProblems.length,
    byDifficulty: {
      Easy:   byDiff.Easy.length,
      Medium: byDiff.Medium.length,
      Hard:   byDiff.Hard.length,
    },
    tagCount:         tagList.length,
    topTags:          tagList.slice(0, 20),
  };

  // ── Write files
  console.log('\n📁 Writing data files...');

  const ensureDir = dir => { if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); };
  const write = (path, data) => {
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
    const kb = (JSON.stringify(data).length / 1024).toFixed(1);
    console.log(`   ✓ ${path.replace(DATA_DIR, 'data')}  (${kb} KB)`);
  };

  ensureDir(DATA_DIR);
  ensureDir(join(DATA_DIR, 'by-difficulty'));
  ensureDir(join(DATA_DIR, 'by-tag'));

  write(join(DATA_DIR, 'meta.json'),         meta);
  write(join(DATA_DIR, 'all-problems.json'), freeProblems);
  write(join(DATA_DIR, 'index.json'),        index);
  write(join(DATA_DIR, 'by-difficulty', 'easy.json'),   byDiff.Easy);
  write(join(DATA_DIR, 'by-difficulty', 'medium.json'), byDiff.Medium);
  write(join(DATA_DIR, 'by-difficulty', 'hard.json'),   byDiff.Hard);

  let tagFilesWritten = 0;
  for (const [tag, tagProblems] of Object.entries(byTag)) {
    if (tagProblems.length < 2) continue; // skip tags with only 1 problem
    write(join(DATA_DIR, 'by-tag', `${tag}.json`), tagProblems);
    tagFilesWritten++;
  }

  console.log(`\n🎉 Done!`);
  console.log(`   Tag files: ${tagFilesWritten}`);
  console.log(`   Total size: check data/ folder`);
  console.log('\nNext: commit the data/ folder to the repo.');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
