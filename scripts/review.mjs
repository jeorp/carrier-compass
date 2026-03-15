#!/usr/bin/env node
/**
 * 記事レビュースクリプト（ローカル・API不要）
 * Usage: node scripts/review.mjs src/content/blog/xxx.md
 *        node scripts/review.mjs --all
 */

import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');

function getArticles(articlePath) {
  if (articlePath === '--all') {
    const dir = path.join(root, 'src/content/blog');
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(dir, f));
  }
  return [path.resolve(articlePath)];
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w+):\s*(.+)/);
    if (m) fm[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  // tags配列をパース
  const tagsMatch = match[1].match(/^tags:\s*\[([^\]]+)\]/m);
  if (tagsMatch) {
    fm.tags = tagsMatch[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, ''));
  }
  const relatedMatch = match[1].match(/^related:\s*\[([^\]]+)\]/m);
  if (relatedMatch) {
    fm.related = relatedMatch[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, ''));
  }
  return fm;
}

function reviewArticle(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fm = parseFrontmatter(content);
  const body = content.replace(/^---[\s\S]*?---\n/, '');
  const lines = body.split('\n');
  const warnings = [];

  // ── 文体ルール ──────────────────────────────

  // 1. ですます混在チェック
  const masuEndings = lines.filter(l => /[ぁ-ん]+(ます|ません|ました|でした|ございます)。/.test(l));
  const plainEndings = lines.filter(l => /[ぁ-ん]+(だ|だった|だろう|思う|感じる|いる|ある|ない|くない)。/.test(l));
  if (masuEndings.length > 0 && plainEndings.length > 0) {
    warnings.push({
      level: 'ERROR',
      rule: 'ですます・普通体混在',
      detail: `ですます調: ${masuEndings.length}行、普通体: ${plainEndings.length}行`,
      lines: masuEndings.slice(0, 3).map(l => `  → ${l.trim()}`).join('\n'),
    });
  }

  // 2. 3点列挙チェック
  for (let i = 0; i < lines.length - 2; i++) {
    const a = lines[i].trim();
    const b = lines[i + 1].trim();
    const c = lines[i + 2].trim();
    const isBullet = l => /^(\*\*|[-・])\s*\S/.test(l);
    if (isBullet(a) && isBullet(b) && isBullet(c) && !isBullet(lines[i + 3]?.trim() ?? '')) {
      warnings.push({
        level: 'WARN',
        rule: '3点列挙',
        detail: '3点セットの列挙（2点か4点に変更推奨）',
        lines: [a, b, c].map(l => `  → ${l}`).join('\n'),
      });
      i += 2;
    }
  }

  // 3. 読者への問いかけ締め
  const lastNonEmpty = lines.filter(l => l.trim()).slice(-3).join('\n');
  if (/[？?]\s*$/.test(lastNonEmpty) || /どうでしょうか|いかがでしょうか|思いますか|感じますか/.test(lastNonEmpty)) {
    warnings.push({
      level: 'ERROR',
      rule: '読者への問いかけ締め',
      detail: '末尾が読者への問いかけで終わっています',
      lines: `  → ${lines.filter(l => l.trim()).slice(-1)[0]}`,
    });
  }

  // 4. 論理接続詞の多用
  const logicWords = ['つまり', '逆に言えば', 'その分', 'したがって', 'よって', 'そのため', 'それゆえ'];
  const logicHits = logicWords.flatMap(w =>
    lines.filter(l => l.includes(w)).map(l => ({ word: w, line: l.trim() }))
  );
  if (logicHits.length >= 3) {
    warnings.push({
      level: 'WARN',
      rule: '論理接続詞の多用',
      detail: `${logicHits.map(h => `「${h.word}」`).join(' ')} が使われています`,
      lines: logicHits.slice(0, 3).map(h => `  → ${h.line.slice(0, 60)}`).join('\n'),
    });
  }

  // 5. まとめセクションの箇条書き
  const summaryIdx = lines.findIndex(l => /^#{1,3}\s*(まとめ|おわりに|最後に)/.test(l));
  if (summaryIdx !== -1) {
    const summaryLines = lines.slice(summaryIdx + 1, summaryIdx + 15);
    const bulletCount = summaryLines.filter(l => /^[-・*]\s/.test(l.trim())).length;
    if (bulletCount >= 2) {
      warnings.push({
        level: 'ERROR',
        rule: 'まとめセクションの箇条書き',
        detail: `「まとめ」以降に箇条書きが${bulletCount}行あります`,
        lines: '',
      });
    }
  }

  // 6. 見出し構造が整いすぎ
  const h2Count = lines.filter(l => /^## /.test(l)).length;
  const h3Count = lines.filter(l => /^### /.test(l)).length;
  if (h2Count >= 4 && h3Count >= h2Count) {
    warnings.push({
      level: 'WARN',
      rule: '見出し構造が整いすぎ',
      detail: `H2: ${h2Count}個、H3: ${h3Count}個。すべてのH2にH3が揃っているとAIっぽく見えます`,
      lines: '',
    });
  }

  // ── SEOチェック ──────────────────────────────

  // 7. title長さ（30〜40字推奨）
  const title = fm.title ?? '';
  if (title.length < 20) {
    warnings.push({ level: 'WARN', rule: 'SEO: titleが短い', detail: `${title.length}字（20字以上推奨）`, lines: `  → ${title}` });
  } else if (title.length > 60) {
    warnings.push({ level: 'WARN', rule: 'SEO: titleが長い', detail: `${title.length}字（60字以下推奨）`, lines: `  → ${title}` });
  }

  // 8. description長さ（80〜160字推奨）
  const desc = fm.description ?? '';
  if (!desc) {
    warnings.push({ level: 'ERROR', rule: 'SEO: descriptionなし', detail: 'frontmatterにdescriptionがありません', lines: '' });
  } else if (desc.length < 80) {
    warnings.push({ level: 'WARN', rule: 'SEO: descriptionが短い', detail: `${desc.length}字（80字以上推奨）`, lines: `  → ${desc}` });
  } else if (desc.length > 160) {
    warnings.push({ level: 'WARN', rule: 'SEO: descriptionが長い', detail: `${desc.length}字（160字以下推奨）`, lines: `  → ${desc.slice(0, 80)}…` });
  }

  // 9. 文字数（1500〜2500字推奨）
  const charCount = body.replace(/\s/g, '').replace(/[#*\->`]/g, '').length;
  if (charCount < 1000) {
    warnings.push({ level: 'ERROR', rule: 'SEO: 文字数不足', detail: `${charCount}字（1500字以上推奨）`, lines: '' });
  } else if (charCount < 1500) {
    warnings.push({ level: 'WARN', rule: 'SEO: 文字数やや不足', detail: `${charCount}字（1500字以上推奨）`, lines: '' });
  }

  // 10. 冒頭の検索意図応答（最初の3段落に読者の悩み語彙が含まれるか）
  const opening = lines.slice(0, 15).join(' ');
  const painWords = ['怖い', '迷って', '不安', '悩ん', 'しんどい', '辛い', 'できない', '分からない', 'どうすれば', '難しい', '踏み出せ', '動けない'];
  const hasPainWord = painWords.some(w => opening.includes(w));
  if (!hasPainWord) {
    warnings.push({
      level: 'WARN',
      rule: 'SEO: 冒頭に読者の悩み語彙なし',
      detail: '冒頭15行に悩みを示す語彙が見当たりません（読者の検索意図に応答できていない可能性）',
      lines: '',
    });
  }

  // 11. related（内部リンク）の有無
  if (!fm.related) {
    warnings.push({ level: 'WARN', rule: 'SEO: relatedなし', detail: 'frontmatterにrelatedがありません（内部リンク強化推奨）', lines: '' });
  }

  // 12. tagsの有無・数
  const tags = fm.tags ?? [];
  if (tags.length === 0) {
    warnings.push({ level: 'WARN', rule: 'SEO: tagsなし', detail: 'frontmatterにtagsがありません', lines: '' });
  } else if (tags.length > 6) {
    warnings.push({ level: 'WARN', rule: 'SEO: tagsが多すぎ', detail: `${tags.length}個（5個以下推奨）`, lines: `  → ${tags.join(', ')}` });
  }

  // 13. targetKeywordの有無
  const targetKeyword = fm.targetKeyword ?? '';
  if (!targetKeyword) {
    warnings.push({ level: 'WARN', rule: 'SEO: targetKeywordなし', detail: 'frontmatterにtargetKeywordがありません（keywords.mdから選んで設定してください）', lines: '' });
  } else {
    // targetKeywordがtitle・description・本文冒頭100字に含まれるか
    const kws = targetKeyword.split(/[\s　]+/);
    const opening100 = body.replace(/^#+.*\n/gm, '').replace(/\n/g, '').slice(0, 100);
    const titleHits = kws.filter(kw => title.includes(kw));
    const descHits = kws.filter(kw => desc.includes(kw));
    const openingHits = kws.filter(kw => opening100.includes(kw));
    if (titleHits.length === 0) {
      warnings.push({ level: 'WARN', rule: 'SEO: targetKeywordがtitleに未使用', detail: `「${targetKeyword}」のいずれの語もtitleに含まれていません`, lines: `  → title: ${title}` });
    }
    if (descHits.length === 0) {
      warnings.push({ level: 'WARN', rule: 'SEO: targetKeywordがdescriptionに未使用', detail: `「${targetKeyword}」のいずれの語もdescriptionに含まれていません`, lines: '' });
    }
    if (openingHits.length === 0) {
      warnings.push({ level: 'WARN', rule: 'SEO: targetKeywordが冒頭100字に未使用', detail: `「${targetKeyword}」のいずれの語も本文冒頭100字に含まれていません`, lines: '' });
    }
  }

  return { warnings, meta: { charCount, title, desc, tags, related: fm.related, targetKeyword } };
}

// targetKeyword重複チェック（--all時のみ）
function checkTargetKeywordOverlap(files) {
  const kwMap = [];
  for (const f of files) {
    const { meta } = reviewArticle(f);
    if (meta.targetKeyword) {
      kwMap.push({
        slug: path.basename(f, '.md'),
        kw: meta.targetKeyword,
        words: meta.targetKeyword.split(/[\s　]+/),
      });
    }
  }
  const overlaps = [];
  for (let i = 0; i < kwMap.length; i++) {
    for (let j = i + 1; j < kwMap.length; j++) {
      const shared = kwMap[i].words.filter(w => kwMap[j].words.includes(w));
      if (shared.length >= 2) {
        overlaps.push({ a: kwMap[i], b: kwMap[j], shared });
      }
    }
  }
  return overlaps;
}

// タグレベルのキーワード共食いチェック（--all時のみ）
function checkKeywordCannibalization(files) {
  const tagMap = {};
  for (const f of files) {
    const { meta } = reviewArticle(f);
    for (const tag of meta.tags ?? []) {
      if (!tagMap[tag]) tagMap[tag] = [];
      tagMap[tag].push(path.basename(f, '.md'));
    }
  }
  const overlaps = Object.entries(tagMap).filter(([, slugs]) => slugs.length >= 4);
  return overlaps;
}

const args = process.argv[2];
if (!args) {
  console.error('Usage: npm run review -- src/content/blog/xxx.md');
  console.error('       npm run review -- --all');
  process.exit(1);
}

const files = getArticles(args);
let totalErrors = 0;
let totalWarns = 0;

for (const file of files) {
  const rel = path.relative(root, file);
  const { warnings } = reviewArticle(file);
  const errors = warnings.filter(w => w.level === 'ERROR');
  const warns = warnings.filter(w => w.level === 'WARN');
  totalErrors += errors.length;
  totalWarns += warns.length;

  if (warnings.length === 0) {
    console.log(`✅ ${rel}`);
    continue;
  }

  console.log(`\n📄 ${rel}`);
  for (const w of warnings) {
    const icon = w.level === 'ERROR' ? '❌' : '⚠️ ';
    console.log(`  ${icon} [${w.rule}] ${w.detail}`);
    if (w.lines) console.log(w.lines);
  }
}

// targetKeyword重複・タグ共食い（--allのみ）
if (args === '--all') {
  const kwOverlaps = checkTargetKeywordOverlap(files);
  if (kwOverlaps.length > 0) {
    console.log('\n❌ [SEO: targetKeyword重複の可能性]');
    for (const { a, b, shared } of kwOverlaps) {
      console.log(`  「${shared.join(' ')}」が重複: ${a.slug}「${a.kw}」 / ${b.slug}「${b.kw}」`);
    }
    totalErrors += kwOverlaps.length;
  }

  const overlaps = checkKeywordCannibalization(files);
  if (overlaps.length > 0) {
    console.log('\n⚠️  [SEO: タグ共食いの可能性]');
    for (const [tag, slugs] of overlaps) {
      console.log(`  「${tag}」: ${slugs.join(', ')}`);
    }
  }
}

console.log(`\n--- ${files.length}記事 / ❌ ${totalErrors}件 / ⚠️  ${totalWarns}件 ---`);
if (totalErrors > 0) process.exit(1);
