// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://jeorp.github.io',
	base: 'carrier-compass',
	integrations: [mdx(), sitemap()],
});
