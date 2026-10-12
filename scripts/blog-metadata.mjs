import fs from 'node:fs';
import { parseFrontmatter } from '@astrojs/markdown-remark';

const directory = new URL('../src/content/blog/', import.meta.url);

// Use the same frontmatter parser as Astro for both Markdown and MDX.
export function readBlogMetadata() {
	return fs.readdirSync(directory).filter(file => /\.mdx?$/.test(file)).map(file => {
		const source = fs.readFileSync(new URL(file, directory), 'utf8');
		const { frontmatter, content } = parseFrontmatter(source);
		const pubDate = new Date(frontmatter.pubDate);
		const updatedDate = frontmatter.updatedDate == null ? pubDate : new Date(frontmatter.updatedDate);
		if (!Number.isFinite(pubDate.valueOf()) || !Number.isFinite(updatedDate.valueOf()) || updatedDate < pubDate) {
			throw new Error(`${file}: 公開日・更新日が不正、または更新日が公開日より前です`);
		}
		return {
			id: file.replace(/\.mdx?$/, ''),
			frontmatter,
			content,
			// Keep the editorial date stable across builds; never use build time or file mtime.
			lastmod: updatedDate.toISOString().slice(0, 10),
		};
	});
}
