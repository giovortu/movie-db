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
    poster TEXT
  )`);
});


const app = express();
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});
app.use(cors());
app.use(express.json());

// Espone le immagini statiche (poster, cover, ecc.)
app.use('/img', express.static(path.join(__dirname, 'mnt')));


// Configurazione: cartelle film da file config.json o .env
const CONFIG_PATH = path.join(__dirname, 'config.json');
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
let MOVIE_DIRS = loadMovieDirs();
// Endpoint per ottenere i path salvati
app.get('/api/setup', (req, res) => {
  res.json({ movieDirs: MOVIE_DIRS });
});

// Endpoint per setup dei path delle cartelle film
app.post('/api/setup', (req, res) => {
  const { movieDirs } = req.body;
  console.log('Ricevuto /api/setup:', req.body);
  if (!Array.isArray(movieDirs)) {
    console.error('movieDirs non è un array:', movieDirs);
    const resp = { error: 'movieDirs deve essere un array di path' };
    console.log('Risposta:', resp);
    return res.status(400).json(resp);
  }
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ movieDirs }, null, 2));
    MOVIE_DIRS = movieDirs;
    console.log('Salvataggio riuscito:', movieDirs);
    const resp = { success: true };
    console.log('Risposta:', resp);
    res.json(resp);
  } catch (e) {
    console.error('Errore nel salvataggio:', e);
    const resp = { error: 'Errore nel salvataggio della configurazione', details: e.message };
    console.log('Risposta:', resp);
    res.status(500).json(resp);
  }
});

function getMovieInfoFromNfo(nfoPath) {
  return new Promise((resolve, reject) => {
    fs.readFile(nfoPath, 'utf8', (err, data) => {
      if (err) return reject(err);
      // Rimuove tutto ciò che precede il primo '<'
      const cleanData = data.slice(data.indexOf('<'));
      xml2js.parseString(cleanData, (err, result) => {
        if (err || !result || typeof result.movie !== 'object') {
          console.error(`[NFO] Errore parsing o struttura non valida in: ${nfoPath}`);
          return resolve({ title: '', originaltitle: '', plot: '', cover: null, poster: null });
        }
        const movie = result.movie || {};
        resolve({
          title: movie.title ? movie.title[0] : '',
          originaltitle: movie.originaltitle ? movie.originaltitle[0] : '',
          plot: movie.plot ? movie.plot[0] : '',
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
        const nfo = base + ".nfo";
        if (fs.existsSync(nfo)) {
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
    for (const m of allMovies) {
      try {
        const info = await getMovieInfoFromNfo(m.nfo);
        const cover = m.base + '-fanart.archos.jpg';
        const poster = m.base + '-poster.archos.jpg';
        // Path relativo per immagini statiche (sempre sotto /img)
        let relCover = null;
        let relPoster = null;
        if (fs.existsSync(cover)) {
          let rel = path.relative(path.join(__dirname, 'mnt'), cover).replace(/\\/g, '/');
          relCover = '/img/' + rel;
        }
        if (fs.existsSync(poster)) {
          let rel = path.relative(path.join(__dirname, 'mnt'), poster).replace(/\\/g, '/');
          relPoster = '/img/' + rel;
        }
        db.run(
          `INSERT INTO movies (video, nfo, base, dir, title, originaltitle, plot, cover, poster) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            m.video,
            m.nfo,
            m.base,
            m.dir,
            info.title,
            info.originaltitle,
            info.plot,
            relCover,
            relPoster
          ]
        );
        console.log(`[DB] Inserito film: ${info.title || m.video}`);
      } catch (e) {
        console.error(`[DB] Errore parsing/inserimento per ${m.nfo}:`, e);
      }
    }
    resolve();
  });
}


app.get('/api/movies', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 12;
  let sort = req.query.sort || 'title';
  let dir = req.query.dir === 'desc' ? 'DESC' : 'ASC';
  // Solo colonne consentite
  const allowedSort = { title: 'title', year: 'year' };
  // year non esiste, quindi usiamo nfo per estrarre l'anno dal titolo se serve, oppure ignora year
  let sortCol = allowedSort[sort] || 'title';
  if (sortCol === 'year') sortCol = 'title'; // fallback, non c'è colonna year
  db.all(
    `SELECT * FROM movies ORDER BY ${sortCol} COLLATE NOCASE ${dir} LIMIT ? OFFSET ?`,
    [pageSize, (page - 1) * pageSize],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Errore DB' });
      db.get('SELECT COUNT(*) as count FROM movies', (err2, countRow) => {
        if (err2) return res.status(500).json({ error: 'Errore DB' });
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

app.listen(3001, () => {
  console.log('Backend avviato su http://localhost:3001');
});
