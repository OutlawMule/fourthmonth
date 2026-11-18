import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { findSecretsInPublicEnv, secretsMessage } from './scripts/envGuard.mjs';

// Static Vite build -> dist/. Hashed bundles go to /build so they never collide
// with the optional files you drop into public/assets (audio, sprites...).
// Phaser: we only use Arcade Physics, so we alias to Phaser's arcade-only bundle
// (smaller + faster to build than the full source tree with Matter).
export default defineConfig(({ mode }) => {
  // Stop right here if a secret key is in any VITE_ variable (.env files or the host's settings):
  // Vite would copy it into the public JavaScript. Not applied to the unit tests, which blank these.
  if (mode !== 'test') {
    const leaked = findSecretsInPublicEnv(loadEnv(mode, process.cwd(), 'VITE_'));
    if (leaked.length) throw new Error(secretsMessage(leaked));
  }

  return {
    base: './',
    resolve: {
      alias: { phaser: 'phaser/dist/phaser-arcade-physics.min.js' },
    },
    build: {
      target: 'es2022',
      outDir: 'dist',
      assetsDir: 'build',
      sourcemap: false,
      chunkSizeWarningLimit: 1800, // Phaser alone is ~1.2 MB minified
    },
    server: { host: true, port: 5173 },
    preview: { host: true, port: 4173 },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.js'],
      testTimeout: 60000,
      hookTimeout: 120000,
      // Tests never talk to a real Supabase project, even if a .env.local exists on this machine.
      env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
    },
  };
});
