import { useState } from 'react';
import { Box, Button, TextField, Autocomplete, Typography } from '@mui/material';
import PhotoCamera from '@mui/icons-material/PhotoCamera';

function App() {
  const [accounts, setAccounts] = useState<string[]>([
    'Cheque Account',
    'Credit Card',
    'Cash',
  ]);
  const [account, setAccount] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleProcess = async () => {
    if (!account || !file) return;
    const formData = new FormData();
    formData.append('account', account);
    formData.append('file', file);

    setLoading(true);
    try {
      const response = await fetch('/upload', {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' + btoa(`${import.meta.env.VITE_API_KEY}:${import.meta.env.VITE_API_SECRET}`),
        },
        body: formData,
      });
      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setResult('Error processing file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" sx={{ mb: 2 }}>
        YNAB Slip Uploader
      </Typography>
      <Autocomplete
        freeSolo
        options={accounts}
        onChange={(_, value) => {
          if (value && !accounts.includes(value)) {
            setAccounts((prev) => [...prev, value]);
          }
          setAccount(value || '');
        }}
        renderInput={(params) => (
          <TextField {...params} label="Account" variant="outlined" fullWidth />
        )}
        sx={{ mb: 2 }}
      />
      <Button
        variant="contained"
        component="label"
        startIcon={<PhotoCamera />}
        sx={{ mb: 2 }}
      >
        Upload Photo
        <input
          hidden
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
        />
      </Button>
      <Box>
        <Button variant="contained" onClick={handleProcess} disabled={loading}>
          {loading ? 'Processing...' : 'Process'}
        </Button>
      </Box>
      {result && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle1">Result</Typography>
          <pre>{result}</pre>
        </Box>
      )}
    </Box>
  );
}

export default App;
