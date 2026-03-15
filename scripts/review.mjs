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

function reviewArticle(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const body = content.replace(/^---[\s\S]*?---\n/, ''); // frontmatter除去
  const lines = body.split('\n');
  const warnings = [];

  // 1. ですます混在チェック
  const masuEndings = lines.filter(l => /[ぁ-ん]+(ます|ません|ました|ません|でした|ございます)。/.test(l));
  const plainEndings = lines.filter(l => /[ぁ-ん]+(だ|だった|だろう|思う|感じる|いる|ある|ない|くない)。/.test(l));
  if (masuEndings.length > 0 && plainEndings.length > 0) {
    warnings.push({
      level: 'ERROR',
      rule: 'ですます・普通体混在',
      detail: `ですます調: ${masuEndings.length}行、普通体: ${plainEndings.length}行`,
      lines: masuEndings.slice(0, 3).map(l => `  → ${l.trim()}`).join('\n'),
    });
  }

  // 2. 3点列挙チェック（H2/H3直下で3連続の**bold**や箇条書き）
  for (let i = 0; i < lines.length - 2; i++) {
    const a = lines[i].trim();
    const b = lines[i + 1].trim();
    const c = lines[i + 2].trim();
    const isBullet = l => /^(\*\*|[-・])\s*\S/.test(l);
    if (isBullet(a) && isBullet(b) && isBullet(c) && !isBullet(lines[i + 3]?.trim() ?? '')) {
      warnings.push({
        level: 'WARN',
        rule: '3点列挙',
        detail: '3点セットの列挙が見つかりました（2点か4点に変更推奨）',
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

  // 6. H2見出しの数（多すぎると整いすぎてAIっぽい）
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

  return warnings;
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
  const warnings = reviewArticle(file);
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

console.log(`\n--- ${files.length}記事 / ❌ ${totalErrors}件 / ⚠️  ${totalWarns}件 ---`);
if (totalErrors > 0) process.exit(1);
