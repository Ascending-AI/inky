// The download site: one static page (dist/). It has no server part.
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
	server: { port: 5175 },
	vite: {
		plugins: [tailwindcss()],
		// The site's own tsconfig, by name. Without this, Vite also reads the app's tsconfig.json
		// one folder up, and that one needs the app's generated .svelte-kit/ folder.
		tsconfig: 'tsconfig.json'
	}
});
