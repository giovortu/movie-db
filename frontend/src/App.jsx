import React, { useEffect, useState, useCallback } from 'react';
import {
  Search,
  LayoutGrid,
  List,
  Film,
  Tv,
  RefreshCw,
  SlidersHorizontal,
  X,
  HardDrive,
  Star,
  ArrowUpDown,
  User,
  Users,
  Calendar,
  Tag,
  Sparkles,
  Wrench,
  CheckCircle2,
  ArrowUp,
} from 'lucide-react';
import MediaCard from './components/MediaCard.jsx';
import MediaListRow from './components/MediaListRow.jsx';
import MediaDetailModal from './components/MediaDetailModal.jsx';

export default function App() {
  // View mode: 'card' | 'list'
  const [viewMode, setViewMode] = useState('card');

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all'); // 'all' | 'movie' | 'tvshow'
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedDirector, setSelectedDirector] = useState('');
  const [selectedActor, setSelectedActor] = useState('');
  const [selectedStudio, setSelectedStudio] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [minRating, setMinRating] = useState('');
  const [sortBy, setSortBy] = useState('title_asc');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Data states
  const [items, setItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [visibleCount, setVisibleCount] = useState(60);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [facets, setFacets] = useState({
    types: { all: 0, movie: 0, tvshow: 0 },
    genres: [],
    directors: [],
    writers: [],
    actors: [],
    studios: [],
    years: [],
  });

  // Active modal item
  const [selectedItem, setSelectedItem] = useState(null);

  // Fix series state
  const [fixingSeries, setFixingSeries] = useState(false);
  const [fixReport, setFixReport] = useState(null);

  // Scroll to top visibility
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 500);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setVisibleCount(60);
    }, 220);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchStatusAndFacets = useCallback(async () => {
    try {
      const [statusRes, facetsRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/facets'),
      ]);
      if (statusRes.ok) {
        const st = await statusRes.json();
        setStatus(st);
      }
      if (facetsRes.ok) {
        const fc = await facetsRes.json();
        setFacets(fc);
      }
    } catch (err) {
      console.error('Errore caricamento stato/facets:', err);
    }
  }, []);

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set('q', debouncedQuery);
      if (selectedType !== 'all') params.set('type', selectedType);
      if (selectedGenre) params.set('genre', selectedGenre);
      if (selectedDirector) params.set('director', selectedDirector);
      if (selectedActor) params.set('actor', selectedActor);
      if (selectedStudio) params.set('studio', selectedStudio);
      if (selectedYear) params.set('year', selectedYear);
      if (minRating) params.set('minRating', minRating);
      if (sortBy) params.set('sort', sortBy);

      const res = await fetch(`/api/media?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setTotalItems(data.total || 0);
      }
    } catch (err) {
      console.error('Errore caricamento catalogo:', err);
    } finally {
      setLoading(false);
    }
  }, [
    debouncedQuery,
    selectedType,
    selectedGenre,
    selectedDirector,
    selectedActor,
    selectedStudio,
    selectedYear,
    minRating,
    sortBy,
  ]);

  useEffect(() => {
    fetchStatusAndFacets();
  }, [fetchStatusAndFacets]);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  // Poll scan progress while backend is scanning
  useEffect(() => {
    if (!status?.isScanning) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const st = await res.json();
          setStatus(st);
          if (!st.isScanning) {
            fetchStatusAndFacets();
            fetchMedia();
          }
        }
      } catch {
        // ignore
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [status?.isScanning, fetchStatusAndFacets, fetchMedia]);

  const handleStartScan = async () => {
    try {
      setFixReport(null);
      await fetch('/api/scan', { method: 'POST' });
      const res = await fetch('/api/status');
      if (res.ok) setStatus(await res.json());
    } catch (err) {
      console.error('Errore avvio scansione:', err);
    }
  };

  const handleFixSeries = async () => {
    if (fixingSeries) return;
    setFixingSeries(true);
    setFixReport(null);
    try {
      const res = await fetch('/api/fix-series', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setFixReport(data);
        await Promise.all([fetchStatusAndFacets(), fetchMedia()]);
      }
    } catch (err) {
      console.error('Errore Fix Series:', err);
    } finally {
      setFixingSeries(false);
    }
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setSelectedType('all');
    setSelectedGenre('');
    setSelectedDirector('');
    setSelectedActor('');
    setSelectedStudio('');
    setSelectedYear('');
    setMinRating('');
    setSortBy('title_asc');
    setVisibleCount(60);
  };

  const activeAdvancedCount = [
    selectedGenre,
    selectedDirector,
    selectedActor,
    selectedStudio,
    selectedYear,
    minRating,
  ].filter(Boolean).length;

  const hasActiveFilters =
    Boolean(debouncedQuery) || selectedType !== 'all' || activeAdvancedCount > 0;

  const visibleItems = items.slice(0, visibleCount);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800/80">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20 shrink-0">
              <Film className="w-4 h-4 sm:w-6 sm:h-6 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-xl font-extrabold tracking-tight text-white truncate">
                  Cinema<span className="text-amber-400">NAS</span>
                </h1>
                <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-900 text-slate-400 border border-slate-800">
                  <HardDrive className="w-3 h-3 text-amber-400" />
                  {status?.nasRoot || '\\\\storagepi\\NAS\\Movies'}
                </span>
              </div>
              {status?.stats ? (
                <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                  <span className="text-amber-400 font-semibold">
                    {status.stats.moviesCount} Film
                  </span>
                  {' • '}
                  <span className="text-indigo-400 font-semibold">
                    {status.stats.tvShowsCount} Serie
                  </span>
                  <span className="hidden sm:inline">
                    {' • '}
                    {status.stats.totalEpisodesCount} Episodi
                  </span>
                </p>
              ) : (
                <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                  Kodi / MX Player (.nfo)
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleFixSeries}
              disabled={fixingSeries || status?.isScanning}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                fixingSeries
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 cursor-wait'
                  : 'bg-indigo-600/20 hover:bg-indigo-600/30 active:bg-indigo-600/40 text-indigo-300 border-indigo-500/40'
              }`}
              title="Unifica le serie TV o miniserie divise su più card"
            >
              <Wrench
                className={`w-3.5 h-3.5 shrink-0 ${
                  fixingSeries ? 'animate-spin text-indigo-400' : 'text-indigo-400'
                }`}
              />
              <span>{fixingSeries ? 'Unifico...' : 'Fix series'}</span>
            </button>

            <button
              type="button"
              onClick={handleStartScan}
              disabled={status?.isScanning}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                status?.isScanning
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 cursor-wait'
                  : 'bg-slate-900 hover:bg-slate-800 active:bg-slate-800 text-slate-200 border-slate-700'
              }`}
              title="Riscansiona la cartella \\storagepi\NAS\Movies"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${
                  status?.isScanning ? 'animate-spin text-amber-400' : 'text-amber-400'
                }`}
              />
              <span className="hidden xs:inline sm:inline">
                {status?.isScanning ? 'Scansione...' : 'Aggiorna'}
              </span>
            </button>
          </div>
        </div>

        {/* Live Scan Banner */}
        {status?.isScanning && (
          <div className="bg-amber-500/10 border-t border-amber-500/20 px-3 sm:px-4 py-2">
            <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-2 text-xs text-amber-300">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-4 h-4 animate-pulse shrink-0" />
                <span className="truncate">
                  {status.progress?.message || 'Scansione NAS in corso...'}
                </span>
              </div>
              {status.progress?.totalGroups > 0 && (
                <span className="font-mono font-bold shrink-0">
                  {Math.round(
                    (status.progress.processedGroups / status.progress.totalGroups) * 100
                  )}
                  %
                </span>
              )}
            </div>
          </div>
        )}

        {/* Fix Series Report Banner */}
        {fixReport && (
          <div className="bg-indigo-500/15 border-t border-indigo-500/30 px-3 sm:px-4 py-2">
            <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 text-xs text-indigo-200">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold">{fixReport.message}</span>
                {fixReport.report?.mergedTitles?.length > 0 && (
                  <span className="text-indigo-300/90 line-clamp-1">
                    ({fixReport.report.mergedTitles.join(', ')})
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFixReport(null)}
                className="text-indigo-300 hover:text-white shrink-0 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {/* Control Bar: Search, Type Tabs, View Mode, Sort, Filter Toggle */}
        <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3 sm:p-4 shadow-xl mb-4 sm:mb-6 space-y-3 sm:space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5 sm:gap-3">
            {/* Search Box (text-base on mobile prevents iOS Safari auto-zoom) */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cerca titolo, regista, attore, genere, anno..."
                className="w-full pl-10 pr-9 py-2.5 bg-slate-950 border border-slate-800 focus:border-amber-500/60 rounded-xl text-base sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Type Filter Tabs (Full-width 3-col grid on mobile, inline on desktop) */}
            <div className="grid grid-cols-3 sm:flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedType('all');
                  setVisibleCount(60);
                }}
                className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold text-center transition-all cursor-pointer ${
                  selectedType === 'all'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tutti ({facets.types?.all || 0})
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedType('movie');
                  setVisibleCount(60);
                }}
                className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  selectedType === 'movie'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Film className="w-3.5 h-3.5 shrink-0" />
                <span>Film ({facets.types?.movie || 0})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedType('tvshow');
                  setVisibleCount(60);
                }}
                className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  selectedType === 'tvshow'
                    ? 'bg-indigo-500 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Tv className="w-3.5 h-3.5 shrink-0" />
                <span>Serie ({facets.types?.tvshow || 0})</span>
              </button>
            </div>

            {/* Mobile + Desktop Secondary Row: Sort + Advanced Filters + View Switcher */}
            <div className="flex items-center gap-2">
              {/* Sort Selector */}
              <div className="flex-1 sm:flex-initial flex items-center gap-1.5 bg-slate-950 px-2.5 sm:px-3 py-2 rounded-xl border border-slate-800 min-w-0">
                <ArrowUpDown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full bg-slate-950 text-xs font-medium text-slate-200 focus:outline-none cursor-pointer truncate"
                >
                  <option value="added_desc">Inserimento (Più recenti)</option>
                  <option value="added_asc">Inserimento (Meno recenti)</option>
                  <option value="title_asc">Titolo (A → Z)</option>
                  <option value="title_desc">Titolo (Z → A)</option>
                  <option value="year_desc">Anno (Più recenti)</option>
                  <option value="year_asc">Anno (Meno recenti)</option>
                  <option value="rating_desc">Rating (Più alto)</option>
                  <option value="rating_asc">Rating (Più basso)</option>
                  <option value="runtime_desc">Durata</option>
                </select>
              </div>

              {/* Advanced Filters Toggle */}
              <button
                type="button"
                onClick={() => setShowAdvancedFilters((v) => !v)}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer shrink-0 ${
                  showAdvancedFilters || activeAdvancedCount > 0
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Filtri</span>
                {activeAdvancedCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold">
                    {activeAdvancedCount}
                  </span>
                )}
              </button>

              {/* View Switcher (Card vs Lista) */}
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('card')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    viewMode === 'card'
                      ? 'bg-slate-800 text-amber-400 shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Visualizzazione a Card"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-slate-800 text-amber-400 shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Visualizzazione a Lista"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Lista</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Genre Bar (Horizontal Touch Scroll) */}
          {facets.genres?.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mr-1 shrink-0">
                Generi:
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedGenre('');
                  setVisibleCount(60);
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium shrink-0 transition-colors cursor-pointer ${
                  !selectedGenre
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                Tutti
              </button>
              {facets.genres.slice(0, 18).map((g) => (
                <button
                  key={g.name}
                  type="button"
                  onClick={() => {
                    setSelectedGenre(selectedGenre === g.name ? '' : g.name);
                    setVisibleCount(60);
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium shrink-0 transition-colors cursor-pointer ${
                    selectedGenre === g.name
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                  }`}
                >
                  {g.name}{' '}
                  <span className="text-[10px] opacity-65">({g.count})</span>
                </button>
              ))}
            </div>
          )}

          {/* Expandable Advanced Filters Drawer */}
          {showAdvancedFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3 pt-3 border-t border-slate-800/80">
              {/* Genere Select */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                  <Tag className="w-3 h-3 text-amber-400" />
                  Genere
                </label>
                <select
                  value={selectedGenre}
                  onChange={(e) => {
                    setSelectedGenre(e.target.value);
                    setVisibleCount(60);
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
                >
                  <option value="">Tutti i generi</option>
                  {facets.genres.map((g) => (
                    <option key={g.name} value={g.name}>
                      {g.name} ({g.count})
                    </option>
                  ))}
                </select>
              </div>

              {/* Regista / Autore Select */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                  <User className="w-3 h-3 text-amber-400" />
                  Autore / Regista
                </label>
                <select
                  value={selectedDirector}
                  onChange={(e) => {
                    setSelectedDirector(e.target.value);
                    setVisibleCount(60);
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
                >
                  <option value="">Tutti i registi/autori</option>
                  {facets.directors.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name} ({d.count})
                    </option>
                  ))}
                </select>
              </div>

              {/* Attore Select */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                  <Users className="w-3 h-3 text-amber-400" />
                  Attore / Cast
                </label>
                <select
                  value={selectedActor}
                  onChange={(e) => {
                    setSelectedActor(e.target.value);
                    setVisibleCount(60);
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
                >
                  <option value="">Tutti gli attori</option>
                  {facets.actors.map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name} ({a.count})
                    </option>
                  ))}
                </select>
              </div>

              {/* Anno Select */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-amber-400" />
                  Anno di uscita
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                    setVisibleCount(60);
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
                >
                  <option value="">Tutti gli anni</option>
                  {facets.years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              {/* Valutazione Minima */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-400" />
                  Rating Minimo
                </label>
                <select
                  value={minRating}
                  onChange={(e) => {
                    setMinRating(e.target.value);
                    setVisibleCount(60);
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
                >
                  <option value="">Qualsiasi valutazione</option>
                  <option value="8">★ 8.0+ (Capolavori)</option>
                  <option value="7">★ 7.0+ (Ottimi)</option>
                  <option value="6">★ 6.0+ (Buoni)</option>
                  <option value="5">★ 5.0+</option>
                </select>
              </div>
            </div>
          )}

          {/* Active Filters Pills & Results Summary */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-xs">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-slate-400">
                Risultati:{' '}
                <strong className="text-white font-bold">{totalItems}</strong>
              </span>

              {selectedGenre && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {selectedGenre}
                  <button
                    type="button"
                    onClick={() => setSelectedGenre('')}
                    className="hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedDirector && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Regia: {selectedDirector}
                  <button
                    type="button"
                    onClick={() => setSelectedDirector('')}
                    className="hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedActor && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Cast: {selectedActor}
                  <button
                    type="button"
                    onClick={() => setSelectedActor('')}
                    className="hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedStudio && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Studio: {selectedStudio}
                  <button
                    type="button"
                    onClick={() => setSelectedStudio('')}
                    className="hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedYear && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {selectedYear}
                  <button
                    type="button"
                    onClick={() => setSelectedYear('')}
                    className="hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {minRating && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  ★ ≥ {minRating}
                  <button
                    type="button"
                    onClick={() => setMinRating('')}
                    className="hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="text-amber-400 hover:text-amber-300 underline font-medium cursor-pointer"
              >
                Azzera filtri
              </button>
            )}
          </div>
        </div>

        {/* Content Grid or List */}
        {loading && items.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
            <p className="text-sm">Caricamento catalogo multimediale dal NAS...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 bg-slate-900/40 border border-slate-800/80 rounded-2xl flex flex-col items-center justify-center text-center px-4">
            <Film className="w-12 h-12 text-slate-700 mb-3" />
            <h3 className="text-base font-bold text-slate-200">
              Nessun film o serie TV trovato
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md">
              Prova a modificare i filtri attivi oppure esegui una nuova scansione della cartella NAS.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="mt-4 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition-colors cursor-pointer"
              >
                Mostra tutti i titoli
              </button>
            )}
          </div>
        ) : viewMode === 'card' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5">
            {visibleItems.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                showAddedDate={sortBy.startsWith('added_')}
                onSelect={setSelectedItem}
                onFilterDirector={(d) => {
                  setSelectedDirector(d);
                  setVisibleCount(60);
                }}
                onFilterGenre={(g) => {
                  setSelectedGenre(g);
                  setVisibleCount(60);
                }}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibleItems.map((item) => (
              <MediaListRow
                key={item.id}
                item={item}
                showAddedDate={sortBy.startsWith('added_')}
                onSelect={setSelectedItem}
                onFilterDirector={(d) => {
                  setSelectedDirector(d);
                  setVisibleCount(60);
                }}
                onFilterGenre={(g) => {
                  setSelectedGenre(g);
                  setVisibleCount(60);
                }}
                onFilterActor={(a) => {
                  setSelectedActor(a);
                  setVisibleCount(60);
                }}
              />
            ))}
          </div>
        )}

        {/* Load More Button */}
        {visibleCount < items.length && (
          <div className="mt-6 sm:mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + 60)}
              className="w-full sm:w-auto px-6 py-3 sm:py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-800 text-amber-400 font-semibold text-xs border border-slate-800 hover:border-amber-500/40 transition-all shadow-lg cursor-pointer"
            >
              Mostra altri ({items.length - visibleCount} rimanenti)
            </button>
          </div>
        )}
      </main>

      {/* Floating Scroll to Top Button */}
      {showScrollTop && !selectedItem && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-5 right-4 z-20 p-3 rounded-full bg-amber-500 text-slate-950 shadow-xl shadow-amber-500/20 hover:bg-amber-400 active:scale-95 transition-all cursor-pointer"
          title="Torna in alto"
        >
          <ArrowUp className="w-5 h-5 stroke-[2.5]" />
        </button>
      )}

      {/* Detail Modal */}
      {selectedItem && (
        <MediaDetailModal
          itemSummary={selectedItem}
          onClose={() => setSelectedItem(null)}
          onChanged={async () => {
            await Promise.all([fetchStatusAndFacets(), fetchMedia()]);
          }}
          onFilterDirector={(d) => {
            setSelectedDirector(d);
            setVisibleCount(60);
          }}
          onFilterGenre={(g) => {
            setSelectedGenre(g);
            setVisibleCount(60);
          }}
          onFilterActor={(a) => {
            setSelectedActor(a);
            setVisibleCount(60);
          }}
          onFilterStudio={(s) => {
            setSelectedStudio(s);
            setVisibleCount(60);
          }}
        />
      )}
    </div>
  );
}
