import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained index.html: easy to host anywhere and to publish as a claude.ai Artifact.
export default defineConfig({
  // relative URLs, so the build works from a subpath such as qbickkk.github.io/event-horizon/
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2022' },
});
