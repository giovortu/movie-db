import express from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scanNasDirectory } from './scanner.js';
import { fixSeriesInLibrary, resolveSeriesRootFolder } from './seriesFixer.js';
import {
  getTmdbCredentials,
  scanUnmatchedVideos,
  searchTmdb,
  fetchTmdbFullDetails,
  writeNovaFilesToNas,
} from './novaGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carica variabili d'ambiente da .env (root del progetto e/o cartella backend)
for (const envCandidate of [
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env'),
]) {
  if (fsSync.existsSync(envCandidate) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envCandidate);
  }
}

const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT || '3001', 10);
const NAS_ROOT = process.env.NAS_MOVIES_PATH || '\\\\storagepi\\NAS\\Movies';
const NAS_DISPLAY_ROOT = process.env.NAS_DISPLAY_PATH || NAS_ROOT;
const CACHE_FILE = path.join(__dirname, '..', 'data', 'library-cache.json');

/**
 * Converte automaticamente un percorso salvato in cache (es. \\storagepi\NAS\Movies\...)
 * nel percorso locale effettivo del sistema/container corrente (es. /mnt/nas/movies/...)
 */
function toRuntimeNasPath(storedPath) {
  if (!storedPath || typeof storedPath !== 'string') return '';
  const prefixes = [
    NAS_ROOT,
    NAS_DISPLAY_ROOT,
    '\\\\storagepi\\NAS\\Movies',
    '//storagepi/NAS/Movies',
    '/mnt/nas/movies',
  ].filter(Boolean);

  const normalizedStored = storedPath.replace(/\\/g, '/');
  for (const pref of prefixes) {
    const normPref = pref.replace(/\\/g, '/').replace(/\/+$/, '');
    if (
      normalizedStored.toLowerCase() === normPref.toLowerCase() ||
      normalizedStored.toLowerCase().startsWith(normPref.toLowerCase() + '/')
    ) {
      const rel = normalizedStored.slice(normPref.length).replace(/^\/+/, '');
      return rel ? path.join(NAS_ROOT, ...rel.split('/')) : NAS_ROOT;
    }
  }
  return storedPath;
}

const app = express();
app.use(cors());
app.use(express.json());

let library = {
  scannedAt: null,
  nasRoot: NAS_ROOT,
  durationMs: 0,
  stats: {
    totalItems: 0,
    moviesCount: 0,
    tvShowsCount: 0,
    totalEpisodesCount: 0,
    totalNfoFiles: 0,
  },
  items: [],
};

let scanState = {
  isScanning: false,
  progress: null,
  lastError: null,
};

function enrichImageUrls(item) {
  const posterUrl = item.posterPath
    ? `/api/image?path=${encodeURIComponent(item.posterPath)}`
    : item.remotePoster || '';
  const fanartUrl = item.fanartPath
    ? `/api/image?path=${encodeURIComponent(item.fanartPath)}`
    : item.remoteFanart || '';
  const logoUrl = item.logoPath
    ? `/api/image?path=${encodeURIComponent(item.logoPath)}`
    : '';
  return {
    ...item,
    posterUrl,
    fanartUrl,
    logoUrl,
  };
}

async function ensureFileTimestamps(items) {
  const missing = items.filter((item) => !item.fileTimestampMs);
  if (missing.length === 0) return false;

  console.log(`[Cache] Lettura datetime dei file per ${missing.length} elementi...`);
  const CONCURRENCY = 25;
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (item) => {
        let maxTs = 0;
        const candidates = [];
        if (item.videoPath) candidates.push(item.videoPath);
        if (item.nfoPath) candidates.push(item.nfoPath);
        if (item.type === 'tvshow' && Array.isArray(item.episodes)) {
          // Prendi gli ultimi episodi e il primo per rilevare la data di inserimento più recente
          const sampleEps = [
            ...item.episodes.slice(-5),
            ...item.episodes.slice(0, 2),
          ];
          for (const ep of sampleEps) {
            if (ep.videoPath) candidates.push(ep.videoPath);
            else if (ep.nfoPath) candidates.push(ep.nfoPath);
          }
        }
        if (candidates.length === 0 && item.folderPath) {
          candidates.push(item.folderPath);
        }

        for (const p of candidates) {
          try {
            const st = await fs.stat(p);
            const ts = Math.round(st.mtimeMs || st.birthtimeMs || 0);
            if (ts > maxTs) maxTs = ts;
          } catch {
            // ignore
          }
        }

        if (maxTs > 0) {
          item.fileTimestampMs = maxTs;
          item.fileDate = new Date(maxTs).toISOString();
        }
      })
    );
  }
  console.log(`[Cache] Datetime dei file aggiornati con successo.`);
  return true;
}

async function loadCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items)) {
      library = parsed;
      console.log(
        `[Cache] Caricati ${library.items.length} elementi dalla cache (${library.scannedAt}).`
      );
      ensureFileTimestamps(library.items)
        .then((updated) => {
          if (updated) saveCache(library);
        })
        .catch(() => {});
      return true;
    }
  } catch {
    // Cache non presente
  }
  return false;
}

async function saveCache(data) {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(data), 'utf8');
  } catch (err) {
    console.error('[Cache] Errore salvataggio cache:', err.message);
  }
}

