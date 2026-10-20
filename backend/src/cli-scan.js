import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanNasDirectory } from './scanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

for (const envCandidate of [
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env'),
]) {
  if (fsSync.existsSync(envCandidate) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envCandidate);
  }
}

const NAS_ROOT = process.env.NAS_MOVIES_PATH || '\\\\storagepi\\NAS\\Movies';
const CACHE_FILE = path.join(__dirname, '..', 'data', 'library-cache.json');

console.log(`Avvio scansione manuale di: ${NAS_ROOT}`);
const result = await scanNasDirectory(NAS_ROOT, (prog) => {
  console.log(`[${prog.phase}] ${prog.message}`);
});

await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
await fs.writeFile(CACHE_FILE, JSON.stringify(result), 'utf8');
console.log(`Cache salvata in: ${CACHE_FILE}`);
console.log(`Statistiche:`, result.stats);
