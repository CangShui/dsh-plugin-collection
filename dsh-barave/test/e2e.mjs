// Standalone end-to-end test for dsh-web-search-brave's provider code.
// Runs the EXACT BraveSearchProvider implementation against the real Brave
// API using the key stored in the harness credentials file (BRAVE_API_KEY,
// falling back to DEEPSEEK_API_KEY which currently holds the Brave key).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BraveSearchProvider } from '../lib/provider.js';

function credentialValue(name) {
  const file = join(process.env.DSH_HOME || join(homedir(), '.dsh'), '.credentials.yaml');
  const raw = readFileSync(file, 'utf8');
  const m = raw.match(new RegExp(`^${name}:\\s*(\\S+)`, 'm'));
  return m ? m[1] : undefined;
}

const key = credentialValue('BRAVE_API_KEY') ?? credentialValue('DEEPSEEK_API_KEY');
if (!key) {
  console.error('FAIL: no Brave key found in credentials file');
  process.exit(1);
}

const provider = new BraveSearchProvider(() => ({
  baseURL: 'https://api.search.brave.com/res/v1',
  resolveApiKey: async () => key,
}));

console.log('available():', provider.available());

const signal = AbortSignal.timeout(30000);
const result = await provider.search({ query: 'DeepSeek Harness', maxResults: 5 }, signal);

console.log('sources:', result.sources.length, 'truncated:', result.truncated);
for (const s of result.sources.slice(0, 5)) {
  console.log('-', s.title ?? s.url);
  console.log('  ', s.url, s.publishedAt ?? '');
  if (s.snippet) console.log('  snippet:', s.snippet.slice(0, 120));
}
if (result.sources.length === 0) {
  console.error('FAIL: no sources returned');
  process.exit(1);
}
console.log('PASS: brave provider search works end-to-end');