async function triggerScan() {
  if (scanState.isScanning) return;
  scanState.isScanning = true;
  scanState.lastError = null;
  scanState.progress = {
    phase: 'starting',
    message: `Connessione a ${NAS_ROOT}...`,
  };

  try {
    const result = await scanNasDirectory(NAS_ROOT, (prog) => {
      scanState.progress = prog;
    });
    library = result;
    await saveCache(result);
  } catch (err) {
    console.error('[Scanner] Errore durante la scansione:', err);
    scanState.lastError = err.message || 'Errore durante la scansione del NAS';
  } finally {
    scanState.isScanning = false;
  }
}

// Stato del server e della scansione
app.get('/api/status', (_req, res) => {
  res.json({
    isScanning: scanState.isScanning,
    progress: scanState.progress,
    lastError: scanState.lastError,
    scannedAt: library.scannedAt,
    nasRoot: library.nasRoot,
    durationMs: library.durationMs,
    stats: library.stats,
  });
});

// Avvia una nuova scansione del NAS
app.post('/api/scan', (_req, res) => {
  if (scanState.isScanning) {
    return res.status(409).json({
      message: 'Scansione già in corso',
      progress: scanState.progress,
    });
  }
  triggerScan();
  res.json({
    message: 'Scansione avviata',
    progress: scanState.progress,
  });
});

// Unifica le Serie TV e le miniserie/film multi-parte divisi su più card ("Fix series")
app.post('/api/fix-series', async (_req, res) => {
  try {
    const { library: fixedLibrary, report } = await fixSeriesInLibrary(library);
    library = fixedLibrary;
    await saveCache(library);
    res.json({
      message:
        report.totalMergedCards > 0
          ? `Unificate ${report.totalMergedCards} card duplicate (${report.mergedTitles.length} titoli consolidati).`
          : 'Tutte le serie risultano già correttamente unificate.',
      report,
      stats: library.stats,
    });
  } catch (err) {
    console.error('[FixSeries] Errore:', err);
    res.status(500).json({ error: err.message || 'Errore durante Fix Series' });
  }
});

// Restituisce i filtri disponibili (generi, registi/autori, attori, studi, anni)
app.get('/api/facets', (_req, res) => {
  const genreCounts = new Map();
  const directorCounts = new Map();
  const writerCounts = new Map();
  const actorCounts = new Map();
  const studioCounts = new Map();
  const yearSet = new Set();

  let moviesCount = 0;
  let tvShowsCount = 0;

  for (const item of library.items) {
    if (item.type === 'movie') moviesCount++;
    else if (item.type === 'tvshow') tvShowsCount++;

    if (item.year) yearSet.add(item.year);

    for (const g of item.genres || []) {
      genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
    }
    for (const d of item.directors || []) {
      directorCounts.set(d, (directorCounts.get(d) || 0) + 1);
    }
    for (const w of item.writers || []) {
      writerCounts.set(w, (writerCounts.get(w) || 0) + 1);
    }
    for (const s of item.studios || []) {
      studioCounts.set(s, (studioCounts.get(s) || 0) + 1);
    }
    for (const a of (item.actors || []).slice(0, 15)) {
      if (a?.name) {
        actorCounts.set(a.name, (actorCounts.get(a.name) || 0) + 1);
      }
    }
  }

  const mapToSortedArray = (map, limit = 200) =>
    Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'it'))
      .slice(0, limit);

  res.json({
    types: {
      all: library.items.length,
      movie: moviesCount,
      tvshow: tvShowsCount,
    },
    genres: mapToSortedArray(genreCounts, 100),
    directors: mapToSortedArray(directorCounts, 300),
    writers: mapToSortedArray(writerCounts, 200),
    actors: mapToSortedArray(actorCounts, 300),
    studios: mapToSortedArray(studioCounts, 150),
    years: Array.from(yearSet).sort((a, b) => b - a),
  });
});

