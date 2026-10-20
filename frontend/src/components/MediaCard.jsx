import React, { useState } from 'react';
import { Film, Tv, Star, Clock, Calendar, User } from 'lucide-react';

function formatFileDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function MediaCard({
  item,
  showAddedDate = false,
  onSelect,
  onFilterDirector,
  onFilterGenre,
}) {
  const [imgError, setImgError] = useState(false);
  const isTv = item.type === 'tvshow';
  const hasPoster = Boolean(item.posterUrl) && !imgError;

  return (
    <div
      onClick={() => onSelect(item)}
      className="group relative flex flex-col bg-slate-900/90 border border-slate-800/80 rounded-xl overflow-hidden shadow-md hover:shadow-amber-500/10 hover:border-amber-500/50 active:scale-[0.99] transition-all duration-200 cursor-pointer"
    >
      {/* Poster Container (2:3 aspect ratio) */}
      <div className="relative aspect-[2/3] w-full bg-slate-950 overflow-hidden">
        {hasPoster ? (
          <img
            src={item.posterUrl}
            alt={item.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover sm:group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-4 text-center bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900">
            {isTv ? (
              <Tv className="w-10 h-10 sm:w-12 sm:h-12 text-slate-700 mb-2 sm:mb-3" />
            ) : (
              <Film className="w-10 h-10 sm:w-12 sm:h-12 text-slate-700 mb-2 sm:mb-3" />
            )}
            <span className="text-xs sm:text-sm font-semibold text-slate-400 line-clamp-3">
              {item.title}
            </span>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1 pointer-events-none">
          <span
            className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide backdrop-blur-md shadow ${
              isTv
                ? 'bg-indigo-600/85 text-white border border-indigo-400/30'
                : 'bg-amber-500/90 text-slate-950 border border-amber-300/40'
            }`}
          >
            {isTv ? <Tv className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> : <Film className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
            {isTv ? 'Serie' : 'Film'}
          </span>

          {item.rating && (
            <span className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 rounded-md text-[11px] sm:text-xs font-bold bg-slate-950/85 text-amber-400 border border-amber-500/30 backdrop-blur-md shadow">
              <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-amber-400 text-amber-400" />
              {item.rating.toFixed(1)}
            </span>
          )}
        </div>

        {/* Hover Synopsis Overlay (Desktop only so touch devices don't get stuck on hover) */}
        <div className="hidden sm:flex absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/85 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-col justify-end p-3.5">
          {item.overview ? (
            <p className="text-xs text-slate-200 line-clamp-5 leading-relaxed mb-2">
              {item.overview}
            </p>
          ) : (
            <p className="text-xs italic text-slate-400 mb-2">
              Nessuna trama disponibile nel file .nfo
            </p>
          )}
          <div className="flex items-center justify-between text-[11px] text-amber-400 font-medium pt-1 border-t border-slate-800/80">
            <span>Clicca per i dettagli</span>
            {item.videoFormat && (
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                {item.videoFormat}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-2.5 sm:p-3.5 flex-1 flex flex-col justify-between gap-1.5 sm:gap-2">
        <div>
          <h3
            className="font-bold text-xs sm:text-sm text-slate-100 group-hover:text-amber-400 transition-colors line-clamp-2 sm:line-clamp-1 leading-snug"
            title={item.title}
          >
            {item.title}
          </h3>

          {/* Year & Runtime / Episodes */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-slate-400 mt-1">
            {item.year && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-slate-500" />
                {item.year}
              </span>
            )}
            {isTv && item.episodeCount > 0 && (
              <span className="text-indigo-400 font-medium">
                {item.seasonCount} stag. • {item.episodeCount} ep.
              </span>
            )}
            {!isTv && item.runtime && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-slate-500" />
                {item.runtime}m
              </span>
            )}
            {showAddedDate && item.fileDate && (
              <span
                className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-medium"
                title={`Data file: ${new Date(item.fileDate).toLocaleString('it-IT')}`}
              >
                +{formatFileDateShort(item.fileDate)}
              </span>
            )}
          </div>

          {/* Director / Author */}
          {item.directors?.length > 0 && (
            <div className="mt-1 flex items-center gap-1 text-[11px] sm:text-xs text-slate-400 truncate">
              <User className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-slate-500 shrink-0" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFilterDirector(item.directors[0]);
                }}
                className="hover:text-amber-400 hover:underline truncate text-left"
                title={`Filtra per autore/regista: ${item.directors.join(', ')}`}
              >
                {item.directors.slice(0, 2).join(', ')}
              </button>
            </div>
          )}
        </div>

        {/* Genres */}
        {item.genres?.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5 sm:pt-1">
            {item.genres.slice(0, 2).map((g) => (
              <button
                key={g}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFilterGenre(g);
                }}
                className="px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] rounded-full bg-slate-800/90 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-700/70 transition-colors"
              >
                {g}
              </button>
            ))}
            {item.genres.length > 2 && (
              <span className="px-1 py-0.5 text-[10px] text-slate-500">
                +{item.genres.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
