import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseNfoContent, mergeNfoData } from './nfoParser.js';

export const VIDEO_EXTENSIONS = new Set([
  '.mkv',
  '.mp4',
  '.avi',
  '.m4v',
  '.mov',
  '.wmv',
  '.ts',
  '.m2ts',
  '.mts',
  '.iso',
  '.webm',
  '.mpg',
  '.mpeg',
  '.mpe',
  '.mp2',
  '.mpv',
  '.mpv2',
  '.mp2v',
  '.m2v',
  '.flv',
  '.f4v',
  '.divx',
  '.xvid',
  '.ogv',
  '.ogm',
  '.ogg',
  '.vob',
  '.ifo',
  '.3gp',
  '.3g2',
  '.asf',
  '.rm',
  '.rmvb',
  '.tp',
  '.trp',
  '.evo',
  '.dat',
  '.nsv',
  '.wtv',
  '.dvr-ms',
  '.mk3d',
  '.qt',
  '.viv',
  '.h264',
  '.h265',
  '.hevc',
  '.av1',
  '.vp9',
  '.bivx',
  '.pva',
  '.nuv',
]);

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const IGNORED_DIRS = new Set([
  'subs',
  'subtitles',
  'featurettes',
  'extras',
  'sample',
  'samples',
  'behind the scenes',
  'deleted scenes',
  'interviews',
  'scenes',
  'shorts',
  'trailers',
  'other',
  'novels',
  'books',
  'ost',
  'soundtrack',
  '.recycle',
  '$recycle.bin',
  'system volume information',
]);

function makeId(input) {
  return crypto.createHash('md5').update(input.toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * Normalizes a genre string so common EN/IT duplicates map cleanly or stay tidy
 */
const GENRE_NORMALIZATION = {
  'action': 'Azione',
  'adventure': 'Avventura',
  'animation': 'Animazione',
  'comedy': 'Commedia',
  'crime': 'Crime',
  'documentary': 'Documentario',
  'drama': 'Dramma',
  'family': 'Famiglia',
  'fantasy': 'Fantasy',
  'history': 'Storia',
  'horror': 'Horror',
  'music': 'Musica',
  'mystery': 'Mistero',
  'romance': 'Romantico',
  'science fiction': 'Fantascienza',
  'sci-fi': 'Fantascienza',
  'tv movie': 'Film TV',
  'thriller': 'Thriller',
  'war': 'Guerra',
  'western': 'Western',
};

function normalizeGenres(genres = []) {
  const result = [];
  const seen = new Set();
  for (const g of genres) {
    // Split combined genres like "Sci-Fi & Fantasy" or "Action & Adventure" if desired, or keep clean
    const parts = g.split(/\s*&\s*/).map((s) => s.trim()).filter(Boolean);
    for (const raw of parts) {
      const mapped = GENRE_NORMALIZATION[raw.toLowerCase()] || raw;
      const key = mapped.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(mapped);
      }
    }
  }
  return result;
}

/**
 * Strips `.archos.nfo` or `.nfo` to get the stem name
 */
function getNfoStem(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.archos.nfo')) {
    return {
      stem: fileName.slice(0, -'.archos.nfo'.length),
      isArchos: true,
    };
  }
  if (lower.endsWith('.nfo')) {
    return {
      stem: fileName.slice(0, -'.nfo'.length),
      isArchos: false,
    };
  }
  return null;
}

/**
 * Cleans up a raw filename or folder name into a human-readable title and optional year
 */