// Ricerca e filtro di film e serie TV
app.get('/api/media', (req, res) => {
  const {
    q = '',
    type = 'all',
    genre = '',
    director = '',
    actor = '',
    studio = '',
    year = '',
    minRating = '',
    sort = 'title_asc',
  } = req.query;

  const queryLower = String(q).trim().toLowerCase();
  const genreLower = String(genre).trim().toLowerCase();
  const directorLower = String(director).trim().toLowerCase();
  const actorLower = String(actor).trim().toLowerCase();
  const studioLower = String(studio).trim().toLowerCase();
  const yearNum = year ? parseInt(String(year), 10) : null;
  const minRatingNum = minRating ? parseFloat(String(minRating)) : null;

  let filtered = library.items.filter((item) => {
    if (type !== 'all' && item.type !== type) return false;

    if (genreLower) {
      const hasGenre = (item.genres || []).some((g) => g.toLowerCase() === genreLower);
      if (!hasGenre) return false;
    }

    if (directorLower) {
      const hasDirector =
        (item.directors || []).some((d) => d.toLowerCase().includes(directorLower)) ||
        (item.writers || []).some((w) => w.toLowerCase().includes(directorLower));
      if (!hasDirector) return false;
    }

    if (actorLower) {
      const hasActor = (item.actors || []).some((a) =>
        a.name.toLowerCase().includes(actorLower)
      );
      if (!hasActor) return false;
    }

    if (studioLower) {
      const hasStudio = (item.studios || []).some((s) =>
        s.toLowerCase().includes(studioLower)
      );
      if (!hasStudio) return false;
    }

    if (yearNum && item.year !== yearNum) return false;

    if (minRatingNum && (!item.rating || item.rating < minRatingNum)) return false;

    if (queryLower) {
      const inTitle = item.title?.toLowerCase().includes(queryLower);
      const inOrigTitle = item.originalTitle?.toLowerCase().includes(queryLower);
      const inOverview = item.overview?.toLowerCase().includes(queryLower);
      const inTagline = item.tagline?.toLowerCase().includes(queryLower);
      const inDirectors = (item.directors || []).some((d) =>
        d.toLowerCase().includes(queryLower)
      );
      const inWriters = (item.writers || []).some((w) =>
        w.toLowerCase().includes(queryLower)
      );
      const inActors = (item.actors || []).some(
        (a) =>
          a.name.toLowerCase().includes(queryLower) ||
          (a.role && a.role.toLowerCase().includes(queryLower))
      );
      const inGenres = (item.genres || []).some((g) =>
        g.toLowerCase().includes(queryLower)
      );
      const inStudios = (item.studios || []).some((s) =>
        s.toLowerCase().includes(queryLower)
      );
      const inTags = (item.tags || []).some((t) =>
        t.toLowerCase().includes(queryLower)
      );
      const inYear = item.year && String(item.year) === queryLower;
      const inFolder = item.folderPath?.toLowerCase().includes(queryLower);

      if (
        !inTitle &&
        !inOrigTitle &&
        !inOverview &&
        !inTagline &&
        !inDirectors &&
        !inWriters &&
        !inActors &&
        !inGenres &&
        !inStudios &&
        !inTags &&
        !inYear &&
        !inFolder
      ) {
        return false;
      }
    }

    return true;
  });

  // Ordinamento
  filtered.sort((a, b) => {
    switch (sort) {
      case 'added_desc':
        return (
          (b.fileTimestampMs || 0) - (a.fileTimestampMs || 0) ||
          a.title.localeCompare(b.title, 'it')
        );
      case 'added_asc':
        return (
          (a.fileTimestampMs || Number.MAX_SAFE_INTEGER) -
            (b.fileTimestampMs || Number.MAX_SAFE_INTEGER) ||
          a.title.localeCompare(b.title, 'it')
        );
      case 'title_desc':
        return b.title.localeCompare(a.title, 'it', { sensitivity: 'base' });
      case 'year_desc':
        return (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title, 'it');
      case 'year_asc':
        return (a.year || 9999) - (b.year || 9999) || a.title.localeCompare(b.title, 'it');
      case 'rating_desc':
        return (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title, 'it');
      case 'rating_asc':
        return (a.rating || 99) - (b.rating || 99) || a.title.localeCompare(b.title, 'it');
      case 'runtime_desc':
        return (b.runtime || 0) - (a.runtime || 0) || a.title.localeCompare(b.title, 'it');
      case 'title_asc':
      default:
        return a.title.localeCompare(b.title, 'it', { sensitivity: 'base' });
    }
  });

  const lightItems = filtered.map((item) => {
    const enriched = enrichImageUrls(item);
    // Riduzione payload per la lista principale (gli episodi completi sono in /api/media/:id)
    const { episodes, ...rest } = enriched;
    return {
      ...rest,
      actors: (rest.actors || []).slice(0, 6),
    };
  });

  res.json({
    total: lightItems.length,
    items: lightItems,
  });
});

const VIDEO_EXTENSIONS = new Set([
  '.mkv',
  '.mp4',
  '.avi',
  '.m4v',
  '.mov',
  '.wmv',
  '.ts',
  '.m2ts',
  '.iso',
  '.webm',
  '.mpg',
  '.mpeg',
  '.flv',
  '.divx',
]);

const IGNORED_SUBDIRS = new Set([
  'subs',
  'subtitles',
  'featurettes',
  'extras',
  'sample',
  'samples',
  'novels',
  'books',
  'ost',
  'soundtrack',
]);

async function collectVideoFilesInFolder(rootFolder, isRootNasDir = false, maxDepth = 3) {
  const results = [];
  if (isRootNasDir) return results;

  async function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_SUBDIRS.has(entry.name.toLowerCase()) && !entry.name.startsWith('.')) {
          await walk(fullPath, depth + 1);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          let sizeBytes = null;
          try {
            const st = await fs.stat(fullPath);
            sizeBytes = st.size;
          } catch {
            // ignore stat error
          }
          results.push({
            name: entry.name,
            fullPath,
            folderPath: dir,
            format: ext.slice(1).toUpperCase(),
            sizeBytes,
          });
        }
      }
    }
  }

  await walk(rootFolder, 0);
  results.sort((a, b) => a.fullPath.localeCompare(b.fullPath, 'it', { numeric: true }));
  return results;
}

