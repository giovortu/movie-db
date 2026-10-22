import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  FilePlus2,
  Search,
  Film,
  Tv,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileVideo,
  Star,
  Wand2,
  Edit3,
  Save,
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

export default function UnmatchedMediaModal({ onClose, onCatalogUpdated }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    tmdbConfigured: false,
    total: 0,
    missingNfoCount: 0,
    missingArchosCount: 0,
    items: [],
  });
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'missing_nfo' | 'missing_archos'

  // Active item being matched/edited
  const [activeItem, setActiveItem] = useState(null);
  const [mediaType, setMediaType] = useState('movie'); // 'movie' | 'episode'
  const [searchTitle, setSearchTitle] = useState('');
  const [searchYear, setSearchYear] = useState('');
  const [seasonNum, setSeasonNum] = useState(1);
  const [episodeNum, setEpisodeNum] = useState(1);

  // TMDb search results
  const [searchingTmdb, setSearchingTmdb] = useState(false);
  const [tmdbResults, setTmdbResults] = useState([]);
  const [tmdbError, setTmdbError] = useState('');

  // Manual / Custom editor fields
  const [showManualEditor, setShowManualEditor] = useState(false);
  const [manualForm, setManualForm] = useState({
    title: '',
    showTitle: '',
    year: '',
    rating: '',
    runtime: '',
    outline: '',
    directors: '',
    genres: '',
    posterUrl: '',
    backdropUrl: '',
    imdbId: '',
    tmdbId: '',
  });

  // Saving state
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const fetchUnmatched = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/unmatched');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnmatched();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [fetchUnmatched, onClose]);

  const selectUnmatchedItem = (item) => {
    setActiveItem(item);
    setMediaType(item.detectedType || 'movie');
    setSearchTitle(item.parsedTitle || '');
    setSearchYear(item.parsedYear ? String(item.parsedYear) : '');
    setSeasonNum(item.season ?? 1);
    setEpisodeNum(item.episode ?? 1);
    setTmdbResults([]);
    setTmdbError('');
    setShowManualEditor(false);

    const std = item.existingStdData;
    setManualForm({
      title: std?.title || item.parsedTitle || '',
      showTitle: std?.showTitle || item.matchedShow?.title || item.parsedTitle || '',
      year: std?.year || item.parsedYear || '',
      rating: std?.rating || '',
      runtime: std?.runtime || '',
      outline: std?.overview || std?.plot || std?.outline || '',
      directors: (std?.directors || []).join(', '),
      genres: (std?.genres || []).join(', '),
      posterUrl: std?.remotePoster || '',
      backdropUrl: std?.remoteFanart || '',
      imdbId: std?.imdbId || item.matchedShow?.imdbId || '',
      tmdbId: std?.tmdbId || item.matchedShow?.tmdbId || '',
    });
  };

  const handleSearchTmdb = async (e) => {
    if (e) e.preventDefault();
    if (!searchTitle.trim()) return;
    setSearchingTmdb(true);
    setTmdbError('');
    try {
      const params = new URLSearchParams({
        q: searchTitle.trim(),
        type: mediaType,
      });
      if (searchYear) params.set('year', String(searchYear).trim());

      const res = await fetch(`/api/tmdb/search?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setTmdbError(json.error || 'Errore ricerca TMDb');
        setTmdbResults([]);
      } else {
        setTmdbResults(json.results || []);
        if ((json.results || []).length === 0) {
          setTmdbError('Nessun risultato trovato su TMDb. Prova a modificare il titolo o usa l’editor manuale.');
        }
      }
    } catch (err) {
      setTmdbError(err.message);
    } finally {
      setSearchingTmdb(false);
    }
  };

  const handleGenerateFromTmdb = async (tmdbId, targetItem = activeItem) => {
    if (!targetItem || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/unmatched/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath: targetItem.videoPath,
          type: mediaType,
          tmdbId: String(tmdbId),
          season: Number(seasonNum) || 1,
          episode: Number(episodeNum) || 1,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', text: json.error || 'Errore durante la generazione' });
      } else {
        setFeedback({ type: 'success', text: json.message });
        // Rimuovi l'elemento appena processato dalla lista
        setData((prev) => ({
          ...prev,
          total: Math.max(0, prev.total - 1),
          items: prev.items.filter((x) => x.videoPath !== targetItem.videoPath),
        }));
        setActiveItem(null);
        if (onCatalogUpdated) onCatalogUpdated();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateManualOrConvert = async (customDataOverride = null, targetItem = activeItem) => {
    if (!targetItem || saving) return;
    setSaving(true);
    setFeedback(null);

    const payloadMeta = customDataOverride || {
      title: manualForm.title.trim(),
      showTitle: manualForm.showTitle.trim(),
      year: manualForm.year ? parseInt(String(manualForm.year), 10) : null,
      rating: manualForm.rating ? parseFloat(String(manualForm.rating)) : null,
      runtime: manualForm.runtime ? parseInt(String(manualForm.runtime), 10) : null,
      outline: manualForm.outline.trim(),
      plot: manualForm.outline.trim(),
      directors: manualForm.directors
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      genres: manualForm.genres
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      posterUrl: manualForm.posterUrl.trim(),
      backdropUrl: manualForm.backdropUrl.trim(),
      imdbId: manualForm.imdbId.trim(),
      tmdbId: manualForm.tmdbId.trim(),
      season: Number(seasonNum) || 1,
      episode: Number(episodeNum) || 1,
    };

    try {
      const res = await fetch('/api/unmatched/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath: targetItem.videoPath,
          type: mediaType,
          tmdbId: '',
          season: Number(seasonNum) || 1,
          episode: Number(episodeNum) || 1,
          customMeta: payloadMeta,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', text: json.error || 'Errore durante il salvataggio' });
      } else {
        setFeedback({ type: 'success', text: json.message });
        setData((prev) => ({
          ...prev,
          total: Math.max(0, prev.total - 1),
          items: prev.items.filter((x) => x.videoPath !== targetItem.videoPath),
        }));
        setActiveItem(null);
        if (onCatalogUpdated) onCatalogUpdated();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const filteredItems = data.items.filter((item) => {
    if (filterTab === 'missing_nfo') return item.status === 'missing_nfo';
    if (filterTab === 'missing_archos') return item.status === 'missing_archos';
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 bg-slate-950/85 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col bg-slate-900 sm:border border-slate-800 rounded-none sm:rounded-2xl shadow-2xl text-slate-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <FilePlus2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold text-white truncate">
                Scansione Media senza NFO (Nova Video Player)
              </h2>
              <p className="text-xs text-slate-400 truncate">
                Genera file <code>.archos.nfo</code>, <code>-poster.archos.jpg</code> e{' '}
                <code>-fanart.archos.jpg</code>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={fetchUnmatched}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer"
              title="Riscansiona file senza NFO"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-900 hover:bg-amber-500 text-slate-300 hover:text-slate-950 border border-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* TMDb Status & Feedback Bar */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-950/50 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-2">
            {data.tmdbConfigured ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                TMDb API collegata da .env (
                {data.hasReadAccessToken ? 'Read Access Token' : 'API Key'})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                Inserisci <code>TMDB_API_KEY</code> o <code>TMDB_READ_ACCESS_TOKEN</code> in{' '}
                <code>.env</code> per la ricerca automatica su TMDb
              </span>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                filterTab === 'all'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tutti ({data.total})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('missing_nfo')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                filterTab === 'missing_nfo'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Senza alcun NFO ({data.missingNfoCount})
            </button>
            {data.missingArchosCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterTab('missing_archos')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                  filterTab === 'missing_archos'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Da convertire in .archos ({data.missingArchosCount})
              </button>
            )}
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mx-4 sm:mx-6 mt-3 px-4 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 shrink-0 ${
              feedback.type === 'error'
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
            }`}
          >
            <span>{feedback.text}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="opacity-75 hover:opacity-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
              <p className="text-sm">
                Scansione dei file video privi di <code>.archos.nfo</code> sul NAS...
              </p>
            </div>
          ) : !activeItem ? (
            /* List of Unmatched Videos */
            filteredItems.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h3 className="text-base font-bold text-white">
                  Tutti i file video hanno già il loro file .archos.nfo!
                </h3>
                <p className="text-xs text-slate-400">
                  Nessun file video orfano trovato su \\storagepi\NAS\Movies.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredItems.map((item) => {
                  const isEp = item.detectedType === 'episode';
                  return (
                    <div
                      key={item.videoPath}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-amber-500/40 transition-all"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              isEp
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {isEp ? (
                              <>
                                <Tv className="w-3 h-3" />
                                Episodio S{String(item.season ?? 1).padStart(2, '0')}E
                                {String(item.episode ?? 1).padStart(2, '0')}
                              </>
                            ) : (
                              <>
                                <Film className="w-3 h-3" />
                                Film
                              </>
                            )}
                          </span>

                          <span className="font-bold text-sm text-white">
                            {item.parsedTitle}
                          </span>

                          {item.parsedYear && (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs">
                              {item.parsedYear}
                            </span>
                          )}

                          {item.sizeBytes && (
                            <span className="text-xs font-mono text-emerald-400">
                              {formatBytes(item.sizeBytes)}
                            </span>
                          )}

                          {item.status === 'missing_archos' && (
                            <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-medium">
                              Ha già .nfo standard (convertibile in 1 click)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono break-all">
                          <FileVideo className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>{item.videoPath}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {/* Se appartiene a una serie già dotata di tmdbId e TMDb è configurato, bottone rapido 1-click */}
                        {isEp && item.matchedShow?.tmdbId && data.tmdbConfigured && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => {
                              setMediaType('episode');
                              setSeasonNum(item.season ?? 1);
                              setEpisodeNum(item.episode ?? 1);
                              handleGenerateFromTmdb(item.matchedShow.tmdbId, item);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                            title={`Genera automaticamente come episodio di ${item.matchedShow.title}`}
                          >
                            <Wand2 className="w-3.5 h-3.5" />
                            Auto-Genera ({item.matchedShow.title})
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => selectUnmatchedItem(item)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Crea .archos.nfo
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* Active Item Matching & Generation View */
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveItem(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Torna alla lista dei file senza NFO
                </button>

                <button
                  type="button"
                  onClick={() => setShowManualEditor((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                  {showManualEditor ? 'Nascondi Editor Manuale' : 'Compila / Modifica Manualmente'}
                </button>
              </div>

              {/* Selected File Summary */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="text-[11px] text-slate-400 font-semibold uppercase">
                  File Video Selezionato
                </div>
                <div className="font-mono text-xs sm:text-sm text-white break-all">
                  {activeItem.videoPath}
                </div>
                <div className="text-[11px] text-emerald-400 font-mono">
                  Verrà creato: {activeItem.stem}.archos.nfo (+ poster/fanart .archos.jpg)
                </div>
              </div>

              {/* Quick Convert if standard .nfo already exists */}
              {activeItem.existingStdData && (
                <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs space-y-0.5">
                    <div className="font-bold text-sky-300">
                      Trovato file .nfo standard esistente ({activeItem.existingStdData.title})
                    </div>
                    <p className="text-slate-300">
                      Puoi convertire direttamente i dati del file <code>.nfo</code> esistente nel formato{' '}
                      <code>.archos.nfo</code> per Nova Video Player.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleGenerateManualOrConvert()}
                    className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shrink-0 cursor-pointer"
                  >
                    {saving ? 'Conversione...' : 'Converti subito in .archos.nfo'}
                  </button>
                </div>
              )}

              {/* Search Bar for TMDb */}
              <form
                onSubmit={handleSearchTmdb}
                className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-amber-400" />
                    Ricerca Metadati su TMDb (Italiano)
                  </span>

                  {/* Type Switch: Film vs Episodio Serie TV */}
                  <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setMediaType('movie')}
                      className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                        mediaType === 'movie'
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Film
                    </button>
                    <button
                      type="button"
                      onClick={() => setMediaType('episode')}
                      className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                        mediaType === 'episode'
                          ? 'bg-indigo-500 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Episodio Serie TV
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <div className={mediaType === 'episode' ? 'sm:col-span-5' : 'sm:col-span-7'}>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      {mediaType === 'episode' ? 'Titolo Serie TV' : 'Titolo Film'}
                    </label>
                    <input
                      type="text"
                      value={searchTitle}
                      onChange={(e) => setSearchTitle(e.target.value)}
                      placeholder="Es. Legend, VisionQuest, Doctor Sleep..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-400 mb-1">Anno</label>
                    <input
                      type="number"
                      value={searchYear}
                      onChange={(e) => setSearchYear(e.target.value)}
                      placeholder="Anno"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {mediaType === 'episode' && (
                    <>
                      <div className="sm:col-span-1">
                        <label className="block text-[11px] text-slate-400 mb-1">Stag.</label>
                        <input
                          type="number"
                          min="0"
                          value={seasonNum}
                          onChange={(e) => setSeasonNum(e.target.value)}
                          className="w-full px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <label className="block text-[11px] text-slate-400 mb-1">Ep.</label>
                        <input
                          type="number"
                          min="1"
                          value={episodeNum}
                          onChange={(e) => setEpisodeNum(e.target.value)}
                          className="w-full px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </>
                  )}

                  <div className="sm:col-span-3 flex items-end">
                    <button
                      type="submit"
                      disabled={searchingTmdb}
                      className="w-full py-2 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5" />
                      {searchingTmdb ? 'Ricerca...' : 'Cerca su TMDb'}
                    </button>
                  </div>
                </div>

                {tmdbError && (
                  <p className="text-xs text-rose-300 pt-1">{tmdbError}</p>
                )}
              </form>

              {/* TMDb Results Grid */}
              {tmdbResults.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Risultati TMDb ({tmdbResults.length}) — Clicca per generare i file Nova Video Player
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {tmdbResults.map((r) => (
                      <div
                        key={r.tmdbId}
                        className="flex gap-3.5 p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/40"
                      >
                        <div className="w-16 h-24 rounded-lg bg-slate-900 overflow-hidden shrink-0 border border-slate-800">
                          {r.posterUrl ? (
                            <img
                              src={r.posterUrl}
                              alt={r.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-700">
                              <Film className="w-6 h-6" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <h5 className="font-bold text-sm text-white truncate">
                                {r.title}
                              </h5>
                              {r.rating && (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 shrink-0">
                                  <Star className="w-3 h-3 fill-amber-400" />
                                  {r.rating}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {r.year || '—'} • TMDb ID: {r.tmdbId}
                            </div>
                            {r.overview && (
                              <p className="text-xs text-slate-300 line-clamp-2 mt-1">
                                {r.overview}
                              </p>
                            )}
                          </div>

                          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleGenerateFromTmdb(r.tmdbId)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              {saving
                                ? 'Salvataggio sul NAS...'
                                : 'Seleziona e Genera .archos.nfo'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual Metadata Editor */}
              {showManualEditor && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    Compilazione Manuale File .archos.nfo (Nova Video Player)
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="sm:col-span-2">
                      <label className="block text-slate-400 mb-1">
                        {mediaType === 'episode' ? 'Titolo Episodio *' : 'Titolo Film *'}
                      </label>
                      <input
                        type="text"
                        value={manualForm.title}
                        onChange={(e) =>
                          setManualForm({ ...manualForm, title: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Anno</label>
                      <input
                        type="number"
                        value={manualForm.year}
                        onChange={(e) =>
                          setManualForm({ ...manualForm, year: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                      />
                    </div>

                    {mediaType === 'episode' && (
                      <div className="sm:col-span-3">
                        <label className="block text-slate-400 mb-1">Titolo Serie TV</label>
                        <input
                          type="text"
                          value={manualForm.showTitle}
                          onChange={(e) =>
                            setManualForm({ ...manualForm, showTitle: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-slate-400 mb-1">Rating (0 - 10)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={manualForm.rating}
                        onChange={(e) =>
                          setManualForm({ ...manualForm, rating: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Durata (minuti)</label>
                      <input
                        type="number"
                        value={manualForm.runtime}
                        onChange={(e) =>
                          setManualForm({ ...manualForm, runtime: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">
                        Generi (separati da virgola)
                      </label>
                      <input
                        type="text"
                        value={manualForm.genres}
                        onChange={(e) =>
                          setManualForm({ ...manualForm, genres: e.target.value })
                        }
                        placeholder="Fantascienza, Azione"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-slate-400 mb-1">
                        Regista / Autore (separati da virgola)
                      </label>
                      <input
                        type="text"
                        value={manualForm.directors}
                        onChange={(e) =>
                          setManualForm({ ...manualForm, directors: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-slate-400 mb-1">Trama / Sinossi</label>
                      <textarea
                        rows={3}
                        value={manualForm.outline}
                        onChange={(e) =>
                          setManualForm({ ...manualForm, outline: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                      />
                    </div>

                    <div className="sm:col-span-3 flex justify-end pt-2">
                      <button
                        type="button"
                        disabled={saving || !manualForm.title.trim()}
                        onClick={() => handleGenerateManualOrConvert()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                        {saving ? 'Salvataggio...' : 'Salva .archos.nfo sul NAS'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
