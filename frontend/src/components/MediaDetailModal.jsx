import React, { useEffect, useState } from 'react';
import {
  X,
  Star,
  Clock,
  Calendar,
  Film,
  Tv,
  User,
  Users,
  Building2,
  FolderOpen,
  FileVideo,
  FileCode,
  ExternalLink,
  Copy,
  Check,
  Play,
  Tag,
  Globe,
  HardDrive,
  Trash2,
  AlertTriangle,
  ArrowLeft,
} from 'lucide-react';

function formatBytes(bytes) {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(idx >= 3 ? 2 : 1)} ${units[idx]}`;
}

export default function MediaDetailModal({
  itemSummary,
  onClose,
  onFilterDirector,
  onFilterGenre,
  onFilterActor,
  onFilterStudio,
  onChanged,
}) {
  const [detail, setDetail] = useState(itemSummary);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [copiedKey, setCopiedKey] = useState('');
  const [showAllSeriesFiles, setShowAllSeriesFiles] = useState(false);

  // Deletion states
  const [confirmDeleteMedia, setConfirmDeleteMedia] = useState(false);
  const [confirmDeleteEpisodeId, setConfirmDeleteEpisodeId] = useState(null);
  const [confirmDeleteVideoPath, setConfirmDeleteVideoPath] = useState(null);
  const [deletePhysicalFiles, setDeletePhysicalFiles] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null);

  const loadDetail = () => {
    setLoading(true);
    fetch(`/api/media/${encodeURIComponent(itemSummary.id)}`)
      .then((r) => (r.ok ? r.json() : itemSummary))
      .then((data) => {
        setDetail(data);
        if (data.episodes?.length > 0) {
          const seasons = Array.from(new Set(data.episodes.map((e) => e.season))).sort(
            (a, b) => a - b
          );
          setSelectedSeason((prev) =>
            prev && seasons.includes(prev) ? prev : (seasons[0] ?? 1)
          );
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadDetail();
    // Lock background body scroll while modal is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemSummary.id, onClose]);

  if (!detail) return null;

  const isTv = detail.type === 'tvshow';
  const episodes = detail.episodes || [];
  const videoFiles = detail.videoFiles || [];
  const videoFolders = detail.videoFolders || (detail.folderPath ? [detail.folderPath] : []);
  const seasons = Array.from(new Set(episodes.map((e) => e.season))).sort((a, b) => a - b);
  const seasonEpisodes = episodes.filter((e) => e.season === selectedSeason);

  const handleCopyPath = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  const handleDeleteMedia = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/media/${encodeURIComponent(detail.id)}?deleteFiles=${deletePhysicalFiles}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        if (onChanged) await onChanged();
        onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionFeedback({
          type: 'error',
          text: err.error || 'Errore durante la cancellazione.',
        });
      }
    } catch (err) {
      setActionFeedback({ type: 'error', text: err.message });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteEpisode = async (episodeId) => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/media/${encodeURIComponent(detail.id)}/episodes/${encodeURIComponent(
          episodeId
        )}?deleteFiles=${deletePhysicalFiles}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        const data = await res.json();
        setConfirmDeleteEpisodeId(null);
        setActionFeedback({
          type: 'success',
          text: data.message,
        });
        loadDetail();
        if (onChanged) onChanged();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionFeedback({
          type: 'error',
          text: err.error || 'Errore durante la cancellazione episodio.',
        });
      }
    } catch (err) {
      setActionFeedback({ type: 'error', text: err.message });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteVideoFile = async (videoPath) => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/media/${encodeURIComponent(detail.id)}/video-file?path=${encodeURIComponent(
          videoPath
        )}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        const data = await res.json();
        setConfirmDeleteVideoPath(null);
        setActionFeedback({
          type: 'success',
          text: data.message,
        });
        loadDetail();
        if (onChanged) onChanged();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionFeedback({
          type: 'error',
          text: err.error || 'Errore durante la cancellazione del file video.',
        });
      }
    } catch (err) {
      setActionFeedback({ type: 'error', text: err.message });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 bg-slate-950/85 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-y-auto bg-slate-900 sm:border border-slate-800 rounded-none sm:rounded-2xl shadow-2xl text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Top Bar (Mobile Navigation + Desktop Close Button) */}
        <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-2.5 sm:py-0 sm:px-0 bg-slate-950/90 sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none border-b border-slate-800/80 sm:border-none">
          <button
            type="button"
            onClick={onClose}
            className="sm:hidden inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 active:text-amber-400 py-1"
          >
            <ArrowLeft className="w-4 h-4 text-amber-400" />
            Indietro
          </button>
          <span className="sm:hidden text-xs font-bold text-slate-300 truncate max-w-[60%]">
            {detail.title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="sm:fixed sm:top-auto sm:right-auto sm:ml-auto sm:mt-3 sm:mr-3 p-1.5 sm:p-2 rounded-full bg-slate-900 sm:bg-slate-950/80 hover:bg-amber-500 text-slate-200 hover:text-slate-950 border border-slate-700 transition-colors shadow-lg cursor-pointer"
            title="Chiudi (Esc)"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Hero Backdrop */}
        <div className="relative h-40 sm:h-64 md:h-80 w-full bg-slate-950 overflow-hidden sm:-mt-11">
          {detail.fanartUrl ? (
            <img
              src={detail.fanartUrl}
              alt={detail.title}
              className="w-full h-full object-cover opacity-55"
            />
          ) : detail.posterUrl ? (
            <img
              src={detail.posterUrl}
              alt={detail.title}
              className="w-full h-full object-cover opacity-25 blur-xl scale-110"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />
        </div>

        {/* Main Content Area */}
        <div className="relative px-4 sm:px-8 pb-10 -mt-16 sm:-mt-32 md:-mt-36 z-10">
          {/* Action Feedback Notification */}
          {actionFeedback && (
            <div
              className={`mb-4 px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                actionFeedback.type === 'error'
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                  : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
              }`}
            >
              <span>{actionFeedback.text}</span>
              <button
                type="button"
                onClick={() => setActionFeedback(null)}
                className="opacity-75 hover:opacity-100 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Header Layout: Side-by-side compact poster + title on mobile, full poster on desktop */}
          <div className="flex flex-row items-end sm:items-start gap-3.5 sm:gap-6">
            {/* Poster */}
            <div className="w-24 sm:w-44 md:w-60 shrink-0">
              <div className="aspect-[2/3] rounded-xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-2xl">
                {detail.posterUrl ? (
                  <img
                    src={detail.posterUrl}
                    alt={detail.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-3 text-slate-600">
                    {isTv ? (
                      <Tv className="w-10 h-10 sm:w-16 sm:h-16" />
                    ) : (
                      <Film className="w-10 h-10 sm:w-16 sm:h-16" />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Primary Title & Badges */}
            <div className="flex-1 min-w-0 pt-2 sm:pt-8 md:pt-10">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5 sm:mb-2">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-bold uppercase ${
                      isTv
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {isTv ? <Tv className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <Film className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
                    {isTv ? 'Serie TV' : 'Film'}
                  </span>

                  {detail.mpaa && (
                    <span className="px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                      {detail.mpaa}
                    </span>
                  )}

                  {detail.hasArchosNfo && (
                    <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      MX Player / Archos .nfo
                    </span>
                  )}

                  {detail.videoFormat && (
                    <span className="px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                      {detail.videoFormat}
                    </span>
                  )}
                </div>

                {/* Desktop Delete Button */}
                {!confirmDeleteMedia && (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteMedia(true)}
                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {isTv ? 'Elimina Serie' : 'Elimina Film'}
                  </button>
                )}
              </div>

              {/* Title & Original Title */}
              <h2 className="text-lg sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight leading-snug">
                {detail.title}
              </h2>
              {detail.originalTitle &&
                detail.originalTitle.toLowerCase() !== detail.title.toLowerCase() && (
                  <p className="text-xs sm:text-sm text-slate-400 italic mt-0.5 line-clamp-1">
                    {detail.originalTitle}
                  </p>
                )}
              {detail.tagline && (
                <p className="hidden sm:block text-sm text-amber-400/90 font-medium italic mt-1">
                  “{detail.tagline}”
                </p>
              )}

              {/* Stats Row */}
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-4 mt-2 sm:mt-3 text-xs sm:text-sm text-slate-300">
                {detail.rating && (
                  <div className="inline-flex items-center gap-1 px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold">
                    <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-amber-400 text-amber-400" />
                    <span>{detail.rating.toFixed(1)}</span>
                    <span className="hidden sm:inline text-xs text-slate-400 font-normal">/ 10</span>
                  </div>
                )}

                {detail.year && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {detail.year}
                  </span>
                )}

                {detail.runtime && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {detail.runtime} min
                  </span>
                )}

                {isTv && (episodes.length > 0 || videoFiles.length > 0) && (
                  <span className="text-indigo-400 font-semibold text-xs sm:text-sm">
                    {seasons.length > 0 ? `${seasons.length} Stag. • ` : ''}
                    {episodes.length || videoFiles.length} Ep.
                  </span>
                )}

                {detail.fileDate && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-medium"
                    title="Data e ora del file sul NAS"
                  >
                    Inserito:{' '}
                    {new Date(detail.fileDate).toLocaleString('it-IT', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>

              {/* Desktop Genres & Synopsis inside right column */}
              <div className="hidden md:block">
                {detail.genres?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {detail.genres.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => {
                          onFilterGenre(g);
                          onClose();
                        }}
                        className="px-3 py-1 rounded-full text-xs font-medium bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Trama / Sinossi
                  </h4>
                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                    {detail.overview || 'Nessuna descrizione presente nel file .nfo.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Delete Button & Confirmation Box */}
          {!confirmDeleteMedia && (
            <div className="sm:hidden mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setConfirmDeleteMedia(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-semibold"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isTv ? 'Elimina Serie TV' : 'Elimina Film'}
              </button>
            </div>
          )}

          {confirmDeleteMedia && (
            <div className="my-4 p-3.5 sm:p-4 rounded-xl bg-rose-950/60 border border-rose-500/50 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1 min-w-0">
                  <p className="font-bold text-rose-200 text-sm">
                    Confermi l&apos;eliminazione di &ldquo;{detail.title}&rdquo;?
                  </p>
                  <p className="text-rose-300/90 font-mono break-all">
                    {detail.videoPath || detail.folderPath}
                  </p>
                </div>
              </div>

              <label className="flex items-start sm:items-center gap-2 text-xs text-slate-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deletePhysicalFiles}
                  onChange={(e) => setDeletePhysicalFiles(e.target.checked)}
                  className="mt-0.5 sm:mt-0 rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500"
                />
                <span>
                  Elimina fisicamente anche i file video, il file <code>.nfo</code> e le locandine dal NAS
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDeleteMedia}
                  className="flex-1 sm:flex-none px-3.5 py-2 sm:py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {deleting ? 'Eliminazione...' : 'Sì, elimina definitivamente'}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirmDeleteMedia(false)}
                  className="flex-1 sm:flex-none px-3.5 py-2 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Annulla
                </button>
              </div>
            </div>
          )}

          {/* Mobile/Tablet Genres & Synopsis (below header row) */}
          <div className="md:hidden mt-4">
            {detail.genres?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {detail.genres.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      onFilterGenre(g);
                      onClose();
                    }}
                    className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700"
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Trama / Sinossi
              </h4>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                {detail.overview || 'Nessuna descrizione presente nel file .nfo.'}
              </p>
            </div>
          </div>

          {/* Directors, Writers, Studios, Countries & External Links */}
          <div className="mt-5 pt-4 border-t border-slate-800/80">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {detail.directors?.length > 0 && (
                <div>
                  <span className="text-slate-400 font-semibold flex items-center gap-1.5 mb-1">
                    <User className="w-3.5 h-3.5 text-amber-400" />
                    Regia / Autore:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.directors.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          onFilterDirector(d);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-amber-500/20 text-amber-300 border border-slate-700 cursor-pointer"
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {detail.writers?.length > 0 && (
                <div>
                  <span className="text-slate-400 font-semibold flex items-center gap-1.5 mb-1">
                    <User className="w-3.5 h-3.5 text-indigo-400" />
                    Sceneggiatura:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.writers.slice(0, 8).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => {
                          onFilterDirector(w);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-indigo-500/20 text-slate-200 border border-slate-700 cursor-pointer"
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {detail.studios?.length > 0 && (
                <div>
                  <span className="text-slate-400 font-semibold flex items-center gap-1.5 mb-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    Produzione / Studio:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {detail.studios.slice(0, 5).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          onFilterStudio(s);
                          onClose();
                        }}
                        className="px-2 py-0.5 rounded bg-slate-800/70 hover:bg-slate-700 text-slate-300 cursor-pointer"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {detail.countries?.length > 0 && (
                <div>
                  <span className="text-slate-400 font-semibold flex items-center gap-1.5 mb-1">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    Paese:
                  </span>
                  <span className="text-slate-300">{detail.countries.join(', ')}</span>
                </div>
              )}
            </div>

            {/* External Links (IMDb, TMDb, Trailer) */}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {detail.imdbId && (
                <a
                  href={`https://www.imdb.com/title/${detail.imdbId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors"
                >
                  IMDb ({detail.imdbId})
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              {detail.tmdbId && (
                <a
                  href={`https://www.themoviedb.org/${isTv ? 'tv' : 'movie'}/${detail.tmdbId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-xs font-semibold transition-colors"
                >
                  TMDb ({detail.tmdbId})
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              {detail.trailers?.length > 0 && (
                <a
                  href={detail.trailers[0]}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors"
                >
                  <Play className="w-3.5 h-3.5 fill-rose-400" />
                  Guarda Trailer
                </a>
              )}
            </div>
          </div>

          {/* Posizione File Video sul NAS */}
          <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-amber-400 shrink-0" />
                {isTv
                  ? `Posizione Cartelle e File Video (${videoFiles.length} file)`
                  : `Posizione File Video sul NAS`}
              </h3>

              {isTv && videoFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllSeriesFiles((v) => !v)}
                  className="text-xs font-semibold text-amber-400 hover:text-amber-300 underline cursor-pointer"
                >
                  {showAllSeriesFiles
                    ? 'Nascondi elenco file'
                    : `Mostra tutti i ${videoFiles.length} file`}
                </button>
              )}
            </div>

            <div className="space-y-2.5 text-xs">
              {/* Cartella principale / Cartelle stagioni */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                    <FolderOpen className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-400 font-medium">
                        {isTv ? 'Cartella principale Serie TV' : 'Cartella sul NAS'}
                      </div>
                      <div className="font-mono text-slate-200 break-all text-[11px] sm:text-xs">
                        {detail.folderPath}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyPath(detail.folderPath, 'main-folder')}
                    className="self-end sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 shrink-0 transition-colors cursor-pointer"
                  >
                    {copiedKey === 'main-folder' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copiato
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copia cartella
                      </>
                    )}
                  </button>
                </div>

                {/* Sottocartelle stagioni se presenti */}
                {isTv &&
                  videoFolders.filter(
                    (f) => f.toLowerCase() !== (detail.folderPath || '').toLowerCase()
                  ).length > 0 && (
                    <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                      <div className="text-[11px] text-slate-400 font-medium">
                        Cartelle stagioni / episodi:
                      </div>
                      {videoFolders
                        .filter(
                          (f) => f.toLowerCase() !== (detail.folderPath || '').toLowerCase()
                        )
                        .map((folder, idx) => (
                          <div
                            key={folder}
                            className="flex items-center justify-between gap-2 pl-2 py-1 rounded bg-slate-900/70"
                          >
                            <span className="font-mono text-slate-300 break-all text-[11px]">
                              {folder}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyPath(folder, `subfolder-${idx}`)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0 cursor-pointer"
                            >
                              {copiedKey === `subfolder-${idx}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
              </div>

              {/* Per i Film: mostra direttamente tutti i file video trovati (1 o più) */}
              {!isTv && (
                <div className="space-y-2">
                  {videoFiles.length > 0 ? (
                    videoFiles.map((vf, idx) => (
                      <div
                        key={vf.fullPath}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-950/90 p-3 rounded-xl border border-slate-800"
                      >
                        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                          <FileVideo className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] text-slate-400 font-medium">
                                File Video {videoFiles.length > 1 ? `#${idx + 1}` : ''}
                              </span>
                              {vf.format && (
                                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 font-mono text-[10px]">
                                  {vf.format}
                                </span>
                              )}
                              {vf.sizeBytes && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 font-mono text-[10px]">
                                  {formatBytes(vf.sizeBytes)}
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-slate-100 break-all text-[11px] sm:text-xs mt-0.5">
                              {vf.fullPath}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyPath(vf.fullPath, `movie-vf-${idx}`)}
                          className="self-end sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer shrink-0"
                        >
                          {copiedKey === `movie-vf-${idx}` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              Copiato
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Copia percorso
                            </>
                          )}
                        </button>
                      </div>
                    ))
                  ) : detail.videoPath ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-950/90 p-3 rounded-xl border border-slate-800">
                      <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                        <FileVideo className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
                        <div className="min-w-0">
                          <div className="text-[11px] text-slate-400 font-medium">
                            Percorso File Video
                          </div>
                          <div className="font-mono text-slate-100 break-all text-[11px] sm:text-xs">
                            {detail.videoPath}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyPath(detail.videoPath, 'movie-video')}
                        className="self-end sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 shrink-0 transition-colors cursor-pointer"
                      >
                        {copiedKey === 'movie-video' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            Copiato
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copia percorso
                          </>
                        )}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Per le Serie TV: elenco espandibile di tutti i file video */}
              {isTv && (showAllSeriesFiles || episodes.length === 0) && videoFiles.length > 0 && (
                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-1.5 max-h-72 overflow-y-auto">
                  <div className="text-[11px] font-semibold text-slate-400 mb-2">
                    Elenco completo file video sul NAS ({videoFiles.length}):
                  </div>
                  {videoFiles.map((vf, idx) => (
                    <div
                      key={vf.fullPath}
                      className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/70 space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <FileVideo className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <div className="font-mono text-slate-200 break-all text-[11px]">
                              {vf.fullPath}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                              <span>{vf.format}</span>
                              {vf.sizeBytes && (
                                <>
                                  <span>•</span>
                                  <span className="text-emerald-400">
                                    {formatBytes(vf.sizeBytes)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopyPath(vf.fullPath, `tv-vf-${idx}`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                          >
                            {copiedKey === `tv-vf-${idx}` ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>Copiato</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copia</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteVideoPath(vf.fullPath)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 cursor-pointer"
                            title="Elimina questo file episodio dal NAS"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {confirmDeleteVideoPath === vf.fullPath && (
                        <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-rose-950/60 border border-rose-500/40 text-xs">
                          <span className="text-rose-200 font-medium">
                            Eliminare definitivamente questo file dal NAS?
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={() => handleDeleteVideoFile(vf.fullPath)}
                              className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer"
                            >
                              {deleting ? 'Eliminazione...' : 'Conferma'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteVideoPath(null)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                            >
                              Annulla
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Percorso file NFO */}
              {detail.nfoPath && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800/60 text-[11px] text-slate-400">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="font-mono break-all">NFO: {detail.nfoPath}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyPath(detail.nfoPath, 'nfo-path')}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0 cursor-pointer"
                  >
                    {copiedKey === 'nfo-path' ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* TV Series Seasons & Episodes */}
          {isTv && episodes.length > 0 && (
            <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Tv className="w-4 h-4 text-indigo-400" />
                  Episodi e Posizione File ({episodes.length})
                </h3>

                {seasons.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                    {seasons.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSelectedSeason(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                          selectedSeason === s
                            ? 'bg-indigo-600 text-white shadow'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        Stagione {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {loading ? (
                <p className="text-xs text-slate-400 py-4">Caricamento episodi...</p>
              ) : (
                <div className="space-y-2.5 max-h-[55vh] sm:max-h-96 overflow-y-auto pr-0.5 sm:pr-1">
                  {seasonEpisodes.map((ep) => (
                    <div
                      key={ep.id}
                      className="p-3 sm:p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-start sm:items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 min-w-0">
                          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold shrink-0">
                            S{String(ep.season).padStart(2, '0')}E
                            {String(ep.episode).padStart(2, '0')}
                          </span>
                          <h4 className="font-bold text-xs sm:text-sm text-slate-100 break-words">
                            {ep.title}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0 text-xs text-slate-400">
                          {ep.sizeBytes && (
                            <span className="hidden sm:inline font-mono text-emerald-400">
                              {formatBytes(ep.sizeBytes)}
                            </span>
                          )}
                          {ep.rating && (
                            <span className="inline-flex items-center gap-1 text-amber-400 font-semibold">
                              <Star className="w-3 h-3 fill-amber-400" />
                              {ep.rating.toFixed(1)}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteEpisodeId(ep.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer"
                            title="Elimina questo episodio"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline text-[11px] font-semibold">
                              Elimina
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Box di conferma eliminazione singolo Episodio */}
                      {confirmDeleteEpisodeId === ep.id && (
                        <div className="mt-3 p-3 rounded-xl bg-rose-950/60 border border-rose-500/50 space-y-2.5 text-xs">
                          <div className="flex items-start gap-2 text-rose-200 font-semibold">
                            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            <span>
                              Confermi l&apos;eliminazione di S
                              {String(ep.season).padStart(2, '0')}E
                              {String(ep.episode).padStart(2, '0')} &ldquo;{ep.title}&rdquo;?
                            </span>
                          </div>
                          <label className="flex items-start sm:items-center gap-2 text-slate-200 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={deletePhysicalFiles}
                              onChange={(e) => setDeletePhysicalFiles(e.target.checked)}
                              className="mt-0.5 sm:mt-0 rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500"
                            />
                            <span>
                              Elimina fisicamente il file video e il file <code>.nfo</code> dal NAS
                            </span>
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={() => handleDeleteEpisode(ep.id)}
                              className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer disabled:opacity-50"
                            >
                              {deleting ? 'Eliminazione...' : 'Conferma'}
                            </button>
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={() => setConfirmDeleteEpisodeId(null)}
                              className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
                            >
                              Annulla
                            </button>
                          </div>
                        </div>
                      )}

                      {ep.overview && (
                        <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                          {ep.overview}
                        </p>
                      )}

                      {/* Episode Video File Path */}
                      {(ep.videoPath || ep.nfoPath) && (
                        <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                          <div className="flex items-start gap-1.5 min-w-0 text-slate-400">
                            <FileVideo className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                            <span className="font-mono text-slate-300 break-all">
                              {ep.videoPath || ep.videoFileName || ep.nfoPath}
                            </span>
                          </div>
                          {ep.videoPath && (
                            <button
                              type="button"
                              onClick={() => handleCopyPath(ep.videoPath, `ep-${ep.id}`)}
                              className="self-end sm:self-auto inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 shrink-0 cursor-pointer"
                            >
                              {copiedKey === `ep-${ep.id}` ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>Copiato</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copia percorso</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cast Section */}
          {detail.actors?.length > 0 && (
            <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-slate-800">
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-amber-400" />
                Cast ({detail.actors.length} attori)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
                {detail.actors.map((actor) => (
                  <button
                    key={`${actor.name}-${actor.role}`}
                    type="button"
                    onClick={() => {
                      onFilterActor(actor.name);
                      onClose();
                    }}
                    className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800 border border-slate-800/80 hover:border-amber-500/40 text-left transition-colors cursor-pointer"
                  >
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-amber-400 shrink-0">
                      {actor.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-200 truncate">
                        {actor.name}
                      </div>
                      {actor.role && (
                        <div className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                          {actor.role}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {detail.tags?.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-800">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
                <Tag className="w-3.5 h-3.5" />
                <span>Tag:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detail.tags.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800 text-[11px]"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