// Dettaglio singolo film o serie TV (inclusi episodi, file video e cast completo)
app.get('/api/media/:id', async (req, res) => {
  const item = library.items.find((x) => x.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Elemento non trovato' });
  }

  const enriched = enrichImageUrls(item);
  const isRootNasDir =
    path.resolve(item.folderPath || '') === path.resolve(NAS_ROOT);

  let videoFiles = [];
  if (item.type === 'movie') {
    if (item.videoPath) {
      let sizeBytes = null;
      try {
        const st = await fs.stat(item.videoPath);
        sizeBytes = st.size;
      } catch {
        // ignore
      }
      videoFiles.push({
        name: item.videoFileName || path.basename(item.videoPath),
        fullPath: item.videoPath,
        folderPath: path.dirname(item.videoPath),
        format:
          item.videoFormat ||
          path.extname(item.videoPath).slice(1).toUpperCase(),
        sizeBytes,
      });
    }
    // Se il film è in una sua sottocartella dedicata, controlla anche eventuali altri file video (es. CD1/CD2 o più versioni)
    if (!isRootNasDir && item.folderPath) {
      const folderVideos = await collectVideoFilesInFolder(item.folderPath, false, 2);
      for (const fv of folderVideos) {
        if (!videoFiles.some((v) => v.fullPath.toLowerCase() === fv.fullPath.toLowerCase())) {
          videoFiles.push(fv);
        }
      }
      if (!enriched.videoPath && videoFiles.length > 0) {
        enriched.videoPath = videoFiles[0].fullPath;
        enriched.videoFileName = videoFiles[0].name;
        enriched.videoFormat = videoFiles[0].format;
      }
    }
  } else if (item.type === 'tvshow') {
    // Raccogli tutti i file video da tutte le cartelle associate alla serie e dagli episodi
    const candidateFolders = Array.from(
      new Set([
        ...(item.folderPaths || []),
        ...(item.folderPath ? [item.folderPath] : []),
      ])
    );

    const seenVideoPaths = new Set();
    const folderVideos = [];

    for (const folder of candidateFolders) {
      const isRoot = path.resolve(folder) === path.resolve(NAS_ROOT);
      if (isRoot) continue;
      const vids = await collectVideoFilesInFolder(folder, false, 3);
      for (const v of vids) {
        const key = v.fullPath.toLowerCase();
        if (!seenVideoPaths.has(key)) {
          seenVideoPaths.add(key);
          folderVideos.push(v);
        }
      }
    }

    // Includi anche eventuali episodi i cui file si trovano nella root del NAS
    for (const ep of enriched.episodes || []) {
      if (ep.videoPath && !seenVideoPaths.has(ep.videoPath.toLowerCase())) {
        let sizeBytes = null;
        try {
          const st = await fs.stat(ep.videoPath);
          sizeBytes = st.size;
        } catch {
          // ignore
        }
        seenVideoPaths.add(ep.videoPath.toLowerCase());
        folderVideos.push({
          name: ep.videoFileName || path.basename(ep.videoPath),
          fullPath: ep.videoPath,
          folderPath: path.dirname(ep.videoPath),
          format: path.extname(ep.videoPath).slice(1).toUpperCase(),
          sizeBytes,
        });
      }
    }

    const sizeByPath = new Map(
      folderVideos.map((v) => [v.fullPath.toLowerCase(), v.sizeBytes])
    );

    if (Array.isArray(enriched.episodes)) {
      enriched.episodes = enriched.episodes.map((ep) => ({
        ...ep,
        sizeBytes: ep.videoPath
          ? sizeByPath.get(ep.videoPath.toLowerCase()) ?? null
          : null,
      }));
    }

    videoFiles = folderVideos;
  }

  const videoFolders = Array.from(
    new Set([
      ...(item.folderPaths || []),
      ...(videoFiles.map((v) => v.folderPath).filter(Boolean)),
      ...(item.folderPath ? [item.folderPath] : []),
    ])
  );

  res.json({
    ...enriched,
    videoFiles,
    videoFolders,
  });
});

function isSafeNasPath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;
  const normTarget = path.resolve(targetPath).toLowerCase();
  const normRoot = path.resolve(NAS_ROOT).toLowerCase();
  return normTarget.startsWith(normRoot + path.sep) && normTarget !== normRoot;
}

function extractFileStem(filePath) {
  const base = path.basename(filePath);
  const lower = base.toLowerCase();
  if (lower.endsWith('.archos.nfo')) return base.slice(0, -'.archos.nfo'.length);
  if (lower.endsWith('.nfo')) return base.slice(0, -'.nfo'.length);
  const ext = path.extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

async function deleteFileIfSafe(filePath, deletedList) {
  if (!filePath || !isSafeNasPath(filePath)) return;
  try {
    await fs.unlink(filePath);
    deletedList.push(filePath);
  } catch {
    // file già rimosso o non accessibile
  }
}

async function deleteCompanionFiles(dirPath, stem, deletedList) {
  if (!dirPath || !stem || !isSafeNasPath(path.join(dirPath, 'dummy'))) return;
  const stemLower = stem.toLowerCase();
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const nameLower = entry.name.toLowerCase();
      if (
        nameLower === `${stemLower}.nfo` ||
        nameLower === `${stemLower}.archos.nfo` ||
        nameLower.startsWith(`${stemLower}-poster`) ||
        nameLower.startsWith(`${stemLower}-fanart`) ||
        nameLower.startsWith(`${stemLower}-backdrop`) ||
        nameLower.startsWith(`${stemLower}-landscape`) ||
        nameLower.startsWith(`${stemLower}-logo`) ||
        nameLower.startsWith(`${stemLower}-thumb`) ||
        nameLower === `${stemLower}.srt` ||
        nameLower === `${stemLower}.sub` ||
        nameLower === `${stemLower}.idx` ||
        nameLower === `${stemLower}.ass` ||
        nameLower.startsWith(`${stemLower}.`)
      ) {
        const full = path.join(dirPath, entry.name);
        await deleteFileIfSafe(full, deletedList);
      }
    }
  } catch {
    // ignore
  }
}

