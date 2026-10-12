// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { readBlogMetadata } from './scripts/blog-metadata.mjs';

// Validate dates before sitemap serialization (which logs rather than throws errors).
const articleDates = new Map(readBlogMetadata().map(post => [`/blog/${post.id}/`, post.lastmod]));

// https://astro.build/config
export default defineConfig({
	site: 'https://www.carrier-compass.com',
	trailingSlash: 'always',
	integrations: [
		mdx(),
		sitemap({
			filter: (page) =>
				!/\/(blog\/tag|blog\/category|blog\/author)\//.test(page),
			serialize: (item) => {
				const lastmod = articleDates.get(new URL(item.url).pathname);
				return lastmod ? { ...item, lastmod } : item;
			},
		}),
	],
});
