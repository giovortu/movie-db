# CinemaNAS — Database Film & Serie TV (Kodi / MX Player `.nfo`)

Applicazione full-stack **Node.js** (**Backend Express** + **Frontend React / Vite / Tailwind CSS**) progettata per indicizzare, esplorare e cercare il catalogo di film e serie TV archiviati nella cartella di rete `\\storagepi\NAS\Movies`.

Supporta nativamente i file `.archos.nfo` e `.nfo` (standard XML **Kodi / MX Player / Nova Video Player / Jellyfin**) e risolve automaticamente le locandine e gli sfondi locali (`*-poster.archos.jpg`, `*-fanart.archos.jpg`, `*-poster.jpg`, `*-backdrop.jpg`, `*-logo.png`, ecc.) con fallback alle immagini remote TMDb presenti nei tag `<thumb>` del file `.nfo`.

---

## Caratteristiche Principali

- **Scansione intelligente di `\\storagepi\NAS\Movies`**:
  - Legge e unisce automaticamente i metadati da `.archos.nfo` (prioritario per descrizioni e generi in italiano generati da MX Player/Archos) e `.nfo` standard.
  - Raggruppa automaticamente le **Serie TV** (`<tvshow>`) e i singoli episodi (`<episodedetails>`) ordinati per stagione ed episodio.
  - Associa automaticamente i file immagine locali (`-poster.archos.jpg`, `-fanart.archos.jpg`, `-poster.jpg`, `-backdrop.jpg`, `-logo.png`) e li serve tramite un endpoint di streaming locale con caching HTTP (`/api/image`).
  - Salva il database indicizzato in cache (`backend/data/library-cache.json`) per un avvio istantaneo e permette di aggiornare il catalogo in qualsiasi momento tramite il pulsante **Aggiorna NAS**.
- **Doppia Modalità di Visualizzazione**:
  - **Vista Card (Griglia)**: griglia di locandine in formato 2:3 con badge Film/Serie TV, valutazione, anno, durata, autore/regista, generi e anteprima della trama al passaggio del mouse.
  - **Vista Lista (Tabella dettagliata)**: righe compatte con miniatura, titolo e titolo originale, anno, durata/stagioni, regia, cast principale, generi, percorso cartella e valutazione.
- **Ricerca e Filtri Combinabili in Tempo Reale**:
  - **Ricerca libera** su titolo, titolo originale, regista/autore, sceneggiatore, attore, ruolo, genere, casa di produzione, tag, trama e percorso file.
  - **Filtri dedicati** per Tipo (*Tutti*, *Film*, *Serie TV*), *Genere*, *Autore / Regista*, *Attore*, *Studio*, *Anno di uscita* e *Rating minimo*.
  - **Ordinamento** per Titolo (A-Z / Z-A), Anno (più recenti / meno recenti), Valutazione (più alta / più bassa) e Durata.
- **Scheda di Dettaglio Completa**:
  - Sfondo *Fanart*, *Poster*, trama completa, cast completo con ruoli, registi, sceneggiatori, studi di produzione, link diretti a **IMDb**, **TMDb** e **Trailer YouTube**, copia rapida del percorso di rete NAS e navigatore interattivo delle stagioni e degli episodi per le Serie TV.

---

## Avvio Rapido

### 1. Installazione dipendenze
Dalla cartella principale del progetto:
```bash
npm run install:all
```

### 2. Avvio simultaneo Backend + Frontend (Sviluppo)
```bash
npm run dev
```
- **Frontend Web UI**: `http://localhost:5173`
- **Backend API**: `http://localhost:3001`

### 3. Scansione manuale da riga di comando (opzionale)
```bash
npm run scan --prefix backend
```
*(Per personalizzare il percorso NAS è possibile impostare la variabile d'ambiente `NAS_MOVIES_PATH`, di default impostata su `\\storagepi\NAS\Movies`).*
