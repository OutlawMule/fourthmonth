// Repository-wide guards for the security rules in the brief. These scan the source so a future edit
// cannot quietly break them.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const code = (file) => readFileSync(file, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')          // block comments
  .replace(/(^|[^:\w])\/\/.*$/gm, '$1');     // line comments (keeps URLs like https://)
const SRC = walk(join(ROOT, 'src')).filter((f) => f.endsWith('.js'));
const rel = (f) => relative(ROOT, f);

describe('browser code', () => {
  it('never builds HTML from strings (all text goes in with textContent)', () => {
    const bad = SRC.filter((f) => /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write\(|dangerouslySetInnerHTML/.test(code(f)));
    expect(bad.map(rel)).toEqual([]);
  });

  it('touches localStorage only through src/utils/storage.js', () => {
    const bad = SRC.filter((f) => !f.endsWith('utils/storage.js') && /\b(localStorage|sessionStorage|indexedDB)\b/.test(code(f)));
    expect(bad.map(rel)).toEqual([]);
  });

  it('does not log from the UI, services or utilities except an error message', () => {
    const files = SRC.filter((f) => /src\/(ui|services|utils)\//.test(f));
    const offenders = [];
    for (const f of files) {
      for (const line of code(f).split('\n')) {
        const m = line.match(/console\.(\w+)\(/);
        if (!m) continue;
        if (!['error', 'warn'].includes(m[1]) || !/\.message/.test(line)) offenders.push(`${rel(f)}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never puts answers or credentials into a URL', () => {
    const bad = SRC.filter((f) => /(location\.(search|hash)\s*=|history\.(push|replace)State\([^)]*(answer|password|token))/i.test(code(f)));
    expect(bad.map(rel)).toEqual([]);
  });

  it('contains no keys: no JWTs, no sb_secret_ / sb_publishable_ values, no service-role references outside the guard', () => {
    const files = [...SRC, join(ROOT, 'index.html'), join(ROOT, '.env.example'), join(ROOT, 'vercel.json')].filter(existsSync);
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect(text, rel(f)).not.toMatch(/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\./);
      expect(text, rel(f)).not.toMatch(/sb_(secret|publishable)_[A-Za-z0-9]{12,}/);
    }
    const mentioning = SRC.filter((f) => /service[_-]role|sb_secret/i.test(readFileSync(f, 'utf8'))).map(rel);
    expect(mentioning.sort()).toEqual(['src/services/keyGuard.js', 'src/services/supabase.js']);
  });

  it('never tells players that only they can read a Private answer (the person who runs the database can)', () => {
    for (const f of SRC) expect(readFileSync(f, 'utf8'), rel(f)).not.toMatch(/only you can read/i);
  });

  it('reads exactly two environment values, both public', () => {
    const names = new Set();
    for (const f of SRC) for (const m of readFileSync(f, 'utf8').matchAll(/\bVITE_[A-Z0-9_]+/g)) names.add(m[0]);
    expect([...names].sort()).toEqual(['VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_URL']);
    // Never pass the whole env object around: Vite would copy EVERY VITE_ variable into the public bundle.
    for (const f of SRC) expect(readFileSync(f, 'utf8'), rel(f)).not.toMatch(/import\.meta\.env(?![.\w])/);
    const example = readFileSync(join(ROOT, '.env.example'), 'utf8');
    const declared = [...example.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]).sort();
    expect(declared).toEqual(['VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_URL']);
  });
});

describe('project configuration', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));

  it('builds with npm run build into dist', () => {
    expect(pkg.scripts.build).toBe('vite build');
    expect(vercel).toMatchObject({ buildCommand: 'npm run build', outputDirectory: 'dist' });
  });
  it('uses the specified stack and nothing from the forbidden list', () => {
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const d of ['phaser', 'vite', '@supabase/supabase-js', 'vitest']) expect(deps).toContain(d);
    for (const d of ['react', 'react-dom', 'next', 'vue', 'svelte']) expect(deps).not.toContain(d);
  });
  it('keeps secrets and builds out of git', () => {
    const ig = readFileSync(join(ROOT, '.gitignore'), 'utf8');
    for (const entry of ['node_modules/', 'dist/', '.env', '.env.local']) expect(ig).toContain(entry);
  });
  it('ships no secrets in vercel.json (environment values belong in the Vercel dashboard)', () => {
    expect(vercel.env).toBeUndefined();
    expect(vercel.build?.env).toBeUndefined();
    expect(JSON.stringify(vercel)).not.toMatch(/service_role|sb_secret_|sb_publishable_|eyJ[A-Za-z0-9_-]{15,}/);
  });
});
