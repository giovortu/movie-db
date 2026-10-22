import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNfoContent } from './nfoParser.js';
import { parseCleanFilename } from './scanner.js';
import { resolveSeriesRootFolder } from './seriesFixer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

/**
 * Ricarica dinamicamente TMDB_API_KEY e TMDB_READ_ACCESS_TOKEN dai file .env
 * così modifiche al file .env vengono applicate anche senza riavviare il server.
 */
export function getTmdbCredentials() {
  for (const envCandidate of [
    path.resolve(__dirname, '..', '..', '.env'),
    path.resolve(__dirname, '..', '.env'),
  ]) {
    try {
      if (fsSync.existsSync(envCandidate)) {
        const raw = fsSync.readFileSync(envCandidate, 'utf8');
        for (const line of raw.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx === -1) continue;
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed
            .slice(eqIdx + 1)
            .trim()
            .replace(/^['"]|['"]$/g, '');
          if ((key === 'TMDB_API_KEY' || key === 'TMDB_READ_ACCESS_TOKEN') && val) {
            process.env[key] = val;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const apiKey = (process.env.TMDB_API_KEY || '').trim();
  const readAccessToken = (
    process.env.TMDB_READ_ACCESS_TOKEN ||
    process.env.TMDB_BEARER_TOKEN ||
    ''
  ).trim();

  return {
    apiKey,
    readAccessToken,
    configured: Boolean(apiKey || readAccessToken),
  };
}

/**
 * Esegue una richiesta alle API v3 di TMDb usando Read Access Token (Bearer) o API Key
 */
async function tmdbFetch(endpoint, queryParams = {}) {
  const { apiKey, readAccessToken, configured } = getTmdbCredentials();
  if (!configured) {
    throw new Error(
      'Credenziali TMDb mancanti. Inserisci TMDB_API_KEY o TMDB_READ_ACCESS_TOKEN nel file .env'
    );
  }

  const url = new URL(`https://api.themoviedb.org/3${endpoint}`);
  for (const [k, v] of Object.entries(queryParams)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }

  const headers = {
    Accept: 'application/json',
  };

  if (readAccessToken) {
    headers.Authorization = `Bearer ${readAccessToken}`;
  } else if (apiKey) {
    url.searchParams.set('api_key', apiKey);
  }

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Errore TMDb (${res.status}): ${errText || res.statusText}`);
  }
  return res.json();
}

/**
 * Estrae informazioni di episodio (SxxExx, 1x02, Cd X di Y) o di film dal nome del file e cartella
 */
export function analyzeVideoFilename(videoPath, nasRoot, existingTvShows = []) {
  const fileName = path.basename(videoPath);
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, -ext.length);
  const dirPath = path.dirname(videoPath);

  // Controlla pattern S01E03, 1x03, Ep 03, Cd 4 di 5
  const sxeMatch =
    stem.match(/\bS(\d{1,2})[\.\s_-]*E(\d{1,3})\b/i) ||
    stem.match(/\b(\d{1,2})x(\d{2,3})\b/i);
  const cdPartMatch = stem.match(/\b(?:Cd|Parte?|Ep(?:isode)?)\s*(\d{1,2})\s*(?:di|of)\s*(\d{1,2})\b/i);

  // Cerca se la cartella appartiene già a una Serie TV indicizzata
  const seriesFolder = resolveSeriesRootFolder(nasRoot, dirPath);
  const matchingShow = existingTvShows.find((s) => {
    const folders = [
      ...(s.folderPaths || []),
      ...(s.folderPath ? [s.folderPath] : []),
    ];
    return folders.some(
      (f) =>
        dirPath.toLowerCase().startsWith(f.toLowerCase()) ||
        f.toLowerCase() === seriesFolder.toLowerCase()
    );
  });

  if (sxeMatch || cdPartMatch || matchingShow) {
    const season = sxeMatch ? parseInt(sxeMatch[1], 10) : 1;
    const episode = sxeMatch
      ? parseInt(sxeMatch[2], 10)
      : cdPartMatch
        ? parseInt(cdPartMatch[1], 10)
        : 1;

    let rawShowPart = stem;
    if (sxeMatch) {
      rawShowPart = stem.slice(0, sxeMatch.index);
    } else if (cdPartMatch) {
      rawShowPart = stem.slice(0, cdPartMatch.index);
    }

    const parsed = parseCleanFilename(rawShowPart || path.basename(seriesFolder));
    return {
      detectedType: 'episode',
      stem,
      fileName,
      dirPath,
      parsedTitle: matchingShow?.title || parsed.title,
      parsedYear: matchingShow?.year || parsed.year,
      season,
      episode,
      matchedShow: matchingShow
        ? {
            id: matchingShow.id,
            title: matchingShow.title,
            tmdbId: matchingShow.tmdbId || '',
            imdbId: matchingShow.imdbId || '',
            year: matchingShow.year || null,
          }
        : null,
    };
  }

  // Film: usa il nome del file o della cartella dedicata
  const isRootDir = path.resolve(dirPath) === path.resolve(nasRoot);
  const parsedFromFile = parseCleanFilename(stem);
  const parsedFromFolder = !isRootDir
    ? parseCleanFilename(path.basename(dirPath))
    : { title: '', year: null };

  return {
    detectedType: 'movie',
    stem,
    fileName,
    dirPath,
    parsedTitle: parsedFromFile.title || parsedFromFolder.title || stem,
    parsedYear: parsedFromFile.year || parsedFromFolder.year || null,
    season: null,
    episode: null,
    matchedShow: null,
  };
}

/**
 * Scansiona la cartella NAS per individuare tutti i file video privi di .archos.nfo valido
 */
export async function scanUnmatchedVideos(nasRoot, libraryItems = []) {
  const unmatched = [];
  const existingTvShows = libraryItems.filter((x) => x.type === 'tvshow');

  async function walk(currentDir, depth = 0) {
    if (depth > 4) return;
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    const fileMap = new Map();
    const subDirs = [];
    const videos = [];

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name.toLowerCase()) && !entry.name.startsWith('.')) {
          subDirs.push(fullPath);
        }
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        fileMap.set(lower, fullPath);
        const ext = path.extname(lower);
        if (VIDEO_EXTENSIONS.has(ext)) {
          videos.push({ name: entry.name, fullPath, ext });
        }
      }
    }

    for (const v of videos) {
      const stem = v.name.slice(0, -v.ext.length);
      const stemLower = stem.toLowerCase();
      const archosNfoPath = fileMap.get(`${stemLower}.archos.nfo`);
      const stdNfoPath = fileMap.get(`${stemLower}.nfo`) || fileMap.get('movie.nfo');

      let hasValidArchosXml = false;
      if (archosNfoPath) {
        try {
          const raw = await fs.readFile(archosNfoPath, 'utf8');
          if (parseNfoContent(raw)) hasValidArchosXml = true;
        } catch {
          // ignore
        }
      }

      if (hasValidArchosXml) continue;

      // Controlla se esiste almeno un .nfo standard XML valido (es. Jellyfin/Kodi)
      let stdParsed = null;
      if (stdNfoPath) {
        try {
          const raw = await fs.readFile(stdNfoPath, 'utf8');
          stdParsed = parseNfoContent(raw);
        } catch {
          // ignore
        }
      }

      let sizeBytes = null;
      try {
        const st = await fs.stat(v.fullPath);
        sizeBytes = st.size;
      } catch {
        // ignore
      }

      const analysis = analyzeVideoFilename(v.fullPath, nasRoot, existingTvShows);

      unmatched.push({
        videoPath: v.fullPath,
        fileName: v.name,
        dirPath: currentDir,
        stem,
        sizeBytes,
        status: stdParsed ? 'missing_archos' : 'missing_nfo',
        hasSceneNfo: Boolean(stdNfoPath && !stdParsed),
        existingStdNfoPath: stdParsed ? stdNfoPath : '',
        existingStdData: stdParsed?.data || null,
        detectedType: stdParsed?.kind === 'episodedetails' ? 'episode' : analysis.detectedType,
        parsedTitle: stdParsed?.data?.title || analysis.parsedTitle,
        parsedYear: stdParsed?.data?.year || analysis.parsedYear,
        season: stdParsed?.data?.season ?? analysis.season,
        episode: stdParsed?.data?.episode ?? analysis.episode,
        matchedShow: analysis.matchedShow,
      });
    }

    const CONCURRENCY = 8;
    for (let i = 0; i < subDirs.length; i += CONCURRENCY) {
      const chunk = subDirs.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map((d) => walk(d, depth + 1)));
    }
  }

  await walk(nasRoot, 0);
  unmatched.sort((a, b) => a.fileName.localeCompare(b.fileName, 'it'));
  return unmatched;
}

/**
 * Ricerca film o serie TV su TMDb (in italiano con fallback inglese)
 */
export async function searchTmdb({ query, year, type = 'movie' }) {
  const endpoint = type === 'episode' || type === 'tvshow' ? '/search/tv' : '/search/movie';
  const params = {
    query,
    language: 'it-IT',
    include_adult: 'false',
  };
  if (year) {
    if (endpoint === '/search/movie') params.year = year;
    else params.first_air_date_year = year;
  }

  let data = await tmdbFetch(endpoint, params);
  // Se con l'anno non trova nulla, riprova senza filtro anno
  if ((!data.results || data.results.length === 0) && year) {
    delete params.year;
    delete params.first_air_date_year;
    data = await tmdbFetch(endpoint, params);
  }

  return (data.results || []).slice(0, 12).map((r) => {
    const releaseDate = r.release_date || r.first_air_date || '';
    const itemYear = releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : null;
    return {
      tmdbId: String(r.id),
      title: r.title || r.name || '',
      originalTitle: r.original_title || r.original_name || '',
      year: itemYear,
      rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
      overview: r.overview || '',
      posterUrl: r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : '',
      backdropUrl: r.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${r.backdrop_path}`
        : '',
    };
  });
}

/**
 * Recupera i metadati completi da TMDb per generare i file .archos.nfo e le immagini Nova Video Player
 */
export async function fetchTmdbFullDetails({ tmdbId, type = 'movie', season = 1, episode = 1 }) {
  if (type === 'episode' || type === 'tvshow') {
    const showData = await tmdbFetch(`/tv/${tmdbId}`, {
      language: 'it-IT',
      append_to_response: 'credits,content_ratings,external_ids,images',
      include_image_language: 'it,en,null',
    });

    let plot = showData.overview || '';
    if (!plot) {
      const enShow = await tmdbFetch(`/tv/${tmdbId}`, { language: 'en-US' }).catch(() => null);
      if (enShow?.overview) plot = enShow.overview;
    }

    const ratingList = showData.content_ratings?.results || [];
    const mpaaEntry =
      ratingList.find((r) => r.iso_3166_1 === 'IT') ||
      ratingList.find((r) => r.iso_3166_1 === 'US') ||
      ratingList[0];

    const posters = [
      ...(showData.poster_path ? [showData.poster_path] : []),
      ...(showData.images?.posters || []).map((p) => p.file_path),
    ]
      .filter(Boolean)
      .slice(0, 10)
      .map((p) => `https://image.tmdb.org/t/p/w342${p}`);

    const backdrops = [
      ...(showData.backdrop_path ? [showData.backdrop_path] : []),
      ...(showData.images?.backdrops || []).map((b) => b.file_path),
    ]
      .filter(Boolean)
      .slice(0, 10)
      .map((b) => `https://image.tmdb.org/t/p/w1280${b}`);

    const showMeta = {
      title: showData.name || showData.original_name || '',
      rating: showData.vote_average ? Math.round(showData.vote_average * 10) / 10 : null,
      plot,
      mpaa: mpaaEntry?.rating || '',
      premiered: showData.first_air_date || '',
      year: showData.first_air_date ? parseInt(showData.first_air_date.slice(0, 4), 10) : null,
      tmdbId: String(showData.id),
      imdbId: showData.external_ids?.imdb_id || '',
      genres: (showData.genres || []).map((g) => g.name),
      studios: (showData.networks || showData.production_companies || []).map((s) => s.name),
      actors: (showData.credits?.cast || []).slice(0, 20).map((c) => ({
        name: c.name,
        role: c.character || '',
      })),
      posters,
      backdrops,
    };

    if (type === 'tvshow') {
      return { showMeta, episodeMeta: null };
    }

    // Recupera anche i dettagli del singolo episodio
    let epData = await tmdbFetch(`/tv/${tmdbId}/season/${season}/episode/${episode}`, {
      language: 'it-IT',
      append_to_response: 'credits,external_ids',
    }).catch(() => null);

    if (epData && !epData.overview) {
      const enEp = await tmdbFetch(`/tv/${tmdbId}/season/${season}/episode/${episode}`, {
        language: 'en-US',
      }).catch(() => null);
      if (enEp?.overview) epData.overview = enEp.overview;
    }

    const epDirectors = (epData?.crew || [])
      .filter((c) => c.job === 'Director')
      .map((c) => c.name);
    const epWriters = (epData?.crew || [])
      .filter((c) => c.department === 'Writing' || ['Writer', 'Screenplay', 'Teleplay'].includes(c.job))
      .map((c) => c.name);

    const epActors = [
      ...(showMeta.actors || []),
      ...((epData?.guest_stars || []).slice(0, 15).map((g) => ({
        name: g.name,
        role: g.character || '',
      }))),
    ];

    const episodeMeta = {
      title: epData?.name || `Episodio ${episode}`,
      showTitle: showMeta.title,
      rating: epData?.vote_average
        ? Math.round(epData.vote_average * 10) / 10
        : showMeta.rating,
      season: Number(season) || 1,
      episode: Number(episode) || 1,
      plot: epData?.overview || showMeta.plot || '',
      mpaa: showMeta.mpaa || '',
      imdbId: epData?.external_ids?.imdb_id || showMeta.imdbId || '',
      tmdbId: String(epData?.id || showMeta.tmdbId),
      aired: epData?.air_date || showMeta.premiered || '',
      directors: epDirectors,
      writers: epWriters,
      actors: epActors,
    };

    return { showMeta, episodeMeta };
  }

  // Movie
  const movieData = await tmdbFetch(`/movie/${tmdbId}`, {
    language: 'it-IT',
    append_to_response: 'credits,release_dates,images,external_ids',
    include_image_language: 'it,en,null',
  });

  let outline = movieData.overview || '';
  if (!outline) {
    const enMovie = await tmdbFetch(`/movie/${tmdbId}`, { language: 'en-US' }).catch(() => null);
    if (enMovie?.overview) outline = enMovie.overview;
  }

  const relResults = movieData.release_dates?.results || [];
  const certContainer =
    relResults.find((r) => r.iso_3166_1 === 'IT') ||
    relResults.find((r) => r.iso_3166_1 === 'US') ||
    relResults[0];
  const mpaa =
    certContainer?.release_dates?.find((d) => d.certification)?.certification || 'NR';

  const directors = (movieData.credits?.crew || [])
    .filter((c) => c.job === 'Director')
    .map((c) => c.name);
  const writers = (movieData.credits?.crew || [])
    .filter((c) => c.department === 'Writing' || ['Screenplay', 'Writer', 'Story'].includes(c.job))
    .map((c) => c.name);

  const posters = Array.from(
    new Set(
      [
        ...(movieData.poster_path ? [movieData.poster_path] : []),
        ...(movieData.images?.posters || []).map((p) => p.file_path),
      ].filter(Boolean)
    )
  )
    .slice(0, 10)
    .map((p) => `https://image.tmdb.org/t/p/w342${p}`);

  const backdrops = Array.from(
    new Set(
      [
        ...(movieData.backdrop_path ? [movieData.backdrop_path] : []),
        ...(movieData.images?.backdrops || []).map((b) => b.file_path),
      ].filter(Boolean)
    )
  )
    .slice(0, 10)
    .map((b) => `https://image.tmdb.org/t/p/w1280${b}`);

  return {
    movieMeta: {
      title: movieData.title || movieData.original_title || '',
      rating: movieData.vote_average ? Math.round(movieData.vote_average * 10) / 10 : null,
      year: movieData.release_date ? parseInt(movieData.release_date.slice(0, 4), 10) : null,
      outline,
      runtime: movieData.runtime || null,
      mpaa,
      directors: Array.from(new Set(directors)),
      writers: Array.from(new Set(writers)),
      imdbId: movieData.imdb_id || movieData.external_ids?.imdb_id || '',
      tmdbId: String(movieData.id),
      studios: (movieData.production_companies || []).map((s) => s.name),
      genres: (movieData.genres || []).map((g) => g.name),
      actors: (movieData.credits?.cast || []).slice(0, 25).map((c) => ({
        name: c.name,
        role: c.character || '',
      })),
      posters,
      backdrops,
    },
  };
}

function escapeXml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Costruisce il contenuto XML di un file <stem>.archos.nfo per un Film (standard Nova Video Player)
 */
export function buildNovaMovieXml(meta) {
  const lines = [`<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>`, `<movie>`];
  if (meta.title) lines.push(`  <title>${escapeXml(meta.title)}</title>`);
  if (meta.rating !== undefined && meta.rating !== null && meta.rating !== '') {
    lines.push(`  <rating>${escapeXml(meta.rating)}</rating>`);
  }
  if (meta.year) lines.push(`  <year>${escapeXml(meta.year)}</year>`);
  if (meta.outline || meta.overview) {
    lines.push(`  <outline>${escapeXml(meta.outline || meta.overview)}</outline>`);
  }
  if (meta.runtime) lines.push(`  <runtime>${escapeXml(meta.runtime)}</runtime>`);
  if (meta.mpaa) lines.push(`  <mpaa>${escapeXml(meta.mpaa)}</mpaa>`);

  for (const d of meta.directors || []) {
    if (d) lines.push(`  <director>${escapeXml(d)}</director>`);
  }
  for (const w of meta.writers || []) {
    if (w) lines.push(`  <writer>${escapeXml(w)}</writer>`);
  }

  if (meta.imdbId) lines.push(`  <id>${escapeXml(meta.imdbId)}</id>`);
  if (meta.tmdbId) lines.push(`  <tmdbid>${escapeXml(meta.tmdbId)}</tmdbid>`);

  for (const s of meta.studios || []) {
    if (s) lines.push(`  <studio>${escapeXml(s)}</studio>`);
  }
  for (const g of meta.genres || []) {
    if (g) lines.push(`  <genre>${escapeXml(g)}</genre>`);
  }

  for (const a of meta.actors || []) {
    if (!a?.name) continue;
    lines.push(`  <actor>`);
    lines.push(`    <name>${escapeXml(a.name)}</name>`);
    lines.push(`    <role>${escapeXml(a.role || '')}</role>`);
    lines.push(`  </actor>`);
  }

  const posters = meta.posters || (meta.posterUrl ? [meta.posterUrl] : []);
  const backdrops = meta.backdrops || (meta.backdropUrl ? [meta.backdropUrl] : []);

  for (const p of posters) {
    lines.push(`  <thumb preview="${escapeXml(p)}">${escapeXml(p)}</thumb>`);
  }
  for (const b of backdrops) {
    lines.push(`  <thumb preview="${escapeXml(b)}">${escapeXml(b)}</thumb>`);
  }
  if (backdrops[0]) {
    lines.push(`  <fanart>`);
    lines.push(
      `    <thumb preview="${escapeXml(backdrops[0])}">${escapeXml(backdrops[0])}</thumb>`
    );
    lines.push(`  </fanart>`);
  }

  lines.push(`</movie>`);
  return lines.join('\n');
}

/**
 * Costruisce il contenuto XML di un file <Serie>-tvshow.archos.nfo per Nova Video Player
 */
export function buildNovaTvShowXml(showMeta) {
  const lines = [`<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>`, `<tvshow>`];
  if (showMeta.title) lines.push(`  <title>${escapeXml(showMeta.title)}</title>`);
  if (showMeta.rating !== undefined && showMeta.rating !== null && showMeta.rating !== '') {
    lines.push(`  <rating>${escapeXml(showMeta.rating)}</rating>`);
  }
  if (showMeta.plot || showMeta.overview) {
    lines.push(`  <plot>${escapeXml(showMeta.plot || showMeta.overview)}</plot>`);
  }
  if (showMeta.mpaa) lines.push(`  <mpaa>${escapeXml(showMeta.mpaa)}</mpaa>`);
  if (showMeta.premiered) lines.push(`  <premiered>${escapeXml(showMeta.premiered)}</premiered>`);
  if (showMeta.tmdbId) {
    lines.push(`  <id>${escapeXml(showMeta.tmdbId)}</id>`);
    lines.push(`  <tmdbid>${escapeXml(showMeta.tmdbId)}</tmdbid>`);
  }
  if (showMeta.imdbId) lines.push(`  <imdbid>${escapeXml(showMeta.imdbId)}</imdbid>`);

  for (const g of showMeta.genres || []) {
    if (g) lines.push(`  <genre>${escapeXml(g)}</genre>`);
  }
  for (const a of showMeta.actors || []) {
    if (!a?.name) continue;
    lines.push(`  <actor>`);
    lines.push(`    <name>${escapeXml(a.name)}</name>`);
    lines.push(`    <role>${escapeXml(a.role || '')}</role>`);
    lines.push(`  </actor>`);
  }

  const posters = showMeta.posters || (showMeta.posterUrl ? [showMeta.posterUrl] : []);
  const backdrops = showMeta.backdrops || (showMeta.backdropUrl ? [showMeta.backdropUrl] : []);

  for (const p of posters) {
    lines.push(`  <thumb preview="${escapeXml(p)}">${escapeXml(p)}</thumb>`);
  }
  for (const b of backdrops) {
    lines.push(`  <thumb preview="${escapeXml(b)}">${escapeXml(b)}</thumb>`);
  }
  if (backdrops[0]) {
    lines.push(`  <fanart>`);
    lines.push(
      `    <thumb preview="${escapeXml(backdrops[0])}">${escapeXml(backdrops[0])}</thumb>`
    );
    lines.push(`  </fanart>`);
  }

  lines.push(`</tvshow>`);
  return lines.join('\n');
}

/**
 * Costruisce il contenuto XML di un file <EpisodeStem>.archos.nfo per Nova Video Player
 */
export function buildNovaEpisodeXml(epMeta) {
  const lines = [`<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>`, `<episodedetails>`];
  if (epMeta.title) lines.push(`  <title>${escapeXml(epMeta.title)}</title>`);
  if (epMeta.showTitle) lines.push(`  <showtitle>${escapeXml(epMeta.showTitle)}</showtitle>`);
  if (epMeta.rating !== undefined && epMeta.rating !== null && epMeta.rating !== '') {
    lines.push(`  <rating>${escapeXml(epMeta.rating)}</rating>`);
  }
  lines.push(`  <season>${escapeXml(epMeta.season ?? 1)}</season>`);
  lines.push(`  <episode>${escapeXml(epMeta.episode ?? 1)}</episode>`);
  if (epMeta.plot || epMeta.overview) {
    lines.push(`  <plot>${escapeXml(epMeta.plot || epMeta.overview)}</plot>`);
  }
  if (epMeta.mpaa) lines.push(`  <mpaa>${escapeXml(epMeta.mpaa)}</mpaa>`);
  if (epMeta.imdbId) lines.push(`  <imdbid>${escapeXml(epMeta.imdbId)}</imdbid>`);
  if (epMeta.tmdbId) lines.push(`  <tmdbid>${escapeXml(epMeta.tmdbId)}</tmdbid>`);
  if (epMeta.aired) lines.push(`  <aired>${escapeXml(epMeta.aired)}</aired>`);

  for (const d of epMeta.directors || []) {
    if (d) lines.push(`  <director>${escapeXml(d)}</director>`);
  }
  for (const w of epMeta.writers || []) {
    if (w) lines.push(`  <writer>${escapeXml(w)}</writer>`);
  }
  for (const a of epMeta.actors || []) {
    if (!a?.name) continue;
    lines.push(`  <actor>`);
    lines.push(`    <name>${escapeXml(a.name)}</name>`);
    lines.push(`    <role>${escapeXml(a.role || '')}</role>`);
    lines.push(`  </actor>`);
  }

  lines.push(`</episodedetails>`);
  return lines.join('\n');
}

async function downloadImageToFile(url, targetPath) {
  if (!url || !url.startsWith('http')) return false;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const arrayBuffer = await res.arrayBuffer();
    await fs.writeFile(targetPath, Buffer.from(arrayBuffer));
    return true;
  } catch {
    return false;
  }
}

function sanitizeFilePrefix(name) {
  return name.replace(/[<>:"/\\|?*]/g, '').trim() || 'Show';
}

/**
 * Scrive sul NAS i file .archos.nfo e le locandine -poster.archos.jpg / -fanart.archos.jpg
 * 100% compatibili con Nova Video Player.
 */
export async function writeNovaFilesToNas({
  videoPath,
  type = 'movie',
  movieMeta = null,
  showMeta = null,
  episodeMeta = null,
}) {
  const dirPath = path.dirname(videoPath);
  const ext = path.extname(videoPath);
  const stem = path.basename(videoPath, ext);
  const createdFiles = [];

  if (type === 'movie' && movieMeta) {
    const nfoPath = path.join(dirPath, `${stem}.archos.nfo`);
    const xmlContent = buildNovaMovieXml(movieMeta);
    await fs.writeFile(nfoPath, xmlContent, 'utf8');
    createdFiles.push(nfoPath);

    const posterUrl = movieMeta.posterUrl || movieMeta.posters?.[0] || '';
    const backdropUrl = movieMeta.backdropUrl || movieMeta.backdrops?.[0] || '';

    const posterPath = path.join(dirPath, `${stem}-poster.archos.jpg`);
    const fanartPath = path.join(dirPath, `${stem}-fanart.archos.jpg`);

    if (posterUrl && (await downloadImageToFile(posterUrl, posterPath))) {
      createdFiles.push(posterPath);
    }
    if (backdropUrl && (await downloadImageToFile(backdropUrl, fanartPath))) {
      createdFiles.push(fanartPath);
    }

    return { nfoPath, posterPath, fanartPath, createdFiles };
  }

  if (type === 'episode' && episodeMeta) {
    // 1. Scrive <EpisodeStem>.archos.nfo
    const epNfoPath = path.join(dirPath, `${stem}.archos.nfo`);
    const epXml = buildNovaEpisodeXml(episodeMeta);
    await fs.writeFile(epNfoPath, epXml, 'utf8');
    createdFiles.push(epNfoPath);

    // 2. Se abbiamo showMeta e nella cartella non esiste ancora *-tvshow.archos.nfo, crealo con poster e fanart
    if (showMeta && showMeta.title) {
      const showPrefix = sanitizeFilePrefix(showMeta.title);
      const showNfoPath = path.join(dirPath, `${showPrefix}-tvshow.archos.nfo`);
      const showPosterPath = path.join(dirPath, `${showPrefix}-poster.archos.jpg`);
      const showFanartPath = path.join(dirPath, `${showPrefix}-fanart.archos.jpg`);
      const seasonNumStr = String(episodeMeta.season ?? 1).padStart(2, '0');
      const seasonPosterPath = path.join(
        dirPath,
        `${showPrefix}-season${seasonNumStr}.archos.jpg`
      );

      if (!fsSync.existsSync(showNfoPath)) {
        await fs.writeFile(showNfoPath, buildNovaTvShowXml(showMeta), 'utf8');
        createdFiles.push(showNfoPath);
      }
      const posterUrl = showMeta.posterUrl || showMeta.posters?.[0] || '';
      const backdropUrl = showMeta.backdropUrl || showMeta.backdrops?.[0] || '';

      if (posterUrl && !fsSync.existsSync(showPosterPath)) {
        if (await downloadImageToFile(posterUrl, showPosterPath)) {
          createdFiles.push(showPosterPath);
        }
      }
      if (posterUrl && !fsSync.existsSync(seasonPosterPath)) {
        if (await downloadImageToFile(posterUrl, seasonPosterPath)) {
          createdFiles.push(seasonPosterPath);
        }
      }
      if (backdropUrl && !fsSync.existsSync(showFanartPath)) {
        if (await downloadImageToFile(backdropUrl, showFanartPath)) {
          createdFiles.push(showFanartPath);
        }
      }
    }

    return { nfoPath: epNfoPath, createdFiles };
  }

  throw new Error('Dati metadati non validi per la scrittura Nova Video Player');
}
