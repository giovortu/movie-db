import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false,
  isArray: (name) => {
    return [
      'genre',
      'director',
      'writer',
      'credits',
      'studio',
      'country',
      'tag',
      'actor',
      'thumb',
      'trailer',
    ].includes(name);
  },
});

function toArray(val) {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

function extractText(val) {
  if (val === undefined || val === null) return '';
  if (typeof val === 'string' || typeof val === 'number') return String(val).trim();
  if (Array.isArray(val)) return extractText(val[0]);
  if (typeof val === 'object') {
    if (val['#text'] !== undefined) return String(val['#text']).trim();
  }
  return '';
}

function extractStringList(val) {
  const arr = toArray(val);
  const result = [];
  const seen = new Set();
  for (const item of arr) {
    const text = extractText(item);
    if (!text) continue;
    // Some NFOs separate multiple values with " / " or ","
    const parts = text.split(/\s*\/\s*|\s*,\s*/).map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const key = part.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(part);
      }
    }
  }
  return result;
}

function extractActors(actorNode) {
  const arr = toArray(actorNode);
  const actors = [];
  const seen = new Set();
  for (const a of arr) {
    if (!a || typeof a !== 'object') continue;
    const name = extractText(a.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const role = extractText(a.role);
    const thumb = extractText(a.thumb);
    actors.push({
      name,
      role: role || '',
      thumb: thumb && thumb.startsWith('http') ? thumb : '',
    });
  }
  return actors;
}

function extractThumbs(node) {
  const thumbs = [];
  for (const t of toArray(node?.thumb)) {
    const url = extractText(t) || (typeof t === 'object' ? t['@_preview'] : '');
    if (url && url.startsWith('http')) {
      thumbs.push(url);
    }
  }
  const fanarts = [];
  if (node?.fanart) {
    for (const f of toArray(node.fanart.thumb ?? node.fanart)) {
      const url = extractText(f) || (typeof f === 'object' ? f['@_preview'] : '');
      if (url && url.startsWith('http')) {
        fanarts.push(url);
      }
    }
  }
  // In MX Player / Archos NFOs, w342 thumbs are posters and w1280 thumbs are backdrops
  const posterUrls = thumbs.filter((u) => u.includes('/w342/') || u.includes('/w500/') || !u.includes('/w1280/'));
  const backdropUrls = [
    ...fanarts,
    ...thumbs.filter((u) => u.includes('/w1280/') || u.includes('/original/')),
  ];

  return {
    remotePoster: posterUrls[0] || thumbs[0] || '',
    remoteFanart: backdropUrls[0] || '',
  };
}

/**
 * Parses a Kodi / MX Player / Archos / Jellyfin XML .nfo content string.
 * Returns { kind: 'movie' | 'tvshow' | 'episodedetails', data: {...} } or null if invalid.
 */
export function parseNfoContent(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') return null;

  // Strip BOM and any leading non-XML garbage before first '<'
  const firstBracket = rawContent.indexOf('<');
  if (firstBracket === -1) return null;
  const cleaned = rawContent.slice(firstBracket);

  let parsed;
  try {
    parsed = xmlParser.parse(cleaned);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const kind = parsed.movie
    ? 'movie'
    : parsed.tvshow
      ? 'tvshow'
      : parsed.episodedetails
        ? 'episodedetails'
        : null;

  if (!kind) return null;
  const root = parsed[kind];
  if (!root || typeof root !== 'object') return null;

  const title = extractText(root.title);
  const originalTitle = extractText(root.originaltitle);
  const showTitle = extractText(root.showtitle);
  const outline = extractText(root.outline);
  const plot = extractText(root.plot);
  const tagline = extractText(root.tagline);

  const ratingRaw = parseFloat(extractText(root.rating));
  const rating = Number.isFinite(ratingRaw) && ratingRaw > 0 ? Math.round(ratingRaw * 10) / 10 : null;

  const criticRatingRaw = parseFloat(extractText(root.criticrating));
  const criticRating = Number.isFinite(criticRatingRaw) && criticRatingRaw > 0 ? criticRatingRaw : null;

  const yearRaw = parseInt(extractText(root.year), 10);
  const premiered = extractText(root.premiered) || extractText(root.releasedate) || extractText(root.aired);
  let year = Number.isFinite(yearRaw) && yearRaw > 1880 ? yearRaw : null;
  if (!year && premiered) {
    const m = premiered.match(/\b(19\d{2}|20\d{2})\b/);
    if (m) year = parseInt(m[1], 10);
  }

  const runtimeRaw = parseInt(extractText(root.runtime), 10);
  const runtime = Number.isFinite(runtimeRaw) && runtimeRaw > 0 ? runtimeRaw : null;

  const mpaa = extractText(root.mpaa);
  const imdbId =
    extractText(root.imdbid) ||
    (extractText(root.id).startsWith('tt') ? extractText(root.id) : '');
  const tmdbId =
    extractText(root.tmdbid) ||
    (!extractText(root.id).startsWith('tt') ? extractText(root.id) : '');

  const directors = extractStringList(root.director);
  const writers = extractStringList([
    ...toArray(root.writer),
    ...toArray(root.credits),
  ]);
  const genres = extractStringList(root.genre);
  const studios = extractStringList(root.studio);
  const countries = extractStringList(root.country);
  const tags = extractStringList(root.tag);
  const actors = extractActors(root.actor);
  const { remotePoster, remoteFanart } = extractThumbs(root);

  const seasonRaw = parseInt(extractText(root.season), 10);
  const episodeRaw = parseInt(extractText(root.episode), 10);
  const season = Number.isFinite(seasonRaw) ? seasonRaw : null;
  const episode = Number.isFinite(episodeRaw) ? episodeRaw : null;
  const dateAdded = extractText(root.dateadded);

  const trailers = toArray(root.trailer)
    .map((t) => {
      const txt = extractText(t);
      const ytMatch = txt.match(/video_id=([a-zA-Z0-9_-]+)/);
      if (ytMatch) return `https://www.youtube.com/watch?v=${ytMatch[1]}`;
      return txt.startsWith('http') ? txt : '';
    })
    .filter(Boolean);

  return {
    kind,
    data: {
      title,
      originalTitle,
      showTitle,
      // Prefer outline (often Italian in .archos.nfo) or plot
      overview: outline || plot || '',
      outline,
      plot,
      tagline,
      rating,
      criticRating,
      year,
      premiered,
      runtime,
      mpaa,
      imdbId,
      tmdbId,
      directors,
      writers,
      genres,
      studios,
      countries,
      tags,
      actors,
      remotePoster,
      remoteFanart,
      season,
      episode,
      dateAdded,
      trailers,
    },
  };
}

/**
 * Merges two parsed NFO data objects (primary = .archos.nfo, secondary = .nfo).
 */
export function mergeNfoData(primary, secondary) {
  if (!primary) return secondary;
  if (!secondary) return primary;

  const mergeUniqueStrings = (a = [], b = []) => {
    const out = [...a];
    const seen = new Set(a.map((x) => x.toLowerCase()));
    for (const item of b) {
      if (!seen.has(item.toLowerCase())) {
        seen.add(item.toLowerCase());
        out.push(item);
      }
    }
    return out;
  };

  const mergeActors = (a = [], b = []) => {
    const out = [...a];
    const seen = new Set(a.map((x) => x.name.toLowerCase()));
    for (const actor of b) {
      const key = actor.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(actor);
      } else {
        const existing = out.find((x) => x.name.toLowerCase() === key);
        if (existing) {
          if (!existing.role && actor.role) existing.role = actor.role;
          if (!existing.thumb && actor.thumb) existing.thumb = actor.thumb;
        }
      }
    }
    return out;
  };

  return {
    title: primary.title || secondary.title || '',
    originalTitle: primary.originalTitle || secondary.originalTitle || '',
    showTitle: primary.showTitle || secondary.showTitle || '',
    overview: primary.overview || secondary.overview || '',
    outline: primary.outline || secondary.outline || '',
    plot: primary.plot || secondary.plot || '',
    tagline: primary.tagline || secondary.tagline || '',
    rating: primary.rating ?? secondary.rating ?? null,
    criticRating: primary.criticRating ?? secondary.criticRating ?? null,
    year: primary.year ?? secondary.year ?? null,
    premiered: primary.premiered || secondary.premiered || '',
    runtime: primary.runtime ?? secondary.runtime ?? null,
    mpaa: primary.mpaa || secondary.mpaa || '',
    imdbId: primary.imdbId || secondary.imdbId || '',
    tmdbId: primary.tmdbId || secondary.tmdbId || '',
    directors: mergeUniqueStrings(primary.directors, secondary.directors),
    writers: mergeUniqueStrings(primary.writers, secondary.writers),
    genres: primary.genres?.length ? primary.genres : secondary.genres || [],
    studios: mergeUniqueStrings(primary.studios, secondary.studios),
    countries: mergeUniqueStrings(primary.countries, secondary.countries),
    tags: mergeUniqueStrings(primary.tags, secondary.tags),
    actors: mergeActors(primary.actors, secondary.actors),
    remotePoster: primary.remotePoster || secondary.remotePoster || '',
    remoteFanart: primary.remoteFanart || secondary.remoteFanart || '',
    season: primary.season ?? secondary.season ?? null,
    episode: primary.episode ?? secondary.episode ?? null,
    dateAdded: primary.dateAdded || secondary.dateAdded || '',
    trailers: mergeUniqueStrings(primary.trailers, secondary.trailers),
  };
}