async function removeDirIfNoVideosRemain(dirPath, deletedList) {
  if (!dirPath || !isSafeNasPath(dirPath)) return;
  // Non rimuovere mai cartelle di primo livello condivise come CD o Scifi
  const rel = path.relative(NAS_ROOT, dirPath);
  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.length === 1 && ['cd', 'scifi'].includes(parts[0].toLowerCase())) {
    return;
  }
  if (parts.length === 2 && parts[0].toLowerCase() === 'cd') {
    return;
  }

  const remainingVideos = await collectVideoFilesInFolder(dirPath, false, 3);
  if (remainingVideos.length === 0) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      deletedList.push(dirPath);
    } catch {
      // ignore
    }
  }
}

function updateLibraryStats() {
  const moviesCount = library.items.filter((x) => x.type === 'movie').length;
  const tvShows = library.items.filter((x) => x.type === 'tvshow');
  const tvShowsCount = tvShows.length;
  const totalEpisodesCount = tvShows.reduce(
    (acc, s) => acc + (s.episodes?.length || 0),
    0
  );
  library.stats = {
    ...library.stats,
    totalItems: library.items.length,
    moviesCount,
    tvShowsCount,
    totalEpisodesCount,
  };
}

// Elimina un film (o un'intera serie TV) dal database e opzionalmente dal NAS
app.delete('/api/media/:id', async (req, res) => {
  const idx = library.items.findIndex((x) => x.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Elemento non trovato' });
  }

  const item = library.items[idx];
  const deleteFiles = req.query.deleteFiles !== 'false';
  const deletedFiles = [];

  if (deleteFiles) {
    if (item.type === 'movie') {
      const stem = item.videoPath
        ? extractFileStem(item.videoPath)
        : item.nfoPath
          ? extractFileStem(item.nfoPath)
          : '';
      const dirPath = item.videoPath
        ? path.dirname(item.videoPath)
        : item.nfoPath
          ? path.dirname(item.nfoPath)
          : item.folderPath;

      await deleteFileIfSafe(item.videoPath, deletedFiles);
      await deleteFileIfSafe(item.nfoPath, deletedFiles);
      if (stem && dirPath) {
        await deleteCompanionFiles(dirPath, stem, deletedFiles);
      }

      const isRootNasDir =
        path.resolve(item.folderPath || '') === path.resolve(NAS_ROOT);
      if (!isRootNasDir && item.folderPath) {
        // Verifica se nella cartella ci sono altri film nel database
        const otherItemsInSameFolder = library.items.some(
          (other) =>
            other.id !== item.id &&
            other.folderPath &&
            other.folderPath.toLowerCase() === item.folderPath.toLowerCase()
        );
        if (!otherItemsInSameFolder) {
          await removeDirIfNoVideosRemain(item.folderPath, deletedFiles);
        }
      }
    } else if (item.type === 'tvshow') {
      for (const ep of item.episodes || []) {
        const epDir = ep.videoPath
          ? path.dirname(ep.videoPath)
          : ep.nfoPath
            ? path.dirname(ep.nfoPath)
            : '';
        const epStem = ep.videoPath
          ? extractFileStem(ep.videoPath)
          : ep.nfoPath
            ? extractFileStem(ep.nfoPath)
            : '';
        await deleteFileIfSafe(ep.videoPath, deletedFiles);
        await deleteFileIfSafe(ep.nfoPath, deletedFiles);
        if (epDir && epStem) {
          await deleteCompanionFiles(epDir, epStem, deletedFiles);
        }
      }
      await deleteFileIfSafe(item.nfoPath, deletedFiles);
      await deleteFileIfSafe(item.posterPath, deletedFiles);
      await deleteFileIfSafe(item.fanartPath, deletedFiles);

      const candidateFolders = Array.from(
        new Set([
          ...(item.folderPaths || []),
          ...(item.folderPath ? [item.folderPath] : []),
        ])
      );
      for (const folder of candidateFolders) {
        if (path.resolve(folder) !== path.resolve(NAS_ROOT)) {
          await removeDirIfNoVideosRemain(folder, deletedFiles);
        }
      }
    }
  }

  library.items.splice(idx, 1);
  updateLibraryStats();
  await saveCache(library);

  res.json({
    message: `"${item.title}" è stato eliminato.`,
    deletedFiles,
    stats: library.stats,
  });
});

