import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, IconButton, List, ListItem, ListItemText, Paper, Stack, Alert, Container } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import axios from 'axios';

export default function Setup({ initialPaths = [], onClose }) {
  const [paths, setPaths] = useState(initialPaths.length ? initialPaths : ['']);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setPaths(initialPaths.length ? initialPaths : ['']);
  }, [initialPaths]);

  const handlePathChange = (idx, value) => {
    const newPaths = [...paths];
    newPaths[idx] = value;
    setPaths(newPaths);
  };

  const handleAdd = () => setPaths([...paths, '']);
  const handleRemove = idx => setPaths(paths.length === 1 ? [''] : paths.filter((_, i) => i !== idx));

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError('');
    try {
      const cleanPaths = paths.map(p => p.trim()).filter(Boolean);
      await axios.post(`${process.env.REACT_APP_API}/api/setup`, { movieDirs: cleanPaths });
      setSuccess(true);
    } catch (err) {
      let msg = 'Errore nel salvataggio.';
      if (err.response && err.response.data && err.response.data.details) {
        msg += ' ' + err.response.data.details;
      }
      setError(msg);
    }
    setSaving(false);
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 6 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h5" gutterBottom>Setup cartelle film</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Puoi aggiungere più cartelle: l’ordine determina la priorità di scansione e delle immagini. Le immagini saranno servite da <b>/img/0</b>, <b>/img/1</b>, ecc.
        </Typography>
        <form onSubmit={handleSubmit}>
          <List>
            {paths.map((path, idx) => (
              <ListItem key={idx} secondaryAction={
                <IconButton edge="end" aria-label="delete" onClick={() => handleRemove(idx)} disabled={paths.length === 1}>
                  <DeleteIcon />
                </IconButton>
              }>
                <TextField
                  label={`Cartella #${idx + 1}`}
                  value={path}
                  onChange={e => handlePathChange(idx, e.target.value)}
                  fullWidth
                  size="small"
                  variant="outlined"
                  sx={{ mr: 2 }}
                />
              </ListItem>
            ))}
          </List>
          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAdd} disabled={saving}>
              Aggiungi cartella
            </Button>
            <Button type="submit" variant="contained" disabled={saving}>
              Salva
            </Button>
          </Stack>
          {success && <Alert severity="success" sx={{ mt: 2 }}>Configurazione salvata!</Alert>}
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
            <Button onClick={onClose} color="secondary">Chiudi</Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
