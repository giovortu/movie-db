
import React, { useEffect, useState } from 'react';
import {
  AppBar, Toolbar, Typography, Container, Grid, Card, CardMedia, CardContent, CardActions, Button, IconButton, List, ListItem, ListItemAvatar, ListItemText, Avatar, Pagination, ToggleButton, ToggleButtonGroup, CircularProgress, Box, Snackbar, Alert
} from '@mui/material';
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
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';

const PAGE_SIZE = 12;

function getImageUrl(path) {
  if (!path) return undefined;
  if (path.startsWith('/img')) {
    // Usa la base URL del backend (porta 3001)
    const api = process.env.REACT_APP_API || 'http://localhost:3001';
    return api.replace(/\/$/, '') + path;
  }
  return path;
}

function MovieCard({ movie, onDetails, onPoster }) {
  // Usa il poster se presente, altrimenti la cover (fanart), altrimenti il placeholder
  const previewUrl = movie.poster ? getImageUrl(movie.poster)
    : (movie.cover ? getImageUrl(movie.cover) : process.env.PUBLIC_URL + '/no-image.svg');
  // Se è una serie (ha showtitle e non ha season/episode), aggiungi (Serie) al titolo
  const isSerie = !!movie.showtitle && (!movie.season && !movie.episode);
  const displayTitle = (movie.title || movie.originaltitle) + (isSerie ? ' (Serie)' : '');
  return (
    <Card sx={{ width: 260, minWidth: 260, maxWidth: 260, minHeight: 420, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardMedia component="img" height="200" image={previewUrl} alt={movie.title} sx={{ objectFit: 'cover' }} />
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
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1, flexGrow: 1, display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {movie.plot}
        </Typography>
      </CardContent>
      <CardActions sx={{ mt: 'auto' }}>
        <Button
          size="small"
          variant="outlined"
          onClick={() => onPoster(movie.poster, movie.title)}
          title="Poster"
          disabled={!movie.poster}
        >
          <ImageIcon />
        </Button>
        <Button size="small" variant="outlined" href={movie.video} target="_blank" title="Apri Video">
          <PlayArrowIcon />
        </Button>
        <Button size="small" variant="outlined" onClick={() => onDetails(movie)} title="Dettagli">
          <InfoOutlinedIcon />
        </Button>
      </CardActions>
    </Card>
  );
}

function MovieListItem({ movie, onDetails, onPoster }) {
  // Se è una serie (ha showtitle e non ha season/episode), aggiungi (Serie) al titolo
  const isSerie = !!movie.showtitle && (!movie.season && !movie.episode);
  const displayTitle = (movie.title || movie.originaltitle) + (isSerie ? ' (Serie)' : '');
  // Usa il poster se presente, altrimenti la cover (fanart), altrimenti il placeholder
  const previewUrl = movie.poster ? getImageUrl(movie.poster)
    : (movie.cover ? getImageUrl(movie.cover) : process.env.PUBLIC_URL + '/no-image.svg');
  return (
    <ListItem alignItems="center" sx={{ display: 'flex', alignItems: 'stretch', py: 1, width: 700, maxWidth: '100%' }} disableGutters>
      <Box sx={{ flex: '0 0 64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {previewUrl ? (
          <Avatar variant="square" src={previewUrl} alt={movie.title} sx={{ width: 56, height: 56 }} />
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
        <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.5 }}>
          {movie.plot}
        </Typography>
      </Box>
      <Box sx={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Button
          size="small"
          variant="outlined"
          onClick={() => onPoster(movie.poster, movie.title)}
          title="Poster"
          disabled={!movie.poster}
        >
          <ImageIcon />
        </Button>
        <Button size="small" variant="outlined" href={movie.video} target="_blank" title="Apri Video">
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
    // Dialog di caricamento per refresh
    const [loadingDialog, setLoadingDialog] = useState(false);
  const [movies, setMovies] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('card');
  const [openSetup, setOpenSetup] = useState(false);
  const [setupInitial, setSetupInitial] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [detailsMovie, setDetailsMovie] = useState(null);
  const [posterDialog, setPosterDialog] = useState({ open: false, url: '', title: '' });
  const [sortField, setSortField] = useState('title');
  const [sortDir, setSortDir] = useState('asc');

  const handleRefresh = async () => {
    setRefreshing(true);
    setLoadingDialog(true);
    try {
      const res = await axios.post(`${process.env.REACT_APP_API}/api/refresh`);
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
  };
  // Dialog di caricamento per refresh database
  // (deve essere nel return, non dentro handleRefresh)
      <Dialog open={loadingDialog} PaperProps={{ sx: { p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' } }}>
        <CircularProgress sx={{ mb: 2 }} />
        <Typography variant="h6">Scansione in corso...</Typography>
        <Typography variant="body2" color="text.secondary">La scansione del database potrebbe richiedere alcuni minuti.</Typography>
      </Dialog>

  const handleOpenSetup = async () => {
    const apiUrl = `${process.env.REACT_APP_API || 'http://localhost:3001'}/api/setup`;
    console.log('handleOpenSetup chiamato, url:', apiUrl);
    try {
      const res = await axios.get(apiUrl);
      console.log('API /api/setup response:', res.data);
      setSetupInitial(res.data.movieDirs || []);
    } catch (e) {
      alert('Errore chiamata API /api/setup: ' + (e?.message || e));
      setSetupInitial([]);
    }
    setOpenSetup(true);
  };

  const fetchMovies = async (page, sort = sortField, dir = sortDir) => {
    setLoading(true);
    try {
      const res = await axios.get(`${process.env.REACT_APP_API}/api/movies`, {
        params: {
          page,
          pageSize: PAGE_SIZE,
          sort,
          dir,
        },
      });
      setMovies(res.data.movies);
      setTotal(res.data.total);
    } catch (e) {
      setMovies([]);
      setTotal(0);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMovies(page, sortField, sortDir);
    // eslint-disable-next-line
  }, [page, sortField, sortDir]);

  const handleView = (event, nextView) => {
    if (nextView !== null) setView(nextView);
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Database Film
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
              <ViewListIcon />
            </ToggleButton>
            <ToggleButton value="card" aria-label="Card">
              <ViewModuleIcon />
            </ToggleButton>
          </ToggleButtonGroup>
          <IconButton color="inherit" onClick={handleRefresh} title="Aggiorna database" disabled={refreshing}>
            <RefreshIcon />
          </IconButton>
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
      <Dialog open={!!detailsMovie} onClose={() => setDetailsMovie(null)} maxWidth="sm" fullWidth>
        {detailsMovie && (
          <Box p={3}>
            <Typography variant="h5" gutterBottom>{detailsMovie.title || detailsMovie.originaltitle}</Typography>
            {detailsMovie.originaltitle && detailsMovie.originaltitle !== detailsMovie.title && (
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Titolo originale: {detailsMovie.originaltitle}
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span>Ordina per:</span>
            <select value={sortField} onChange={e => { setSortField(e.target.value); setPage(1); }} style={{ fontSize: '1rem', padding: '4px 8px', borderRadius: 4 }}>
              <option value="title">Titolo</option>
              <option value="year">Anno</option>
            </select>
            <select value={sortDir} onChange={e => { setSortDir(e.target.value); setPage(1); }} style={{ fontSize: '1rem', padding: '4px 8px', borderRadius: 4 }}>
              <option value="asc">Crescente</option>
              <option value="desc">Decrescente</option>
            </select>
          </Box>
          <Pagination
            count={Math.ceil(total / PAGE_SIZE)}
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
                  <MovieCard movie={movie} onDetails={setDetailsMovie} onPoster={(url, title) => setPosterDialog({ open: true, url: getImageUrl(url), title })} />
                </Grid>
              ))}
            </Grid>
          ) : (
            <Box sx={{ width: { xs: '100%', md: '66.666%' }, mx: 'auto' }}>
              <List>
                {movies.map((movie, idx) => (
                  <MovieListItem movie={movie} key={idx} onDetails={setDetailsMovie} onPoster={(url, title) => setPosterDialog({ open: true, url: getImageUrl(url), title })} />
                ))}
              </List>
            </Box>
          )
        )}
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Pagination
            count={Math.ceil(total / PAGE_SIZE)}
            page={page}
            onChange={(_, value) => setPage(value)}
            color="primary"
          />
        </Box>
      </Container>
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
