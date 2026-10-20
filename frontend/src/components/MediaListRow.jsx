import React, { useState } from 'react';
import { Film, Tv, Star, Clock, Folder } from 'lucide-react';

function formatFileDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MediaListRow({
  item,
  showAddedDate = false,
  onSelect,
  onFilterDirector,
  onFilterGenre,
  onFilterActor,
}) {
  const [imgError, setImgError] = useState(false);
  const isTv = item.type === 'tvshow';
  const hasPoster = Boolean(item.posterUrl) && !imgError;

  return (
    <div
      onClick={() => onSelect(item)}
      className="group flex flex-row items-start sm:items-center gap-3 sm:gap-4 p-3 sm:p-3.5 bg-slate-900/75 hover:bg-slate-900 active:bg-slate-900 border border-slate-800/80 hover:border-amber-500/40 rounded-xl transition-all cursor-pointer"
    >
      {/* Thumbnail */}
      <div className="relative w-16 h-24 sm:w-14 sm:h-20 rounded-lg overflow-hidden bg-slate-950 shrink-0 border border-slate-800">
        {hasPoster ? (
          <img
            src={item.posterUrl}
            alt={item.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isTv ? (
              <Tv className="w-6 h-6 text-slate-700" />
            ) : (
              <Film className="w-6 h-6 text-slate-700" />
            )}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {/* Top line: Type badge + Mobile Rating + Year */}
        <div className="flex items-center justify-between gap-2 mb-1 sm:mb-0.5">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
            <span
              className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 ${
                isTv
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {isTv ? 'Serie TV' : 'Film'}
            </span>

            {item.year && (
              <span className="text-[11px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                {item.year}
              </span>
            )}

            {!isTv && item.runtime && (
              <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-slate-400">
                <Clock className="w-3 h-3" />
                {item.runtime}m
              </span>
            )}

            {isTv && item.episodeCount > 0 && (
              <span className="text-[11px] sm:text-xs text-indigo-400 font-medium">
                {item.seasonCount} stag. • {item.episodeCount} ep.
              </span>
            )}

            {item.videoFormat && (
              <span className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700">
                {item.videoFormat}
              </span>
            )}

            {(showAddedDate || item.fileDate) && item.fileDate && (
              <span
                className={`text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded border ${
                  showAddedDate
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 font-semibold'
                    : 'hidden md:inline-block bg-slate-800/60 text-slate-400 border-slate-700/60'
                }`}
                title="Data/ora inserimento file sul NAS"
              >
                File: {formatFileDateTime(item.fileDate)}
              </span>
            )}
          </div>

          {/* Mobile Rating badge */}
          {item.rating && (
            <div className="sm:hidden inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950 border border-amber-500/30 text-amber-400 font-bold text-xs shrink-0">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              {item.rating.toFixed(1)}
            </div>
          )}
        </div>

        {/* Title */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="font-bold text-sm sm:text-base text-slate-100 group-hover:text-amber-400 transition-colors line-clamp-2 sm:truncate">
            {item.title}
          </h3>
          {item.originalTitle &&
            item.originalTitle.toLowerCase() !== item.title.toLowerCase() && (
              <span className="hidden md:inline text-xs text-slate-500 italic truncate">
                ({item.originalTitle})
              </span>
            )}
        </div>

        {/* Overview 1-line */}
        {item.overview && (
          <p className="text-xs text-slate-400 line-clamp-1 mt-0.5 sm:mt-1">
            {item.overview}
          </p>
        )}

        {/* Metadata row: Director, Cast, Genres on mobile */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] sm:text-xs text-slate-400">
          {item.directors?.length > 0 && (
            <div className="flex items-center gap-1 truncate max-w-full">
              <span className="text-slate-500">Regia:</span>
              {item.directors.slice(0, 2).map((d, idx) => (
                <React.Fragment key={d}>
                  {idx > 0 && <span>, </span>}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFilterDirector(d);
                    }}
                    className="text-slate-200 hover:text-amber-400 hover:underline font-medium truncate"
                  >
                    {d}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}

          {item.actors?.length > 0 && (
            <div className="hidden md:flex items-center gap-1 truncate max-w-md">
              <span className="text-slate-500">Cast:</span>
              {item.actors.slice(0, 3).map((a, idx) => (
                <React.Fragment key={a.name}>
                  {idx > 0 && <span>, </span>}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFilterActor(a.name);
                    }}
                    className="text-slate-300 hover:text-amber-400 hover:underline"
                  >
                    {a.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}

          <div className="hidden xl:flex items-center gap-1 text-[11px] text-slate-500 truncate max-w-xs">
            <Folder className="w-3 h-3 shrink-0" />
            <span className="truncate">{item.folderPath}</span>
          </div>
        </div>

        {/* Mobile genres row */}
        {item.genres?.length > 0 && (
          <div className="flex sm:hidden flex-wrap gap-1 mt-1.5">
            {item.genres.slice(0, 3).map((g) => (
              <button
                key={g}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFilterGenre(g);
                }}
                className="px-2 py-0.5 text-[10px] rounded-full bg-slate-800 text-slate-300 border border-slate-700"
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop Right Column: Rating & Genres */}
      <div className="hidden sm:flex flex-col items-end justify-between gap-2 shrink-0">
        {item.rating ? (
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-amber-500/30 text-amber-400 font-bold text-sm">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            {item.rating.toFixed(1)}
          </div>
        ) : (
          <span className="text-xs text-slate-600">—</span>
        )}

        <div className="flex flex-wrap justify-end gap-1 max-w-[220px]">
          {(item.genres || []).slice(0, 3).map((g) => (
            <button
              key={g}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFilterGenre(g);
              }}
              className="px-2 py-0.5 text-[11px] rounded-full bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-700 transition-colors"
            >
              {g}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