// Elimina un singolo episodio di una serie TV (dal database e opzionalmente i file fisici sul NAS)
app.delete('/api/media/:id/episodes/:episodeId', async (req, res) => {
  const show = library.items.find((x) => x.id === req.params.id && x.type === 'tvshow');
  if (!show) {
    return res.status(404).json({ error: 'Serie TV non trovata' });
  }

  const epIdx = (show.episodes || []).findIndex((e) => e.id === req.params.episodeId);
  if (epIdx === -1) {
    return res.status(404).json({ error: 'Episodio non trovato' });
  }

  const ep = show.episodes[epIdx];
  const deleteFiles = req.query.deleteFiles !== 'false';
  const deletedFiles = [];

  if (deleteFiles) {
    const epDir = ep.videoPath
      ? path.dirname(ep.videoPath)
      : ep.nfoPath
        ? path.dirname(ep.nfoPath)
        : '';
    const epStem = ep.videoPath
      ? extractFileStem(ep.videoPath)
      : ep.nfoPath
        ? extractFileStem(ep.nfoPath)
        : '';

    await deleteFileIfSafe(ep.videoPath, deletedFiles);
    await deleteFileIfSafe(ep.nfoPath, deletedFiles);
    if (epDir && epStem) {
      await deleteCompanionFiles(epDir, epStem, deletedFiles);
    }

    if (epDir && path.resolve(epDir) !== path.resolve(NAS_ROOT)) {
      await removeDirIfNoVideosRemain(epDir, deletedFiles);
    }
  }

  show.episodes.splice(epIdx, 1);
  const seasonsSet = new Set(show.episodes.map((e) => e.season).filter((s) => s > 0));
  show.seasonCount = seasonsSet.size || (show.episodes.length > 0 ? 1 : 0);
  show.episodeCount = show.episodes.length;

  updateLibraryStats();
  await saveCache(library);

  res.json({
    message: `Episodio S${String(ep.season).padStart(2, '0')}E${String(ep.episode).padStart(2, '0')} "${ep.title}" eliminato.`,
    deletedFiles,
    episodeCount: show.episodeCount,
    seasonCount: show.seasonCount,
    stats: library.stats,
  });
});

// Elimina uno specifico file video sul NAS (es. episodio senza .nfo o file multiplo)
app.delete('/api/media/:id/video-file', async (req, res) => {
  const item = library.items.find((x) => x.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Elemento non trovato' });
  }

  const videoPath = req.query.path ? String(req.query.path) : '';
  if (!videoPath || !isSafeNasPath(videoPath)) {
    return res.status(400).json({ error: 'Percorso file video non valido' });
  }

  const deletedFiles = [];
  const dirPath = path.dirname(videoPath);
  const stem = extractFileStem(videoPath);

  await deleteFileIfSafe(videoPath, deletedFiles);
  if (dirPath && stem) {
    await deleteCompanionFiles(dirPath, stem, deletedFiles);
  }

  // Se corrispondeva a un episodio della serie, rimuovilo anche da show.episodes
  if (item.type === 'tvshow' && Array.isArray(item.episodes)) {
    const epIdx = item.episodes.findIndex(
      (e) => e.videoPath && e.videoPath.toLowerCase() === videoPath.toLowerCase()
    );
    if (epIdx !== -1) {
      item.episodes.splice(epIdx, 1);
      const seasonsSet = new Set(item.episodes.map((e) => e.season).filter((s) => s > 0));
      item.seasonCount = seasonsSet.size || (item.episodes.length > 0 ? 1 : 0);
      item.episodeCount = item.episodes.length;
    }
  }

  updateLibraryStats();
  await saveCache(library);

  res.json({
    message: `File video eliminato: ${path.basename(videoPath)}`,
    deletedFiles,
    stats: library.stats,
  });
});

// Scansiona i file video non ancora associati a un file .archos.nfo valido
app.get('/api/unmatched', async (_req, res) => {
  try {
    const creds = getTmdbCredentials();
    const unmatched = await scanUnmatchedVideos(NAS_ROOT, library.items);
    const missingNfoCount = unmatched.filter((x) => x.status === 'missing_nfo').length;
    const missingArchosCount = unmatched.filter((x) => x.status === 'missing_archos').length;

    res.json({
      tmdbConfigured: creds.configured,
      hasApiKey: Boolean(creds.apiKey),
      hasReadAccessToken: Boolean(creds.readAccessToken),
      total: unmatched.length,
      missingNfoCount,
      missingArchosCount,
      items: unmatched,
    });
  } catch (err) {
    console.error('[Unmatched] Errore scansione file senza NFO:', err);
    res.status(500).json({ error: err.message || 'Errore scansione file senza NFO' });
  }
});

