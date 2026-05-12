

import React, { useEffect, useState, useRef } from 'react';
import {
  AppBar, Toolbar, Typography, Container, Grid, Card, CardMedia, CardContent, CardActions, Button, IconButton, List, ListItem, ListItemText, Avatar, Pagination, ToggleButton, ToggleButtonGroup, CircularProgress, Box, Snackbar, Alert, TextField, InputAdornment,
  Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import SettingsIcon from '@mui/icons-material/Settings';
import RefreshIcon from '@mui/icons-material/Refresh';
import ImageIcon from '@mui/icons-material/Image';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import axios from 'axios';
import Setup from './Setup';
import Dialog from '@mui/material/Dialog';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

const PAGE_SIZE_OPTIONS = [3, 4, 6, 8, 12, 24, 48];
const API_BASE = (process.env.REACT_APP_API || 'http://192.168.0.227:4001').replace(/\/$/, '');
const VIDEO_BASE = (process.env.REACT_APP_VIDEO_BASE || 'http://192.168.0.227:8086').replace(/\/$/, '');

function getImageUrl(path) {
  if (!path) return undefined;
  if (path.startsWith('/img')) {
    return API_BASE + path;
  }
  return path;
}

function SeriesPlayDialog({ open, movie, onClose }) {
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedSeason, setExpandedSeason] = useState(null);

  useEffect(() => {
    if (!open || !movie) return;
    setLoading(true);
    setExpandedSeason(null);
    axios.get(`${API_BASE}/api/episodes`, { params: { showtitle: movie.showtitle } })
      .then(res => { setEpisodes(res.data.episodes || []); setLoading(false); })
      .catch(() => { setEpisodes([]); setLoading(false); });
  }, [open, movie]);

  // Raggruppa episodi per stagione e ordina
  const seasons = {};
  for (const ep of episodes) {
    const s = ep.season || '?';
    if (!seasons[s]) seasons[s] = [];
    seasons[s].push(ep);
  }
  const seasonKeys = Object.keys(seasons).sort((a, b) => {
    if (a === '?') return 1;
    if (b === '?') return -1;
    return parseInt(a) - parseInt(b);
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <Box p={2}>
        <Typography variant="h6" gutterBottom>{movie?.showtitle || movie?.title}</Typography>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>
        ) : episodes.length === 0 ? (
          <Typography color="text.secondary">Nessun episodio trovato.</Typography>
        ) : (
          seasonKeys.map(season => (
            <Accordion
              key={season}
              expanded={expandedSeason === season}
              onChange={() => setExpandedSeason(expandedSeason === season ? null : season)}
              disableGutters
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" fontWeight="bold">
                  {season === '?' ? 'Stagione sconosciuta' : `Stagione ${season}`}
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    ({seasons[season].length} ep.)
                  </Typography>
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                <List dense disablePadding>
                  {[...seasons[season]]
                    .sort((a, b) => (parseInt(a.episode) || 0) - (parseInt(b.episode) || 0))
                    .map(ep => {
                      const epAddress = ep.video
                        ? `${VIDEO_BASE}/${ep.video.replace('/mnt/', '/mount/')}`
                        : null;
                      return (
                        <ListItem
                          key={ep.id}
                          secondaryAction={
                            <IconButton
                              size="small"
                              color="primary"
                              href={epAddress || undefined}
                              target="_blank"
                              disabled={!epAddress}
                              component={epAddress ? 'a' : 'span'}
                              title="Riproduci episodio"
                            >
                              <PlayArrowIcon />
                            </IconButton>
                          }
                        >
                          <ListItemText
                            primary={`Ep. ${ep.episode || '?'} — ${ep.title || '(senza titolo)'}`}
                            secondary={ep.aired || undefined}
                          />
                        </ListItem>
                      );
                    })}
                </List>
              </AccordionDetails>
            </Accordion>
          ))
        )}
      </Box>
    </Dialog>
  );
}

