#!/usr/bin/env node
// Markdown / MDX の広告表示と本文内リンクを、公開前に検査する。
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const directory = path.join(root, 'src/content/blog');
const files = fs.readdirSync(directory).filter(file => /\.mdx?$/.test(file));
const slugs = new Set(files.map(file => file.replace(/\.mdx?$/, '')));
const affiliateHosts = ['a8.net', 'amzn.to', 'af.moshimo.com', 'valuecommerce.com', 'afb.jp', 'hb.afl.rakuten.co.jp'];
const errors = [];
let affiliateArticles = 0;

for (const file of files) {
  const source = fs.readFileSync(path.join(directory, file), 'utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    errors.push(`${file}: frontmatter がありません`);
    continue;
  }
  const [, frontmatter, body] = match;
  const urls = [...body.matchAll(/https?:\/\/[^\s<>"')]+/g)].map(match => match[0]);
  const hasAffiliate = urls.some(value => {
    const url = new URL(value.replaceAll('&amp;', '&'));
    return affiliateHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))
      || (/^([\w-]+\.)?amazon\.(co\.jp|com)$/.test(url.hostname) && url.searchParams.has('tag'));
  });
  const declared = /^isAffiliate:\s*true\s*$/m.test(frontmatter);
  if (hasAffiliate) affiliateArticles++;
  if (hasAffiliate !== declared) {
    errors.push(`${file}: 広告URL=${hasAffiliate}, isAffiliate=${declared}`);
  }
  for (const link of body.matchAll(/\]\(\/blog\/([^/#?)]+)\/?(?:[?#][^)]*)?\)/g)) {
    if (!slugs.has(link[1])) errors.push(`${file}: 本文リンク先がありません: ${link[1]}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`SEO check passed: ${files.length}記事、広告あり${affiliateArticles}記事。広告設定・本文リンクに不一致なし。`);
}