// Ricerca su TMDb usando TMDB_API_KEY o TMDB_READ_ACCESS_TOKEN da .env
app.get('/api/tmdb/search', async (req, res) => {
  try {
    const { q = '', year = '', type = 'movie' } = req.query;
    if (!String(q).trim()) {
      return res.json({ results: [] });
    }
    const results = await searchTmdb({
      query: String(q).trim(),
      year: year ? String(year).trim() : '',
      type: String(type),
    });
    res.json({ results });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Recupera dettagli completi da TMDb per anteprima/modifica prima del salvataggio
app.get('/api/tmdb/details', async (req, res) => {
  try {
    const { tmdbId = '', type = 'movie', season = '1', episode = '1' } = req.query;
    if (!tmdbId) {
      return res.status(400).json({ error: 'Parametro tmdbId mancante' });
    }
    const details = await fetchTmdbFullDetails({
      tmdbId: String(tmdbId),
      type: String(type),
      season: parseInt(String(season), 10) || 1,
      episode: parseInt(String(episode), 10) || 1,
    });
    res.json(details);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Genera il file .archos.nfo e le locandine compatibili con Nova Video Player sul NAS
app.post('/api/unmatched/generate', async (req, res) => {
  try {
    const {
      videoPath,
      type = 'movie',
      tmdbId = '',
      season = 1,
      episode = 1,
      customMeta = null,
    } = req.body || {};

    const resolvedVideoPath = toRuntimeNasPath(videoPath);
    if (!resolvedVideoPath || !isSafeNasPath(resolvedVideoPath)) {
      return res.status(400).json({ error: 'Percorso file video non valido' });
    }

    let movieMeta = null;
    let showMeta = null;
    let episodeMeta = null;

    if (tmdbId) {
      const tmdbDetails = await fetchTmdbFullDetails({
        tmdbId: String(tmdbId),
        type,
        season: Number(season) || 1,
        episode: Number(episode) || 1,
      });
      movieMeta = tmdbDetails.movieMeta || null;
      showMeta = tmdbDetails.showMeta || null;
      episodeMeta = tmdbDetails.episodeMeta || null;
    }

    // Applica eventuali modifiche/campi personalizzati o usa customMeta per creazione manuale / conversione da .nfo standard
    if (type === 'movie') {
      movieMeta = {
        ...(movieMeta || {}),
        ...(customMeta || {}),
      };
      if (!movieMeta.title) {
        return res.status(400).json({ error: 'Il titolo del film è obbligatorio' });
      }
    } else if (type === 'episode') {
      episodeMeta = {
        ...(episodeMeta || {}),
        ...(customMeta || {}),
        season: Number(customMeta?.season ?? season ?? episodeMeta?.season ?? 1),
        episode: Number(customMeta?.episode ?? episode ?? episodeMeta?.episode ?? 1),
      };
      if (!episodeMeta.title) {
        episodeMeta.title = `Episodio ${episodeMeta.episode}`;
      }
      if (customMeta?.showTitle && !episodeMeta.showTitle) {
        episodeMeta.showTitle = customMeta.showTitle;
      }
      if (!showMeta && episodeMeta.showTitle) {
        showMeta = {
          title: episodeMeta.showTitle,
          plot: episodeMeta.plot || '',
          rating: episodeMeta.rating || null,
          tmdbId: episodeMeta.tmdbId || '',
          imdbId: episodeMeta.imdbId || '',
          genres: customMeta?.genres || [],
          actors: episodeMeta.actors || [],
          posters: customMeta?.posterUrl ? [customMeta.posterUrl] : [],
          backdrops: customMeta?.backdropUrl ? [customMeta.backdropUrl] : [],
        };
      }
    }

    const writeResult = await writeNovaFilesToNas({
      videoPath: resolvedVideoPath,
      type,
      movieMeta,
      showMeta,
      episodeMeta,
    });

    // Aggiorna immediatamente il catalogo in memoria e la cache
    let fileTimestampMs = Date.now();
    try {
      const st = await fs.stat(resolvedVideoPath);
      fileTimestampMs = Math.round(st.mtimeMs || st.birthtimeMs || Date.now());
    } catch {
      // ignore
    }
    const fileDate = new Date(fileTimestampMs).toISOString();
    const dirPath = path.dirname(resolvedVideoPath);
    const ext = path.extname(resolvedVideoPath);

    if (type === 'movie' && movieMeta) {
      const newMovieId = crypto
        .createHash('md5')
        .update(`movie::${writeResult.nfoPath}`.toLowerCase())
        .digest('hex')
        .slice(0, 16);

      const newMovieEntry = {
        id: newMovieId,
        type: 'movie',
        title: movieMeta.title,
        originalTitle: movieMeta.originalTitle || '',
        tagline: '',
        overview: movieMeta.outline || movieMeta.overview || '',
        rating: movieMeta.rating ? Number(movieMeta.rating) : null,
        criticRating: null,
        year: movieMeta.year ? Number(movieMeta.year) : null,
        premiered: '',
        runtime: movieMeta.runtime ? Number(movieMeta.runtime) : null,
        mpaa: movieMeta.mpaa || '',
        imdbId: movieMeta.imdbId || '',
        tmdbId: movieMeta.tmdbId || '',
        directors: movieMeta.directors || [],
        writers: movieMeta.writers || [],
        genres: movieMeta.genres || [],
        studios: movieMeta.studios || [],
        countries: [],
        tags: [],
        actors: movieMeta.actors || [],
        trailers: [],
        posterPath: fsSync.existsSync(writeResult.posterPath) ? writeResult.posterPath : '',
        fanartPath: fsSync.existsSync(writeResult.fanartPath) ? writeResult.fanartPath : '',
        logoPath: '',
        remotePoster: movieMeta.posterUrl || movieMeta.posters?.[0] || '',
        remoteFanart: movieMeta.backdropUrl || movieMeta.backdrops?.[0] || '',
        folderPath: dirPath,
        nfoPath: writeResult.nfoPath,
        hasArchosNfo: true,
        videoPath: resolvedVideoPath,
        videoFileName: path.basename(resolvedVideoPath),
        videoFormat: ext.slice(1).toUpperCase(),
        dateAdded: fileDate,
        fileTimestampMs,
        fileDate,
      };

      const existingIdx = library.items.findIndex(
        (x) =>
          x.id === newMovieId ||
          (x.videoPath && x.videoPath.toLowerCase() === resolvedVideoPath.toLowerCase())
      );
      if (existingIdx !== -1) {
        library.items[existingIdx] = newMovieEntry;
      } else {
        library.items.push(newMovieEntry);
      }
    } else if (type === 'episode' && episodeMeta) {
      const seriesRoot = resolveSeriesRootFolder(NAS_ROOT, dirPath);
      let show = library.items.find(
        (x) =>
          x.type === 'tvshow' &&
          ((showMeta?.tmdbId && String(x.tmdbId) === String(showMeta.tmdbId)) ||
            (x.folderPath && x.folderPath.toLowerCase() === seriesRoot.toLowerCase()) ||
            (episodeMeta.showTitle &&
              x.title.toLowerCase() === episodeMeta.showTitle.toLowerCase()))
      );

      const newEp = {
        id: crypto
          .createHash('md5')
          .update(`ep::${writeResult.nfoPath}`.toLowerCase())
          .digest('hex')
          .slice(0, 16),
        title: episodeMeta.title,
        season: Number(episodeMeta.season) || 1,
        episode: Number(episodeMeta.episode) || 1,
        overview: episodeMeta.plot || '',
        rating: episodeMeta.rating ? Number(episodeMeta.rating) : null,
        aired: episodeMeta.aired || '',
        runtime: null,
        directors: episodeMeta.directors || [],
        writers: episodeMeta.writers || [],
        videoPath: resolvedVideoPath,
        videoFileName: path.basename(resolvedVideoPath),
        nfoPath: writeResult.nfoPath,
        fileTimestampMs,
        fileDate,
      };

      if (!show) {
        const showId = crypto
          .createHash('md5')
          .update(`tvshow::${seriesRoot}`.toLowerCase())
          .digest('hex')
          .slice(0, 16);
        show = {
          id: showId,
          type: 'tvshow',
          title: showMeta?.title || episodeMeta.showTitle || path.basename(seriesRoot),
          originalTitle: '',
          tagline: '',
          overview: showMeta?.plot || '',
          rating: showMeta?.rating ? Number(showMeta.rating) : null,
          criticRating: null,
          year: showMeta?.year || null,
          premiered: showMeta?.premiered || '',
          runtime: null,
          mpaa: showMeta?.mpaa || '',
          imdbId: showMeta?.imdbId || '',
          tmdbId: showMeta?.tmdbId || '',
          directors: episodeMeta.directors || [],
          writers: episodeMeta.writers || [],
          genres: showMeta?.genres || [],
          studios: showMeta?.studios || [],
          countries: [],
          tags: [],
          actors: showMeta?.actors || [],
          trailers: [],
          posterPath: '',
          fanartPath: '',
          logoPath: '',
          remotePoster: showMeta?.posters?.[0] || '',
          remoteFanart: showMeta?.backdrops?.[0] || '',
          folderPath: seriesRoot,
          folderPaths: [seriesRoot],
          nfoPath: writeResult.nfoPath,
          hasArchosNfo: true,
          dateAdded: fileDate,
          fileTimestampMs,
          fileDate,
          episodes: [newEp],
          seasonCount: 1,
          episodeCount: 1,
        };
        library.items.push(show);
      } else {
        show.episodes = (show.episodes || []).filter(
          (e) =>
            e.id !== newEp.id &&
            (!e.videoPath || e.videoPath.toLowerCase() !== resolvedVideoPath.toLowerCase())
        );
        show.episodes.push(newEp);
        show.episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
        const seasonsSet = new Set(show.episodes.map((e) => e.season).filter((s) => s > 0));
        show.seasonCount = seasonsSet.size || 1;
        show.episodeCount = show.episodes.length;
        if (fileTimestampMs > (show.fileTimestampMs || 0)) {
          show.fileTimestampMs = fileTimestampMs;
          show.fileDate = fileDate;
        }
      }
    }

    updateLibraryStats();
    await saveCache(library);

    res.json({
      message: `File .archos.nfo e locandine Nova Video Player creati con successo per "${
        movieMeta?.title || episodeMeta?.title
      }".`,
      createdFiles: writeResult.createdFiles,
      stats: library.stats,
    });
  } catch (err) {
    console.error('[GenerateNova] Errore:', err);
    res.status(500).json({ error: err.message || 'Errore creazione file .archos.nfo' });
  }
});

// Streaming sicuro delle locandine e fanart dal NAS
app.get('/api/image', (req, res) => {
  const rawImgPath = req.query.path ? String(req.query.path) : '';
  if (!rawImgPath) {
    return res.status(400).send('Parametro path mancante');
  }

  const resolvedImgPath = toRuntimeNasPath(rawImgPath);
  const normalizedReq = path.normalize(resolvedImgPath);
  const normalizedRoot = path.normalize(NAS_ROOT);

  if (!normalizedReq.toLowerCase().startsWith(normalizedRoot.toLowerCase())) {
    return res.status(403).send('Accesso negato fuori dalla cartella NAS');
  }

  const ext = path.extname(normalizedReq).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };

  const contentType = mimeMap[ext];
  if (!contentType) {
    return res.status(400).send('Formato immagine non supportato');
  }

  if (!fsSync.existsSync(normalizedReq)) {
    return res.status(404).send('Immagine non trovata');
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  const stream = fsSync.createReadStream(normalizedReq);
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).end();
  });
  stream.pipe(res);
});

async function start() {
  const hasCache = await loadCache();
  if (!hasCache) {
    console.log(`[Startup] Nessuna cache trovata. Avvio scansione iniziale di ${NAS_ROOT}...`);
    triggerScan();
  }

  app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`🎬 Movies-DB Backend attivo su http://localhost:${PORT}`);
    console.log(`📂 Cartella NAS: ${NAS_ROOT}`);
    console.log(`=================================================`);
  });
}

start();
