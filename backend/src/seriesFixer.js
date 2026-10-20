import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseNfoContent } from './nfoParser.js';
import { parseCleanFilename } from './scanner.js';

function makeId(input) {
  return crypto.createHash('md5').update(input.toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * Extracts clean tt\d+ IMDb ID if valid
 */
export function normalizeImdbId(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const m = raw.match(/(tt\d{5,10})/i);
  return m ? m[1].toLowerCase() : '';
}

/**
 * Normalizes a series title for matching across seasons/releases
 */
export function normalizeSeriesTitle(title = '') {
  return title
    .toLowerCase()
    .replace(/\s*[-–:]?\s*(season|stagione|s)\s*\d+.*$/i, '')
    .replace(/\s+\b(19\d{2}|20\d{2})\b$/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function mergeUniqueStrings(a = [], b = []) {
  const out = [...a];
  const seen = new Set(a.map((x) => x.toLowerCase()));
  for (const item of b) {
    if (!item) continue;
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function mergeActors(a = [], b = []) {
  const out = [...a];
  const seen = new Set(a.map((x) => x.name.toLowerCase()));
  for (const actor of b) {
    if (!actor?.name) continue;
    const key = actor.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(actor);
    }
  }
  return out;
}

/**
 * Determines the actual series folder for a path inside nasRoot,
 * handling 2-level category folders like \\storagepi\NAS\Movies\CD\<Category>\<SeriesName>
 */
export function resolveSeriesRootFolder(nasRoot, targetDirPath) {
  const rel = path.relative(nasRoot, targetDirPath);
  if (!rel || rel === '' || rel.startsWith('..')) return targetDirPath;
  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.length === 0) return targetDirPath;

  // Se la prima cartella è un contenitore di categorie (es. "CD" o "Scifi"), usa il livello della serie
  if (parts[0].toLowerCase() === 'cd' && parts.length >= 3) {
    return path.join(nasRoot, parts[0], parts[1], parts[2]);
  }
  if (parts[0].toLowerCase() === 'cd' && parts.length === 2) {
    return path.join(nasRoot, parts[0], parts[1]);
  }
  return path.join(nasRoot, parts[0]);
}

/**
 * Splits any wrongly-grouped container show (such as \\storagepi\NAS\Movies\CD)
 * into its actual constituent TV shows by inspecting episode paths and their folder's tvshow NFO.
 */
async function expandContainerShows(tvShows, nasRoot) {
  const expanded = [];

  for (const show of tvShows) {
    const rel = path.relative(nasRoot, show.folderPath || '');
    const isContainerCd = rel.toLowerCase() === 'cd';

    if (!isContainerCd || !Array.isArray(show.episodes) || show.episodes.length === 0) {
      expanded.push(show);
      continue;
    }

    // Raggruppa gli episodi per la vera cartella della serie dentro CD\<Categoria>\<NomeSerie>
    const subShowGroups = new Map();
    for (const ep of show.episodes) {
      const epDir = path.dirname(ep.nfoPath || ep.videoPath || '');
      const realSeriesFolder = resolveSeriesRootFolder(nasRoot, epDir);
      const key = realSeriesFolder.toLowerCase();
      if (!subShowGroups.has(key)) {
        subShowGroups.set(key, {
          folderPath: realSeriesFolder,
          episodes: [],
        });
      }
      subShowGroups.get(key).episodes.push(ep);
    }

    for (const group of subShowGroups.values()) {
      const folderName = path.basename(group.folderPath);
      const fallback = parseCleanFilename(folderName);
      let meta = {
        title: fallback.title,
        originalTitle: '',
        tagline: '',
        overview: '',
        rating: null,
        year: fallback.year,
        premiered: '',
        runtime: null,
        mpaa: '',
        imdbId: '',
        tmdbId: '',
        directors: [],
        writers: [],
        genres: [],
        studios: [],
        countries: [],
        tags: [],
        actors: [],
        trailers: [],
        posterPath: '',
        fanartPath: '',
        logoPath: '',
        remotePoster: '',
        remoteFanart: '',
        nfoPath: group.episodes[0]?.nfoPath || '',
      };

      // Cerca eventuale *-tvshow.archos.nfo o tvshow.nfo e locandine nella cartella della serie
      try {
        const entries = await fs.readdir(group.folderPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          const lower = entry.name.toLowerCase();
          const full = path.join(group.folderPath, entry.name);
          if (lower.endsWith('-tvshow.archos.nfo') || lower === 'tvshow.nfo' || lower === 'tvshow.archos.nfo') {
            const raw = await fs.readFile(full, 'utf8');
            const parsed = parseNfoContent(raw);
            if (parsed?.data) {
              meta = {
                ...meta,
                ...parsed.data,
                title: parsed.data.title || meta.title,
                nfoPath: full,
              };
            }
          } else if (!meta.posterPath && (lower.endsWith('-poster.archos.jpg') || lower.endsWith('-poster.jpg') || lower === 'poster.jpg' || lower === 'folder.jpg')) {
            meta.posterPath = full;
          } else if (!meta.fanartPath && (lower.endsWith('-fanart.archos.jpg') || lower.endsWith('-backdrop.jpg') || lower === 'fanart.jpg')) {
            meta.fanartPath = full;
          }
        }
      } catch {
        // ignore
      }

      group.episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
      const seasonsSet = new Set(group.episodes.map((e) => e.season).filter((s) => s > 0));

      expanded.push({
        id: makeId(`tvshow::${group.folderPath}`),
        type: 'tvshow',
        ...meta,
        folderPath: group.folderPath,
        folderPaths: [group.folderPath],
        hasArchosNfo: true,
        episodes: group.episodes,
        seasonCount: seasonsSet.size || 1,
        episodeCount: group.episodes.length,
      });
    }
  }

  return expanded;
}

/**
 * Merges two TV show objects into a single unified TV show card
 */
function mergeTwoTvShows(target, source) {
  // Prefer cleaner folderPath (e.g. "\\storagepi\NAS\Movies\Murderbot" over "\\storagepi\NAS\Movies\Murderbot.S01E06...")
  const targetFolderScore =
    target.folderPath && !/S\d{2}E\d{2}|Season|Stagione/i.test(path.basename(target.folderPath))
      ? 1
      : 0;
  const sourceFolderScore =
    source.folderPath && !/S\d{2}E\d{2}|Season|Stagione/i.test(path.basename(source.folderPath))
      ? 1
      : 0;

  if (sourceFolderScore > targetFolderScore && source.folderPath) {
    target.folderPath = source.folderPath;
  }

  const allFolders = mergeUniqueStrings(
    target.folderPaths || (target.folderPath ? [target.folderPath] : []),
    source.folderPaths || (source.folderPath ? [source.folderPath] : [])
  );
  target.folderPaths = allFolders;

  if ((!target.overview || target.overview.length < (source.overview || '').length) && source.overview) {
    target.overview = source.overview;
  }
  if (!target.originalTitle && source.originalTitle) target.originalTitle = source.originalTitle;
  if (!target.tagline && source.tagline) target.tagline = source.tagline;
  if (!target.rating && source.rating) target.rating = source.rating;
  if (!target.year && source.year) target.year = source.year;
  if (!target.premiered && source.premiered) target.premiered = source.premiered;
  if (!target.runtime && source.runtime) target.runtime = source.runtime;
  if (!target.mpaa && source.mpaa) target.mpaa = source.mpaa;
  if (!target.imdbId && source.imdbId) target.imdbId = source.imdbId;
  if (!target.tmdbId && source.tmdbId) target.tmdbId = source.tmdbId;
  if (!target.posterPath && source.posterPath) target.posterPath = source.posterPath;
  if (!target.fanartPath && source.fanartPath) target.fanartPath = source.fanartPath;
  if (!target.logoPath && source.logoPath) target.logoPath = source.logoPath;
  if (!target.remotePoster && source.remotePoster) target.remotePoster = source.remotePoster;
  if (!target.remoteFanart && source.remoteFanart) target.remoteFanart = source.remoteFanart;
  if ((source.fileTimestampMs || 0) > (target.fileTimestampMs || 0)) {
    target.fileTimestampMs = source.fileTimestampMs;
    target.fileDate = source.fileDate;
  }

  target.directors = mergeUniqueStrings(target.directors, source.directors);
  target.writers = mergeUniqueStrings(target.writers, source.writers);
  target.genres = mergeUniqueStrings(target.genres, source.genres);
  target.studios = mergeUniqueStrings(target.studios, source.studios);
  target.countries = mergeUniqueStrings(target.countries, source.countries);
  target.tags = mergeUniqueStrings(target.tags, source.tags);
  target.trailers = mergeUniqueStrings(target.trailers, source.trailers);
  target.actors = mergeActors(target.actors, source.actors);

  // Merge & deduplicate episodes
  const epMap = new Map();
  for (const ep of [...(target.episodes || []), ...(source.episodes || [])]) {
    const epKey = ep.videoPath
      ? ep.videoPath.toLowerCase()
      : ep.nfoPath
        ? ep.nfoPath.toLowerCase()
        : `s${ep.season}e${ep.episode}_${ep.title}`;
    if (!epMap.has(epKey)) {
      epMap.set(epKey, ep);
    }
  }

  target.episodes = Array.from(epMap.values()).sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season;
    return a.episode - b.episode;
  });

  const seasonsSet = new Set(target.episodes.map((e) => e.season).filter((s) => s > 0));
  target.seasonCount = seasonsSet.size || (target.episodes.length > 0 ? 1 : 0);
  target.episodeCount = target.episodes.length;

  return target;
}

/**
 * Unifies split TV series cards and duplicate movie/miniseries cards in the library.
 */
export async function fixSeriesInLibrary(library) {
  const nasRoot = library.nasRoot || '\\\\storagepi\\NAS\\Movies';
  const rawMovies = library.items.filter((x) => x.type === 'movie');
  const rawTvShows = library.items.filter((x) => x.type === 'tvshow');

  // 1. Espandi eventuali serie accorpate nella cartella contenitore "CD"
  const expandedTvShows = await expandContainerShows(rawTvShows, nasRoot);

  // 2. Unifica le Serie TV che hanno stesso tmdbId, stesso imdbId valido o stesso titolo normalizzato
  const unifiedTvShows = [];
  const byTmdb = new Map();
  const byImdb = new Map();
  const byTitle = new Map();

  let mergedSeriesCardsCount = 0;
  const mergedSeriesNames = new Set();

  for (const show of expandedTvShows) {
    const cleanImdb = normalizeImdbId(show.imdbId);
    show.imdbId = cleanImdb || show.imdbId || '';
    const cleanTmdb = show.tmdbId ? String(show.tmdbId).trim() : '';
    const normTitle = normalizeSeriesTitle(show.title);

    if (!show.folderPaths) {
      show.folderPaths = show.folderPath ? [show.folderPath] : [];
    }

    let existing = null;
    if (cleanTmdb && byTmdb.has(cleanTmdb)) {
      existing = byTmdb.get(cleanTmdb);
    } else if (cleanImdb && byImdb.has(cleanImdb)) {
      existing = byImdb.get(cleanImdb);
    } else if (normTitle && byTitle.has(normTitle)) {
      const candidate = byTitle.get(normTitle);
      // Unisci per titolo solo se non hanno ID TMDb diversi tra loro (es. Star Trek 1966 vs Star Trek 1973)
      const conflictTmdb =
        cleanTmdb && candidate.tmdbId && String(candidate.tmdbId) !== cleanTmdb;
      const conflictImdb =
        cleanImdb && candidate.imdbId && normalizeImdbId(candidate.imdbId) !== cleanImdb;
      if (!conflictTmdb && !conflictImdb) {
        existing = candidate;
      }
    }

    if (existing) {
      mergeTwoTvShows(existing, show);
      mergedSeriesCardsCount++;
      mergedSeriesNames.add(existing.title);
    } else {
      unifiedTvShows.push(show);
      if (cleanTmdb) byTmdb.set(cleanTmdb, show);
      if (cleanImdb) byImdb.set(cleanImdb, show);
      if (normTitle) byTitle.set(normTitle, show);
    }
  }

  // 3. Controlla anche film multi-parte (es. "A come Andromeda Cd 1..5") o doppi NFO nella stessa cartella
  const unifiedMovies = [];
  const movieGroupMap = new Map();
  let mergedMovieCardsCount = 0;

  for (const movie of rawMovies) {
    // Rimuovi template NFO fittizi come "__title__"
    if (movie.title === '__title__' || movie.imdbId === '__id__') {
      mergedMovieCardsCount++;
      continue;
    }

    const cleanImdb = normalizeImdbId(movie.imdbId);
    movie.imdbId = cleanImdb || movie.imdbId || '';
    const cleanTmdb = movie.tmdbId ? String(movie.tmdbId).trim() : '';
    const isRootFolder =
      path.resolve(movie.folderPath || '') === path.resolve(nasRoot);

    // Se è in una sottocartella dedicata e condivide cartella + (imdbId o tmdbId o titolo), unisci
    const groupKey = !isRootFolder
      ? `${(movie.folderPath || '').toLowerCase()}::${
          cleanTmdb || cleanImdb || normalizeSeriesTitle(movie.title)
        }`
      : null;

    if (groupKey && movieGroupMap.has(groupKey)) {
      const existing = movieGroupMap.get(groupKey);
      // Preferisci il titolo italiano / da .archos.nfo
      if (movie.hasArchosNfo && !existing.hasArchosNfo && movie.title) {
        existing.title = movie.title;
        existing.hasArchosNfo = true;
      }
      if (!existing.overview && movie.overview) existing.overview = movie.overview;
      if (!existing.posterPath && movie.posterPath) existing.posterPath = movie.posterPath;
      if (!existing.fanartPath && movie.fanartPath) existing.fanartPath = movie.fanartPath;
      if (!existing.videoPath && movie.videoPath) {
        existing.videoPath = movie.videoPath;
        existing.videoFileName = movie.videoFileName;
        existing.videoFormat = movie.videoFormat;
      }
      if ((movie.fileTimestampMs || 0) > (existing.fileTimestampMs || 0)) {
        existing.fileTimestampMs = movie.fileTimestampMs;
        existing.fileDate = movie.fileDate;
      }
      existing.genres = mergeUniqueStrings(existing.genres, movie.genres);
      existing.directors = mergeUniqueStrings(existing.directors, movie.directors);
      existing.writers = mergeUniqueStrings(existing.writers, movie.writers);
      existing.actors = mergeActors(existing.actors, movie.actors);
      mergedMovieCardsCount++;
      mergedSeriesNames.add(existing.title);
    } else {
      unifiedMovies.push(movie);
      if (groupKey) movieGroupMap.set(groupKey, movie);
    }
  }

  const allItems = [...unifiedMovies, ...unifiedTvShows].sort((a, b) =>
    a.title.localeCompare(b.title, 'it', { sensitivity: 'base' })
  );

  const totalEpisodesCount = unifiedTvShows.reduce(
    (acc, s) => acc + (s.episodes?.length || 0),
    0
  );

  const updatedLibrary = {
    ...library,
    items: allItems,
    stats: {
      ...library.stats,
      totalItems: allItems.length,
      moviesCount: unifiedMovies.length,
      tvShowsCount: unifiedTvShows.length,
      totalEpisodesCount,
    },
  };

  return {
    library: updatedLibrary,
    report: {
      mergedSeriesCardsCount,
      mergedMovieCardsCount,
      totalMergedCards: mergedSeriesCardsCount + mergedMovieCardsCount,
      mergedTitles: Array.from(mergedSeriesNames).sort((a, b) =>
        a.localeCompare(b, 'it')
      ),
      moviesCount: unifiedMovies.length,
      tvShowsCount: unifiedTvShows.length,
    },
  };
}
