require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const sqlite3 = require('sqlite3').verbose();
// Database setup
const DB_PATH = path.join(__dirname, 'movies.db');
const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video TEXT,
    nfo TEXT,
    base TEXT,
    dir TEXT,
    title TEXT,
    originaltitle TEXT,
    plot TEXT,
    cover TEXT,
    poster TEXT,
    year TEXT
  )`);
    db.run(`CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video TEXT,
      nfo TEXT,
      base TEXT,
      dir TEXT,
      title TEXT,
      originaltitle TEXT,
      plot TEXT,
      year TEXT,
      showtitle TEXT,
      season TEXT,
      episode TEXT,
      aired TEXT,
      rating TEXT,
      imdbid TEXT,
      tmdbid TEXT,
      cover TEXT,
      poster TEXT
    )`);
});

// Configurazione: cartelle film da file config.json o .env
const CONFIG_PATH = path.join(__dirname, 'config.json');


const app = express();

app.use(cors());
app.use(express.json());

// Endpoint per ottenere la configurazione (movieDirs)
app.get('/api/setup', (req, res) => {
  let movieDirs = [];
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.movieDirs)) movieDirs = data.movieDirs;
    } catch (e) {}
  }
  res.json({ movieDirs });
});
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});



// Configurazione: cartelle film da file config.json o .env
function loadMovieDirs() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      if (!raw.trim()) return [];
      const data = JSON.parse(raw);
      if (Array.isArray(data.movieDirs)) return data.movieDirs;
    } catch (e) {}
  }
  return process.env.MOVIE_DIRS ? process.env.MOVIE_DIRS.split(';') : [];
}
var MOVIE_DIRS = loadMovieDirs();
if (MOVIE_DIRS.length > 0) {
  // Espone un solo endpoint /img/*
  app.get('/img/*', (req, res) => {
    // req.params[0] contiene il path richiesto dopo /img/
    const reqPath = req.params[0];
    // Trova la prima cartella che corrisponde al prefisso richiesto
    for (const dir of MOVIE_DIRS) {
      // Normalizza il prefisso (es: "mnt/Movies" da "/img/mnt/Movies/...")
      const prefix = dir.replace(/^[\/]+/, '').replace(/^[A-Za-z]:/, '').replace(/\\/g, '/');
      if (reqPath.startsWith(prefix)) {
        // Costruisce il path assoluto del file richiesto
        const absPath = path.join(dir, reqPath.slice(prefix.length).replace(/^\//, ''));
        if (fs.existsSync(absPath)) {
          return res.sendFile(absPath);
        }
      }
    }
    res.status(404).send('Immagine non trovata');
  });
  console.log('[IMG] Esposto /img/* per tutte le cartelle:', MOVIE_DIRS);
} else {
  console.warn('[IMG] Nessuna cartella film configurata, immagini non esposte!');
}


function getMovieInfoFromNfo(nfoPath) {
  return new Promise((resolve, reject) => {
    fs.readFile(nfoPath, 'utf8', (err, data) => {
      if (err) return reject(err);
      // Rimuove tutto ciò che precede il primo '<'
      const cleanData = data.slice(data.indexOf('<'));
      xml2js.parseString(cleanData, (err, result) => {
        if (err || !result ) {
          console.error(`[NFO] Errore parsing o struttura non valida in: ${nfoPath}`);
          return resolve({ title: '', originaltitle: '', plot: '', cover: null, poster: null });
        }
        // Supporta sia <movie> che <episodedetails>
        const node = result.movie || result.episodedetails || {};
        resolve({
          title: node.title ? node.title[0] : '',
          originaltitle: node.originaltitle ? node.originaltitle[0] : '',
          plot: node.plot ? node.plot[0] : (node.outline ? node.outline[0] : ''),
          year: node.year ? node.year[0] : '',
          showtitle: node.showtitle ? node.showtitle[0] : '',
          season: node.season ? node.season[0] : '',
          episode: node.episode ? node.episode[0] : '',
          aired: node.aired ? node.aired[0] : '',
          rating: node.rating ? node.rating[0] : '',
          imdbid: node.imdbid ? node.imdbid[0] : '',
          tmdbid: node.tmdbid ? node.tmdbid[0] : '',
          cover: null, // da calcolare dopo
          poster: null // da calcolare dopo
        });
      });
    });
  });
}


function scanDirRecursive(dir, found = []) {
  console.log(`[SCAN] Scansione cartella: ${dir}`);
  if (!fs.existsSync(dir)) return found;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDirRecursive(fullPath, found);
    } else {
      const ext = path.extname(file).toLowerCase();
      if ([".avi", ".mkv", ".mp4"].includes(ext)) {
        const base = path.join(dir, path.basename(file, ext));
        const nfoArchos = base + ".archos.nfo";
        const nfo = fs.existsSync(nfoArchos) ? nfoArchos : (fs.existsSync(base + ".nfo") ? base + ".nfo" : null);
        if (nfo && fs.existsSync(nfo)) {
          console.log(`[SCAN] Trovato video: ${fullPath}`);
          found.push({
            video: fullPath,
            nfo,
            base,
            dir
          });
        }
      }
    }
  }
  return found;
}

async function refreshDatabase() {
  return new Promise(async (resolve, reject) => {
    db.serialize(() => {
      db.run('DELETE FROM movies');
    });
    let allMovies = [];
    for (const dir of MOVIE_DIRS) {
      allMovies = allMovies.concat(scanDirRecursive(dir));
    }
    console.log(`[DEBUG] Totale file video trovati da scanDirRecursive: ${allMovies.length}`);
    // Raggruppa per showtitle se presente, altrimenti inserisce come film singolo
    const seriesMap = {};
    const singles = [];
    let countSkipped = 0;
    for (const m of allMovies) {
      try {
        const info = await getMovieInfoFromNfo(m.nfo);
        //console.log(`[DEBUG] NFO: ${m.nfo} | info:`, info);
        // Se è una serie ma manca il titolo episodio, usa il nome file video
        if (info.showtitle && !info.title && m.video) {
          info.title = path.basename(m.video, path.extname(m.video));
        }
        if (!info.title && !info.showtitle) {
          countSkipped++;
          // Logga anche il contenuto del file NFO se parsing vuoto
          try {
            const raw = fs.readFileSync(m.nfo, 'utf8');
            console.log(`[DEBUG] Contenuto NFO vuoto/parsing fallito: ${m.nfo}\n${raw}`);
          } catch (e) {
            console.log(`[DEBUG] Impossibile leggere NFO: ${m.nfo}`);
          }
          continue;
        }
        if (info.showtitle) {
          const key = info.showtitle;
          if (!seriesMap[key]) {
            seriesMap[key] = {
              showtitle: info.showtitle,
              plot: info.plot,
              year: info.year,
              cover: null,
              poster: null,
              episodes: []
            };
          }
          // Determina da quale cartella proviene il file
          // Trova la cartella di origine e costruisce il path relativo per l'endpoint unico
          const dirIdx = MOVIE_DIRS.findIndex(d => m.video.startsWith(d));
          const dirPrefix = dirIdx !== -1 ? MOVIE_DIRS[dirIdx].replace(/^[\\/]+/, '').replace(/^[A-Za-z]:/, '').replace(/\\/g, '/') : null;
          // Per le serie, cover = poster se esiste, altrimenti fanart
          if (!seriesMap[key].cover) {
            const poster = m.base + '-poster.archos.jpg';
            const fanart = m.base + '-fanart.archos.jpg';
            if (fs.existsSync(poster) && dirPrefix) {
              let rel = path.relative(MOVIE_DIRS[dirIdx], poster).replace(/\\/g, '/');
              rel = rel.replace(/^(\.\.\/)+/, '');
              seriesMap[key].cover = `/img/${dirPrefix}/${rel}`;
              seriesMap[key].poster = `/img/${dirPrefix}/${rel}`;
            } else if (fs.existsSync(fanart) && dirPrefix) {
              let rel = path.relative(MOVIE_DIRS[dirIdx], fanart).replace(/\\/g, '/');
              rel = rel.replace(/^(\.\.\/)+/, '');
              seriesMap[key].cover = `/img/${dirPrefix}/${rel}`;
              seriesMap[key].poster = null;
            }
          }
          seriesMap[key].episodes.push({
            title: info.title,
            season: info.season,
            episode: info.episode,
            aired: info.aired,
            nfo: m.nfo,
            video: m.video
          });
        } else {
          singles.push({ m, info });
        }
      } catch (e) {
        console.error(`[DB] Errore parsing/inserimento per ${m.nfo}:`, e);
      }
    }
    console.log(`[DB] Film singoli trovati: ${singles.length}`);
    console.log(`[DB] Serie trovate: ${Object.keys(seriesMap).length}`);
    console.log(`[DB] Elementi saltati (vuoti): ${countSkipped}`);
    // Inserisci serie TV (una riga per serie, dettagli episodi in JSON nel campo plot)
    for (const key in seriesMap) {
      const serie = seriesMap[key];
      if (!serie.episodes || serie.episodes.length === 0) {
        console.log(`[DB] Serie saltata (nessun episodio): ${serie.showtitle}`);
        continue;
      }
      db.run(
        `INSERT INTO movies (title, plot, year, showtitle, cover, poster, nfo, video, season, episode, aired, base, dir, originaltitle) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          serie.showtitle,
          serie.plot || '',
          serie.year,
          serie.showtitle,
          serie.cover,
          serie.poster,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null
        ],
        function (err) {
          if (err) {
            console.error(`[DB] Errore inserimento serie: ${serie.showtitle}`, err);
          } else {
            console.log(`[DB] Inserita serie: ${serie.showtitle} (${serie.episodes.length} episodi)`);
          }
        }
      );
    }
    // Inserisci film singoli
    for (const { m, info } of singles) {
      if (!info.title) {
        console.log(`[DB] Film singolo saltato (titolo vuoto): ${m.nfo}`);
        continue;
      }
      const cover = m.base + '-fanart.archos.jpg';
      const poster = m.base + '-poster.archos.jpg';
      let relCover = null;
      let relPoster = null;
      const dirIdx = MOVIE_DIRS.findIndex(d => m.video.startsWith(d));
      const dirPrefix = dirIdx !== -1 ? MOVIE_DIRS[dirIdx].replace(/^[\\/]+/, '').replace(/^[A-Za-z]:/, '').replace(/\\/g, '/') : null;
      if (fs.existsSync(cover) && dirPrefix) {
        let rel = path.relative(MOVIE_DIRS[dirIdx], cover).replace(/\\/g, '/');
        rel = rel.replace(/^(\.\.\/)+/, '');
        relCover = `/img/${dirPrefix}/${rel}`;
      }
      if (fs.existsSync(poster) && dirPrefix) {
        let rel = path.relative(MOVIE_DIRS[dirIdx], poster).replace(/\\/g, '/');
        rel = rel.replace(/^(\.\.\/)+/, '');
        relPoster = `/img/${dirPrefix}/${rel}`;
      }
      db.run(
        `INSERT INTO movies (video, nfo, base, dir, title, originaltitle, plot, year, showtitle, season, episode, aired, rating, imdbid, tmdbid, cover, poster) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          m.video,
          m.nfo,
          m.base,
          m.dir,
          info.title,
          info.originaltitle,
          info.plot,
          info.year,
          info.showtitle,
          info.season,
          info.episode,
          info.aired,
          info.rating,
          info.imdbid,
          info.tmdbid,
          relCover,
          relPoster
        ],
        function (err) {
          if (err) {
            console.error(`[DB] Errore inserimento film: ${info.title || m.video}`, err);
          } else {
            console.log(`[DB] Inserito film: ${info.title || m.video}`);
          }
        }
      );
    }
    resolve();
  });
}


app.get('/api/movies', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 12;
  let sort = req.query.sort || 'title';
  let dir = req.query.dir === 'desc' ? 'DESC' : 'ASC';
  const allowedSort = { title: 'title', year: 'year' };
  let sortCol = allowedSort[sort] || 'title';
  if (sortCol === 'year') sortCol = 'title';
  db.all(
    `SELECT * FROM movies ORDER BY ${sortCol} COLLATE NOCASE ${dir} LIMIT ? OFFSET ?`,
    [pageSize, (page - 1) * pageSize],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Errore DB' });
      db.get('SELECT COUNT(*) as count FROM movies', (err2, countRow) => {
        if (err2) return res.status(500).json({ error: 'Errore DB' });
        // Per ora restituisci solo i dati del database, senza arricchimento episodi
        res.json({
          movies: rows,
          total: countRow.count,
          page,
          pageSize
        });
      });
    }
  );
});

// Endpoint per refresh DB
app.post('/api/refresh', async (req, res) => {
  try {
    await refreshDatabase();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Errore durante il refresh del database' });
  }
});


// Endpoint per salvare la configurazione (movieDirs)
app.post('/api/setup', (req, res) => {
  const { movieDirs } = req.body;
  if (!Array.isArray(movieDirs) || movieDirs.length === 0) {
    return res.status(400).json({ error: 'movieDirs mancante o vuoto' });
  }
  const configPath = path.join(__dirname, 'config.json');
  const newConfig = { movieDirs };
  try {
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    // Aggiorna MOVIE_DIRS a runtime
    global.MOVIE_DIRS = movieDirs;
    res.json({ success: true });
  } catch (err) {
    console.error('Errore nel salvataggio del config:', err);
    res.status(500).json({ error: 'Errore nel salvataggio' });
  }
});

app.listen(3001, () => {
  console.log('Backend avviato su http://localhost:3001');
});
