// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://www.carrier-compass.com',
	trailingSlash: 'always',
	integrations: [
		mdx(),
		sitemap({
			filter: (page) =>
				!/\/(blog\/tag|blog\/category|blog\/author)\//.test(page),
		}),
	],
});