function MovieCard({ movie, onDetails, onPoster, onPlay }) {
  // Mostra il poster come immagine principale se presente, altrimenti la fanart (cover), altrimenti il placeholder
  const previewUrl = movie.poster ? getImageUrl(movie.poster) : (movie.cover ? getImageUrl(movie.cover) : process.env.PUBLIC_URL + '/no-image.svg');
  // Se è una serie (ha showtitle e non ha season/episode), aggiungi (Serie) al titolo
  const isSerie = !!movie.showtitle && (!movie.season && !movie.episode);
  const displayTitle = (movie.title || movie.originaltitle) + (isSerie ? ' (Serie)' : '');
  const movieAddress = movie.video ? `${VIDEO_BASE}/${movie.video.replace("/mnt/", "/mount/")}` : null;

  return (
    <Card sx={{ width: 260, minWidth: 260, maxWidth: 260, minHeight: 420, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardMedia
        component="img"
        height="200"
        image={previewUrl}
        alt={movie.title}
        sx={{ objectFit: 'cover', cursor: movie.poster ? 'pointer' : 'default' }}
        onClick={movie.poster ? () => onPoster(movie.poster, movie.title) : undefined}
      />
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Typography gutterBottom variant="h6" component="div">
          {displayTitle}
        </Typography>
        {movie.year && (
          <Typography variant="subtitle2" color="text.secondary">
            Anno: {movie.year}
          </Typography>
        )}
        {movie.originaltitle && movie.originaltitle !== movie.title && (
          <Typography variant="subtitle2" color="text.secondary">
            Titolo originale: {movie.originaltitle}
          </Typography>
        )}
        {movie.genres && movie.genres.length > 0 && (
          <Typography variant="caption" color="primary" sx={{ mb: 1, mt: 1 }}>
            {movie.genres}
         </Typography>
        )}
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1, flexGrow: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', minHeight: 40 }}
        >
          {movie.plot}
        </Typography>
      </CardContent>
      <CardActions sx={{ mt: 'auto' }}>
        <Button
          size="small"
          variant="outlined"
          onClick={() => onPoster(movie.cover, movie.title)}
          title="Fanart"
          disabled={!movie.cover}
        >
          <ImageIcon />
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={isSerie ? () => onPlay(movie) : undefined}
          href={!isSerie ? (movieAddress || undefined) : undefined}
          target={!isSerie ? "_blank" : undefined}
          title={isSerie ? "Episodi" : "Apri Video"}
          disabled={!isSerie && !movieAddress}
        >
          <PlayArrowIcon />
        </Button>
        <Button size="small" variant="outlined" onClick={() => onDetails(movie)} title="Dettagli">
          <InfoOutlinedIcon />
        </Button>
      </CardActions>
    </Card>
  );
}

function MovieListItem({ movie, onDetails, onPoster, onPlay }) {
  // Se è una serie (ha showtitle e non ha season/episode), aggiungi (Serie) al titolo
  const isSerie = !!movie.showtitle && (!movie.season && !movie.episode);
  const displayTitle = (movie.title || movie.originaltitle) + (isSerie ? ' (Serie)' : '');
  // Mostra il poster come immagine principale se presente, altrimenti la fanart (cover), altrimenti il placeholder
  const previewUrl = movie.poster ? getImageUrl(movie.poster) : (movie.cover ? getImageUrl(movie.cover) : process.env.PUBLIC_URL + '/no-image.svg');
  const movieAddress = movie.video ? `${VIDEO_BASE}/${movie.video.replace("/mnt/", "/mount/")}` : null;


  return (
    <ListItem alignItems="center" sx={{ display: 'flex', alignItems: 'stretch', py: 1, width: 700, maxWidth: '100%' }} disableGutters>
      <Box sx={{ flex: '0 0 64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {previewUrl ? (
          <Avatar
            variant="square"
            src={previewUrl}
            alt={movie.title}
            sx={{ width: 56, height: 56, cursor: movie.poster ? 'pointer' : 'default' }}
            onClick={movie.poster ? () => onPoster(movie.poster, movie.title) : undefined}
          />
        ) : (
          <Avatar variant="square" sx={{ width: 56, height: 56 }}>{movie.title?.[0] || '?'}</Avatar>
        )}
      </Box>
      <Box sx={{ flex: '1 1 0', px: 2, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
        <Typography variant="subtitle1" noWrap>{displayTitle}</Typography>
        {movie.year && (
          <Typography variant="caption" color="text.secondary" noWrap>Anno: {movie.year}</Typography>
        )}
        {movie.originaltitle && movie.originaltitle !== movie.title && (
          <Typography variant="caption" color="text.secondary" noWrap>Titolo originale: {movie.originaltitle}</Typography>
        )}
        {movie.genres && movie.genres.length > 0 && (
          <Typography variant="caption" color="primary" noWrap sx={{ mb: 0.5, mt: 0.5 }}>
            {movie.genres}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.5 }}>
          {movie.plot}
        </Typography>
      </Box>
      <Box sx={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Button
          size="small"
          variant="outlined"
          onClick={() => onPoster(movie.cover, movie.title)}
          title="Fanart"
          disabled={!movie.cover}
        >
          <ImageIcon />
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={isSerie ? () => onPlay(movie) : undefined}
          href={!isSerie ? (movieAddress || undefined) : undefined}
          target={!isSerie ? "_blank" : undefined}
          title={isSerie ? "Episodi" : "Apri Video"}
          disabled={!isSerie && !movieAddress}
        >
          <PlayArrowIcon />
        </Button>
        <Button size="small" variant="outlined" onClick={() => onDetails(movie)} title="Dettagli">
          <InfoOutlinedIcon />
        </Button>
      </Box>
    </ListItem>
  );
}




function MainApp() {
  // Salva/ripristina pagina e ordinamento da localStorage
  const getInitialPage = () => {
    const val = localStorage.getItem('movie-db-page');
    return val ? parseInt(val, 10) : 1;
  };
  const getInitialSortField = () => localStorage.getItem('movie-db-sortField') || 'title';
  const getInitialSortDir = () => localStorage.getItem('movie-db-sortDir') || 'asc';

  const [loadingDialog, setLoadingDialog] = useState(false);
  const [movies, setMovies] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(getInitialPage());
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('card');
  const [openSetup, setOpenSetup] = useState(false);
  const [setupInitial, setSetupInitial] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [detailsMovie, setDetailsMovie] = useState(null);
  const [posterDialog, setPosterDialog] = useState({ open: false, url: '', title: '' });
  const [sortField, setSortField] = useState(getInitialSortField());
  const [sortDir, setSortDir] = useState(getInitialSortDir());
  const [genres, setGenres] = useState([]);
  const getInitialGenre = () => localStorage.getItem('movie-db-genre') || '';
  const [selectedGenre, setSelectedGenre] = useState(getInitialGenre());
  const getInitialPageSize = () => parseInt(localStorage.getItem('movie-db-pageSize'), 10) || 12;
  const [pageSize, setPageSize] = useState(getInitialPageSize());
  const [episodes, setEpisodes] = useState([]);
  const [playerDialog, setPlayerDialog] = useState({ open: false, url: '', title: '' });
  const [search, setSearch] = useState('');
  const searchDebounceRef = useRef(null);
  const [seriesDialog, setSeriesDialog] = useState({ open: false, movie: null });

  // Utility per ottenere url assoluto per il player
  function getPlayerUrl(url) {
    if (!url) return '';
    // Decodifica se url encoded
    let decoded = decodeURIComponent(url);
    if (/^https?:\/\//i.test(decoded) || /^file:\/\//i.test(decoded)) return decoded;
    return 'file://' + decoded;
  }

  // Funzione di normalizzazione coerente con il backend
  function normalizeTitle(str) {
    return (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9àèéìòù'\s]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Carica gli episodi quando si apre il dialog dettagli di una serie
  useEffect(() => {
    if (detailsMovie && detailsMovie.showtitle && !detailsMovie.season && !detailsMovie.episode) {
      const showtitle = detailsMovie.showtitle;
      const normalizedShowtitle = normalizeTitle(showtitle);
      console.log('Dettagli serie aperti, showtitle:', showtitle, 'normalizzato:', normalizedShowtitle);
      axios.get(`${API_BASE}/api/episodes`, { params: { showtitle } })
        .then(res => {
          // Filtro anche lato frontend per sicurezza
          const episodes = (res.data.episodes || []).filter(ep => normalizeTitle(ep.showtitle) === normalizedShowtitle);
          console.log('Episodi trovati:', episodes);
          setEpisodes(episodes);
        })
        .catch(err => {
          setEpisodes([]);
          console.error('Errore caricamento episodi:', err);
        });
    } else {
      setEpisodes([]);
    }
  }, [detailsMovie]);
  // Carica i generi dal backend
  useEffect(() => {
    axios.get(`${API_BASE}/api/genres`)
      .then(res => setGenres(res.data.genres || []))
      .catch(() => setGenres([]));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setLoadingDialog(true);
    try {
      const res = await axios.post(`${API_BASE}/api/refresh`);
      if (res.status !== 200) {
        setRefreshError(true);
        console.error('Errore API refresh:', res);
      } else {
        await fetchMovies(page);
      }
    } catch (e) {
      setRefreshError(true);
      console.error('Errore chiamata refresh:', e);
    }
    setRefreshing(false);
    setLoadingDialog(false);
    setConfirmRefresh(false);
  };
  // Dialog di caricamento per refresh database
  // (deve essere nel return, non dentro handleRefresh)
      <Dialog open={loadingDialog} PaperProps={{ sx: { p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' } }}>
        <CircularProgress sx={{ mb: 2 }} />
        <Typography variant="h6">Scansione in corso...</Typography>
        <Typography variant="body2" color="text.secondary">La scansione del database potrebbe richiedere alcuni minuti.</Typography>
      </Dialog>

  const handleOpenSetup = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/setup`);
      console.log('API /api/setup response:', res.data);
      setSetupInitial(res.data.movieDirs || []);
    } catch (e) {
      alert('Errore chiamata API /api/setup: ' + (e?.message || e));
      setSetupInitial([]);
    }
    setOpenSetup(true);
  };

  const fetchMovies = async (page, sort = sortField, dir = sortDir, genre = selectedGenre, pageSizeParam = pageSize, searchParam = search) => {
    setLoading(true);
    try {
      const params = { page, pageSize: pageSizeParam, sort, dir };
      if (genre && genre !== '') params.genre = genre;
      if (searchParam && searchParam !== '') params.search = searchParam;
      const res = await axios.get(`${API_BASE}/api/movies`, { params });
      let filtered = res.data.movies;
      let total = res.data.total;
      setMovies(filtered);
      setTotal(total);
    } catch (e) {
      setMovies([]);
      setTotal(0);
    }
    setLoading(false);
  };


  // Salva su localStorage quando cambiano
  useEffect(() => {
    localStorage.setItem('movie-db-page', page);
  }, [page]);
  useEffect(() => {
    localStorage.setItem('movie-db-sortField', sortField);
  }, [sortField]);
  useEffect(() => {
    localStorage.setItem('movie-db-sortDir', sortDir);
  }, [sortDir]);

  useEffect(() => {
    fetchMovies(page, sortField, sortDir, selectedGenre, pageSize, search);
    // eslint-disable-next-line
  }, [page, sortField, sortDir, selectedGenre, pageSize]);
  useEffect(() => {
    localStorage.setItem('movie-db-pageSize', pageSize);
  }, [pageSize]);

  useEffect(() => {
    localStorage.setItem('movie-db-genre', selectedGenre);
  }, [selectedGenre]);

  // Debounce ricerca: aspetta 300ms dall'ultima digitazione, poi ricarica dalla pagina 1
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      fetchMovies(1, sortField, sortDir, selectedGenre, pageSize, search);
    }, 300);
    return () => clearTimeout(searchDebounceRef.current);
    // eslint-disable-next-line
  }, [search]);

  const handleView = (event, nextView) => {
    if (nextView !== null) setView(nextView);
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            MovieDB
          </Typography>
          <ToggleButtonGroup
            value={view}
            exclusive
            onChange={handleView}
            aria-label="visualizzazione"
            size="small"
            sx={{ background: 'rgba(255,255,255,0.1)', borderRadius: 1, mr: 2 }}
          >
            <ToggleButton value="list" aria-label="Lista">
              <ViewListIcon sx={{ color: 'white' }} />
            </ToggleButton>
            <ToggleButton value="card" aria-label="Card">
              <ViewModuleIcon sx={{ color: 'white' }} />
            </ToggleButton>
          </ToggleButtonGroup>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ fontSize: '1rem', padding: '4px 8px', borderRadius: 4, marginRight: 16 }} data-testid="page-size-select">
            {PAGE_SIZE_OPTIONS.map(opt => (
              <option key={opt} value={opt}>{opt} / pagina</option>
            ))}
          </select>
          <IconButton color="inherit" onClick={() => setConfirmRefresh(true)} title="Aggiorna database" disabled={refreshing}>
            <RefreshIcon />
          </IconButton>
      <Dialog open={confirmRefresh} onClose={() => setConfirmRefresh(false)}>
        <Box sx={{ p: 3, minWidth: 300 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Sei sicuro di voler riscansionare il database?</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>L'operazione potrebbe richiedere alcuni minuti e sovrascriverà i dati attuali.</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button onClick={() => setConfirmRefresh(false)} color="secondary">Annulla</Button>
            <Button onClick={handleRefresh} color="primary" variant="contained" autoFocus>Conferma</Button>
          </Box>
        </Box>
      </Dialog>
          <IconButton color="inherit" onClick={handleOpenSetup} title="Setup cartelle">
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Dialog open={loadingDialog} PaperProps={{ sx: { p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' } }}>
        <CircularProgress sx={{ mb: 2 }} />
        <Typography variant="h6">Scansione in corso...</Typography>
        <Typography variant="body2" color="text.secondary">La scansione del database potrebbe richiedere alcuni minuti.</Typography>
      </Dialog>
      <Dialog open={openSetup} onClose={() => setOpenSetup(false)} maxWidth="sm" fullWidth>
        <Setup initialPaths={setupInitial} onClose={() => setOpenSetup(false)} />
      </Dialog>
      <Dialog open={!!detailsMovie} onClose={() => { setDetailsMovie(null); setEpisodes([]); }} maxWidth="sm" fullWidth>
        {detailsMovie && (
          <Box p={3}>
            <Typography variant="h5" gutterBottom>{detailsMovie.title || detailsMovie.originaltitle}</Typography>
            {detailsMovie.originaltitle && detailsMovie.originaltitle !== detailsMovie.title && (
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Titolo originale: {detailsMovie.originaltitle}
              </Typography>
            )}
            {detailsMovie.genres && detailsMovie.genres.length > 0 && (
              <Typography variant="caption" color="primary" gutterBottom>
                {detailsMovie.genres}
              </Typography>
            )}
            <Box mb={2}>
              <img
                src={detailsMovie.poster ? getImageUrl(detailsMovie.poster) : process.env.PUBLIC_URL + '/no-image.svg'}
                alt={detailsMovie.title}
                style={{ width: '100%', maxHeight: 300, objectFit: 'contain', marginBottom: 16 }}
              />
            </Box>
            <Typography variant="body1" gutterBottom><b>Trama:</b> {detailsMovie.plot}</Typography>
            {detailsMovie.poster && (
              <Button size="small" variant="outlined" onClick={() => setPosterDialog({ open: true, url: getImageUrl(detailsMovie.poster), title: detailsMovie.title })} sx={{ mr: 1 }}>Poster</Button>
            )}
            <Button size="small" variant="outlined" href={detailsMovie.video} target="_blank">Apri Video</Button>
            {/* Lista episodi per le serie */}
            {detailsMovie.showtitle && !detailsMovie.season && !detailsMovie.episode && (
              <Box mt={3}>
                <Typography variant="h6" gutterBottom>Episodi</Typography>
                {episodes.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">Nessun episodio trovato.</Typography>
                ) : (
                  <List dense>
                    {episodes.map(ep => {
                      if (ep.video) {
                        const url = getPlayerUrl(ep.video);
                        if (/^https?:\/\//i.test(url)) {
                          return (
                            <ListItem
                              key={ep.id}
                              sx={{ pl: 0 }}
                              button
                              onClick={() => window.open(url, '_blank', 'noopener')}
                            >
                              <ListItemText
                                primary={`Stagione ${ep.season || '?'} Ep. ${ep.episode || '?'}: ${ep.title || ''}`}
                                secondary={ep.aired ? `Data: ${ep.aired}` : ''}
                              />
                            </ListItem>
                          );
                        } else {
                          // file:// o altro: uso <a> nativo
                          return (
                            <ListItem
                              key={ep.id}
                              sx={{ pl: 0 }}
                              component="a"
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ListItemText
                                primary={`Stagione ${ep.season || '?'} Ep. ${ep.episode || '?'}: ${ep.title || ''}`}
                                secondary={ep.aired ? `Data: ${ep.aired}` : ''}
                              />
                            </ListItem>
                          );
                        }
                      } else {
                        return (
                          <ListItem key={ep.id} sx={{ pl: 0 }}>
                            <ListItemText
                              primary={`Stagione ${ep.season || '?'} Ep. ${ep.episode || '?'}: ${ep.title || ''}`}
                              secondary={ep.aired ? `Data: ${ep.aired}` : ''}
                            />
                          </ListItem>
                        );
                      }
                    })}
                        {/* Player Dialog rimosso: ora i video si aprono in una nuova finestra */}
                  </List>
                )}
              </Box>
            )}
          </Box>
        )}
      </Dialog>
      <Dialog open={posterDialog.open} onClose={() => setPosterDialog({ open: false, url: '', title: '' })} maxWidth="md">
        <Box p={2}>
          <img src={posterDialog.url} alt={posterDialog.title} style={{ width: '100%', maxWidth: 600, display: 'block', margin: '0 auto' }} />
        </Box>
      </Dialog>
      <Snackbar open={refreshError} autoHideDuration={4000} onClose={() => setRefreshError(false)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert onClose={() => setRefreshError(false)} severity="error" sx={{ width: '100%' }}>
          Errore durante l'aggiornamento del database!
        </Alert>
      </Snackbar>
      <Container sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', justifyContent: 'space-between', mb: 3, gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Cerca titolo…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
                endAdornment: search ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearch('')}><ClearIcon fontSize="small" /></IconButton>
                  </InputAdornment>
                ) : null,
              }}
              sx={{ minWidth: 200 }}
            />
            <span>Ordina per:</span>
            <select value={sortField} onChange={e => { setSortField(e.target.value); setPage(1); }} style={{ fontSize: '1rem', padding: '4px 8px', borderRadius: 4 }} data-testid="sort-field-select">
              <option value="title">Titolo</option>
              <option value="year">Anno</option>
            </select>
            <select value={sortDir} onChange={e => { setSortDir(e.target.value); setPage(1); }} style={{ fontSize: '1rem', padding: '4px 8px', borderRadius: 4 }} data-testid="sort-dir-select">
              <option value="asc">Crescente</option>
              <option value="desc">Decrescente</option>
            </select>
            <select value={selectedGenre} onChange={e => { setSelectedGenre(e.target.value); setPage(1); }} style={{ fontSize: '1rem', padding: '4px 8px', borderRadius: 4, minWidth: 120 }} data-testid="genre-select">
              <option value="">Tutti i generi</option>
              <option value="__serie__">📺 Serie TV</option>
              {genres.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </Box>
          <Pagination
            count={Math.ceil(total / pageSize)}
            page={page}
            onChange={(_, value) => setPage(value)}
            color="primary"
          />
        </Box>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          view === 'card' ? (
            <Grid container spacing={3}>
              {movies.map((movie, idx) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={idx}>
                  <MovieCard movie={movie} onDetails={setDetailsMovie} onPoster={(url, title) => setPosterDialog({ open: true, url: getImageUrl(url), title })} onPlay={(m) => setSeriesDialog({ open: true, movie: m })} />
                </Grid>
              ))}
            </Grid>
          ) : (
            <Box sx={{ width: { xs: '100%', md: '66.666%' }, mx: 'auto' }}>
              <List>
                {movies.map((movie, idx) => (
                  <MovieListItem movie={movie} key={idx} onDetails={setDetailsMovie} onPoster={(url, title) => setPosterDialog({ open: true, url: getImageUrl(url), title })} onPlay={(m) => setSeriesDialog({ open: true, movie: m })} />
                ))}
              </List>
            </Box>
          )
        )}
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Pagination
            count={Math.ceil(total / pageSize)}
            page={page}
            onChange={(_, value) => setPage(value)}
            color="primary"
          />
        </Box>
      </Container>
      <SeriesPlayDialog
        open={seriesDialog.open}
        movie={seriesDialog.movie}
        onClose={() => setSeriesDialog({ open: false, movie: null })}
      />
    </Box>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/setup" element={<Setup />} />
      </Routes>
    </Router>
  );
}

export default App;