export function parseCleanFilename(rawName) {
  const ext = path.extname(rawName).toLowerCase();
  const withoutExt = VIDEO_EXTENSIONS.has(ext) ? rawName.slice(0, -ext.length) : rawName;
  const base = withoutExt.replace(/^\[[^\]]+\]\s*/, '');
  const yearMatch = base.match(/[\(\[\.\s](19\d{2}|20\d{2})[\)\]\.\s]/);
  let year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  let titlePart = yearMatch ? base.slice(0, yearMatch.index) : base;
  titlePart = titlePart
    .replace(/[\._]/g, ' ')
    .replace(/\s*-\s*Season\s*\d+.*$/i, '')
    .replace(/\s+S\d{2}.*$/i, '')
    .replace(/[\(\[\{].*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    title: titlePart || rawName,
    year,
  };
}

/**
 * Finds local poster, fanart, and logo images in a directory for a given stem
 */
function findLocalArtwork(stem, dirMap, parentDirMap = null) {
  const stemLower = stem.toLowerCase();
  // If stem ends with -tvshow, also try without -tvshow
  const cleanStemLower = stemLower.replace(/-tvshow$/, '');

  const getFile = (map, candidateLower) => {
    if (!map) return null;
    return map.get(candidateLower) || null;
  };

  const posterCandidates = [
    `${stemLower}-poster.archos.jpg`,
    `${cleanStemLower}-poster.archos.jpg`,
    `${stemLower}-poster.jpg`,
    `${cleanStemLower}-poster.jpg`,
    `${stemLower}-poster.png`,
    `${cleanStemLower}-poster.png`,
    `${stemLower}.archos.jpg`,
    `${stemLower}.jpg`,
    `${cleanStemLower}.jpg`,
    `${cleanStemLower}-season01.archos.jpg`,
    `poster.archos.jpg`,
    `poster.jpg`,
    `poster.png`,
    `folder.jpg`,
    `cover.jpg`,
  ];

  const fanartCandidates = [
    `${stemLower}-fanart.archos.jpg`,
    `${cleanStemLower}-fanart.archos.jpg`,
    `${stemLower}-backdrop.jpg`,
    `${cleanStemLower}-backdrop.jpg`,
    `${stemLower}-fanart.jpg`,
    `${cleanStemLower}-fanart.jpg`,
    `${stemLower}-landscape.jpg`,
    `${cleanStemLower}-landscape.jpg`,
    `fanart.archos.jpg`,
    `fanart.jpg`,
    `backdrop.jpg`,
    `landscape.jpg`,
  ];

  const logoCandidates = [
    `${stemLower}-logo.png`,
    `${cleanStemLower}-logo.png`,
    `logo.png`,
    `clearlogo.png`,
  ];

  let posterPath = null;
  for (const c of posterCandidates) {
    posterPath = getFile(dirMap, c) || getFile(parentDirMap, c);
    if (posterPath) break;
  }

  let fanartPath = null;
  for (const c of fanartCandidates) {
    fanartPath = getFile(dirMap, c) || getFile(parentDirMap, c);
    if (fanartPath) break;
  }

  let logoPath = null;
  for (const c of logoCandidates) {
    logoPath = getFile(dirMap, c) || getFile(parentDirMap, c);
    if (logoPath) break;
  }

  // Fallback for dedicated movie/show folders: pick any *-poster.archos.jpg or *-fanart.archos.jpg if only one movie is inside
  if (!posterPath && dirMap) {
    for (const [nameLower, fullPath] of dirMap.entries()) {
      if (nameLower.endsWith('-poster.archos.jpg') || nameLower.endsWith('-poster.jpg')) {
        posterPath = fullPath;
        break;
      }
    }
  }
  if (!fanartPath && dirMap) {
    for (const [nameLower, fullPath] of dirMap.entries()) {
      if (
        nameLower.endsWith('-fanart.archos.jpg') ||
        nameLower.endsWith('-backdrop.jpg') ||
        nameLower.endsWith('-fanart.jpg')
      ) {
        fanartPath = fullPath;
        break;
      }
    }
  }

  return { posterPath, fanartPath, logoPath };
}

/**
 * Finds the matching video file for a stem in a directory
 */
function findVideoFile(stem, videoFilesInDir) {
  if (!videoFilesInDir || videoFilesInDir.length === 0) return null;
  const stemLower = stem.toLowerCase();
  for (const vf of videoFilesInDir) {
    const ext = path.extname(vf.name);
    const vfStem = vf.name.slice(0, -ext.length).toLowerCase();
    if (vfStem === stemLower) {
      return vf;
    }
  }
  // If directory has exactly 1 video file and this isn't the root NAS folder, return it
  if (videoFilesInDir.length === 1) {
    return videoFilesInDir[0];
  }
  return null;
}

/**
 * Scans the NAS Movies root folder and builds the normalized library of movies and TV shows.
 */
export async function scanNasDirectory(nasRoot, onProgress = () => {}) {
  const startTime = Date.now();
  const dirFileMaps = new Map(); // dirPath -> Map<lowerFileName, fullPath>
  const dirVideoFiles = new Map(); // dirPath -> Array<{ name, fullPath }>
  const nfoGroups = new Map(); // `${dirPath}::${stemLower}` -> { dirPath, stem, archosPath, stdPath }

  let scannedDirs = 0;
  let totalNfoFiles = 0;

  async function walk(currentDir, depth = 0) {
    if (depth > 4) return;
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    scannedDirs++;
    if (scannedDirs % 25 === 0) {
      onProgress({
        phase: 'walking',
        scannedDirs,
        totalNfoFiles,
        message: `Esplorazione cartelle (${scannedDirs} cartelle, ${totalNfoFiles} file .nfo trovati)...`,
      });
    }

    const fileMap = new Map();
    const videos = [];
    const subDirs = [];

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name.toLowerCase()) && !entry.name.startsWith('.')) {
          subDirs.push(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) continue;
      const lowerName = entry.name.toLowerCase();
      const ext = path.extname(lowerName);

      if (IMAGE_EXTENSIONS.has(ext)) {
        fileMap.set(lowerName, fullPath);
      } else if (VIDEO_EXTENSIONS.has(ext)) {
        videos.push({ name: entry.name, fullPath, ext: ext.slice(1).toUpperCase() });
      } else if (lowerName.endsWith('.nfo')) {
        totalNfoFiles++;
        const info = getNfoStem(entry.name);
        if (info) {
          const groupKey = `${currentDir}::${info.stem.toLowerCase()}`;
          let group = nfoGroups.get(groupKey);
          if (!group) {
            group = {
              dirPath: currentDir,
              stem: info.stem,
              archosPath: null,
              stdPath: null,
            };
            nfoGroups.set(groupKey, group);
          }
          if (info.isArchos) {
            group.archosPath = fullPath;
            group.stem = info.stem; // Keep casing from archos file
          } else {
            group.stdPath = fullPath;
          }
        }
      }
    }

    dirFileMaps.set(currentDir, fileMap);
    dirVideoFiles.set(currentDir, videos);

    // Traverse subdirectories with bounded concurrency
    const CONCURRENCY = 8;
    for (let i = 0; i < subDirs.length; i += CONCURRENCY) {
      const chunk = subDirs.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map((d) => walk(d, depth + 1)));
    }
  }

  onProgress({
    phase: 'walking',
    scannedDirs: 0,
    totalNfoFiles: 0,
    message: `Avvio scansione di ${nasRoot}...`,
  });

  await walk(nasRoot, 0);

  const groupsArray = Array.from(nfoGroups.values());
  const movies = [];
  const tvShowsMap = new Map(); // showKey -> tvShow object
  const orphanEpisodes = [];

  let processedGroups = 0;
  const PARSE_CONCURRENCY = 20;

  /**
   * Determines the series root folder inside nasRoot for grouping TV shows
   * (supports 2-level category containers like \\storagepi\NAS\Movies\CD\<Category>\<SeriesName>)
   */
  function getTopLevelFolder(dirPath) {
    const rel = path.relative(nasRoot, dirPath);
    if (!rel || rel === '' || rel.startsWith('..')) return dirPath;
    const parts = rel.split(path.sep).filter(Boolean);
    if (parts.length === 0) return dirPath;
    if (parts[0].toLowerCase() === 'cd' && parts.length >= 3) {
      return path.join(nasRoot, parts[0], parts[1], parts[2]);
    }
    if (parts[0].toLowerCase() === 'cd' && parts.length === 2) {
      return path.join(nasRoot, parts[0], parts[1]);
    }
    return path.join(nasRoot, parts[0]);
  }

  for (let i = 0; i < groupsArray.length; i += PARSE_CONCURRENCY) {
    const batch = groupsArray.slice(i, i + PARSE_CONCURRENCY);
    await Promise.all(
      batch.map(async (group) => {
        let archosParsed = null;
        let stdParsed = null;

        if (group.archosPath) {
          try {
            const raw = await fs.readFile(group.archosPath, 'utf8');
            archosParsed = parseNfoContent(raw);
          } catch {
            // ignore read error
          }
        }
        if (group.stdPath) {
          try {
            const raw = await fs.readFile(group.stdPath, 'utf8');
            stdParsed = parseNfoContent(raw);
          } catch {
            // ignore read error
          }
        }

        const kind = archosParsed?.kind || stdParsed?.kind;
        if (!kind) return;

        const merged = mergeNfoData(archosParsed?.data, stdParsed?.data);
        merged.genres = normalizeGenres(merged.genres);

        const dirMap = dirFileMaps.get(group.dirPath);
        const topFolder = getTopLevelFolder(group.dirPath);
        const parentDirMap = topFolder !== group.dirPath ? dirFileMaps.get(topFolder) : null;
        const { posterPath, fanartPath, logoPath } = findLocalArtwork(
          group.stem,
          dirMap,
          parentDirMap
        );

        const isRootDir = path.resolve(group.dirPath) === path.resolve(nasRoot);
        const videosInDir = dirVideoFiles.get(group.dirPath) || [];
        let videoFile = null;
        if (!isRootDir) {
          videoFile = findVideoFile(group.stem, videosInDir);
        } else {
          // In root dir, only match exact stem
          const stemLower = group.stem.toLowerCase();
          videoFile =
            videosInDir.find((v) => {
              const ext = path.extname(v.name);
              return v.name.slice(0, -ext.length).toLowerCase() === stemLower;
            }) || null;
        }

        const nfoFilePath = group.archosPath || group.stdPath;
        const statTarget = videoFile?.fullPath || nfoFilePath;
        let fileTimestampMs = 0;
        if (statTarget) {
          try {
            const st = await fs.stat(statTarget);
            fileTimestampMs = Math.round(st.mtimeMs || st.birthtimeMs || 0);
          } catch {
            // ignore stat error
          }
        }
        const fileDate = fileTimestampMs > 0 ? new Date(fileTimestampMs).toISOString() : '';

        if (kind === 'movie') {
          const fallback = parseCleanFilename(group.stem);
          const title = merged.title || fallback.title;
          const year = merged.year || fallback.year;

          movies.push({
            id: makeId(`movie::${nfoFilePath}`),
            type: 'movie',
            title,
            originalTitle: merged.originalTitle || '',
            tagline: merged.tagline || '',
            overview: merged.overview || '',
            rating: merged.rating,
            criticRating: merged.criticRating,
            year,
            premiered: merged.premiered || '',
            runtime: merged.runtime,
            mpaa: merged.mpaa || '',
            imdbId: merged.imdbId || '',
            tmdbId: merged.tmdbId || '',
            directors: merged.directors || [],
            writers: merged.writers || [],
            genres: merged.genres || [],
            studios: merged.studios || [],
            countries: merged.countries || [],
            tags: merged.tags || [],
            actors: merged.actors || [],
            trailers: merged.trailers || [],
            posterPath: posterPath || '',
            fanartPath: fanartPath || '',
            logoPath: logoPath || '',
            remotePoster: merged.remotePoster || '',
            remoteFanart: merged.remoteFanart || '',
            folderPath: group.dirPath,
            nfoPath: nfoFilePath,
            hasArchosNfo: Boolean(group.archosPath),
            videoPath: videoFile?.fullPath || '',
            videoFileName: videoFile?.name || '',
            videoFormat: videoFile?.ext || '',
            dateAdded: merged.dateAdded || '',
            fileTimestampMs,
            fileDate,
          });
        } else if (kind === 'tvshow') {
          const cleanStem = group.stem.replace(/-tvshow$/i, '');
          const fallback = parseCleanFilename(cleanStem);
          const title = merged.title || fallback.title;
          const showKey = topFolder.toLowerCase();

          const existing = tvShowsMap.get(showKey);
          if (!existing) {
            tvShowsMap.set(showKey, {
              id: makeId(`tvshow::${topFolder}`),
              type: 'tvshow',
              title,
              originalTitle: merged.originalTitle || '',
              tagline: merged.tagline || '',
              overview: merged.overview || '',
              rating: merged.rating,
              criticRating: merged.criticRating,
              year: merged.year || fallback.year,
              premiered: merged.premiered || '',
              runtime: merged.runtime,
              mpaa: merged.mpaa || '',
              imdbId: merged.imdbId || '',
              tmdbId: merged.tmdbId || '',
              directors: merged.directors || [],
              writers: merged.writers || [],
              genres: merged.genres || [],
              studios: merged.studios || [],
              countries: merged.countries || [],
              tags: merged.tags || [],
              actors: merged.actors || [],
              trailers: merged.trailers || [],
              posterPath: posterPath || '',
              fanartPath: fanartPath || '',
              logoPath: logoPath || '',
              remotePoster: merged.remotePoster || '',
              remoteFanart: merged.remoteFanart || '',
              folderPath: topFolder,
              nfoPath: nfoFilePath,
              hasArchosNfo: Boolean(group.archosPath),
              dateAdded: merged.dateAdded || '',
              fileTimestampMs,
              fileDate,
              episodes: [],
            });
          } else {
            // Enrich existing tvshow entry
            if (!existing.overview && merged.overview) existing.overview = merged.overview;
            if (!existing.posterPath && posterPath) existing.posterPath = posterPath;
            if (!existing.fanartPath && fanartPath) existing.fanartPath = fanartPath;
            if (!existing.logoPath && logoPath) existing.logoPath = logoPath;
            if (!existing.remotePoster && merged.remotePoster)
              existing.remotePoster = merged.remotePoster;
            if (!existing.remoteFanart && merged.remoteFanart)
              existing.remoteFanart = merged.remoteFanart;
            if (fileTimestampMs > (existing.fileTimestampMs || 0)) {
              existing.fileTimestampMs = fileTimestampMs;
              existing.fileDate = fileDate;
            }
          }
        } else if (kind === 'episodedetails') {
          const showKey = topFolder.toLowerCase();
          orphanEpisodes.push({
            showKey,
            topFolder,
            dirPath: group.dirPath,
            stem: group.stem,
            nfoPath: nfoFilePath,
            posterPath,
            fanartPath,
            videoFile,
            fileTimestampMs,
            fileDate,
            merged,
          });
        }
      })
    );

    processedGroups += batch.length;
    if (processedGroups % 100 === 0 || processedGroups === groupsArray.length) {
      onProgress({
        phase: 'parsing',
        processedGroups,
        totalGroups: groupsArray.length,
        message: `Analisi file .nfo (${processedGroups}/${groupsArray.length})...`,
      });
    }
  }

  // Attach episodes to TV shows (creating synthetic TV show entries if a folder only had episode NFOs)
  for (const ep of orphanEpisodes) {
    let show = tvShowsMap.get(ep.showKey);
    if (!show) {
      const folderName = path.basename(ep.topFolder);
      const fallback = parseCleanFilename(folderName);
      const title = ep.merged.showTitle || fallback.title;
      show = {
        id: makeId(`tvshow::${ep.topFolder}`),
        type: 'tvshow',
        title,
        originalTitle: '',
        tagline: '',
        overview: '',
        rating: ep.merged.rating,
        criticRating: null,
        year: ep.merged.year || fallback.year,
        premiered: ep.merged.premiered || '',
        runtime: ep.merged.runtime,
        mpaa: ep.merged.mpaa || '',
        imdbId: ep.merged.imdbId || '',
        tmdbId: '',
        directors: [],
        writers: [],
        genres: ep.merged.genres || [],
        studios: ep.merged.studios || [],
        countries: [],
        tags: [],
        actors: [],
        trailers: [],
        posterPath: ep.posterPath || '',
        fanartPath: ep.fanartPath || '',
        logoPath: '',
        remotePoster: ep.merged.remotePoster || '',
        remoteFanart: ep.merged.remoteFanart || '',
        folderPath: ep.topFolder,
        nfoPath: ep.nfoPath,
        hasArchosNfo: true,
        dateAdded: '',
        episodes: [],
      };
      tvShowsMap.set(ep.showKey, show);
    }

    // Merge episode directors, writers, and main actors into the parent show for searchability
    for (const d of ep.merged.directors || []) {
      if (!show.directors.some((x) => x.toLowerCase() === d.toLowerCase())) {
        show.directors.push(d);
      }
    }
    for (const w of ep.merged.writers || []) {
      if (!show.writers.some((x) => x.toLowerCase() === w.toLowerCase())) {
        show.writers.push(w);
      }
    }
    for (const a of (ep.merged.actors || []).slice(0, 8)) {
      if (!show.actors.some((x) => x.name.toLowerCase() === a.name.toLowerCase())) {
        show.actors.push(a);
      }
    }
    if (!show.posterPath && ep.posterPath) show.posterPath = ep.posterPath;
    if (!show.fanartPath && ep.fanartPath) show.fanartPath = ep.fanartPath;
    if (!show.year && ep.merged.year) show.year = ep.merged.year;
    if ((ep.fileTimestampMs || 0) > (show.fileTimestampMs || 0)) {
      show.fileTimestampMs = ep.fileTimestampMs;
      show.fileDate = ep.fileDate;
    }

    show.episodes.push({
      id: makeId(`ep::${ep.nfoPath}`),
      title: ep.merged.title || ep.stem,
      season: ep.merged.season ?? 1,
      episode: ep.merged.episode ?? 0,
      overview: ep.merged.overview || '',
      rating: ep.merged.rating,
      aired: ep.merged.premiered || '',
      runtime: ep.merged.runtime,
      directors: ep.merged.directors || [],
      writers: ep.merged.writers || [],
      videoPath: ep.videoFile?.fullPath || '',
      videoFileName: ep.videoFile?.name || '',
      nfoPath: ep.nfoPath,
      fileTimestampMs: ep.fileTimestampMs || 0,
      fileDate: ep.fileDate || '',
    });
  }

  // Sort episodes inside each TV show and compute season/episode counts
  const tvShows = [];
  for (const show of tvShowsMap.values()) {
    show.episodes.sort((a, b) => {
      if (a.season !== b.season) return a.season - b.season;
      return a.episode - b.episode;
    });
    const seasonsSet = new Set(show.episodes.map((e) => e.season).filter((s) => s > 0));
    show.seasonCount = seasonsSet.size || (show.episodes.length > 0 ? 1 : 0);
    show.episodeCount = show.episodes.length;
    tvShows.push(show);
  }

  const allItems = [...movies, ...tvShows].sort((a, b) =>
    a.title.localeCompare(b.title, 'it', { sensitivity: 'base' })
  );

  const durationMs = Date.now() - startTime;
  onProgress({
    phase: 'done',
    totalItems: allItems.length,
    moviesCount: movies.length,
    tvShowsCount: tvShows.length,
    durationMs,
    message: `Scansione completata in ${(durationMs / 1000).toFixed(1)}s: ${movies.length} film e ${tvShows.length} serie TV.`,
  });

  return {
    scannedAt: new Date().toISOString(),
    nasRoot,
    durationMs,
    stats: {
      totalItems: allItems.length,
      moviesCount: movies.length,
      tvShowsCount: tvShows.length,
      totalEpisodesCount: orphanEpisodes.length,
      totalNfoFiles,
    },
    items: allItems,
  };
}
