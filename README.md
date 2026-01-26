# Movie DB

Progetto Node.js per la gestione di un database di film.

## Funzionalità richieste
- Configurazione delle cartelle dove sono memorizzati i film
- Lettura delle informazioni dai file .nfo associati ai file video (avi, mkv, mp4, ecc.)
- Visualizzazione di titolo originale, versione italiana, sinossi, copertina e poster fullscreen
- Interfaccia web reattiva con Material Design
- Visualizzazione a lista e a card, con paginazione

## Struttura prevista
- Backend Node.js/Express per scansione cartelle, parsing file .nfo e API REST
- Frontend React (con Material UI) per interfaccia utente

## Avvio rapido
1. Installare le dipendenze con `npm install` nella root e nelle cartelle frontend/backend
2. Avviare il backend con `npm run dev` nella cartella backend
3. Avviare il frontend con `npm start` nella cartella frontend

## Note
- Le immagini devono essere nominate come `<nome file video>-fanart.archos.jpg` (copertina) e `<nome file video>-poster.archos.jpg` (poster fullscreen)
- Tutte le informazioni sono estratte dai file .nfo
