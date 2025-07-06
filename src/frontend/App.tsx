import React, { useState } from "react";
import {
  Box,
  Button,
  Container,
  TextField,
  Typography,
  Alert,
} from "@mui/material";

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const data = new FormData();
    data.append("account", account);
    data.append("file", file);
    try {
      const res = await fetch("/upload", { method: "POST", body: data });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Upload failed");
      }
      setResult(await res.json());
      setError(null);
    } catch (err: any) {
      setError(err.message);
      setResult(null);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 5 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        YNAB Slip Uploader
      </Typography>
      <Box component="form" onSubmit={onSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField
          label="Account name"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          required
        />
        <Button variant="outlined" component="label">
          Select File
          <input
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </Button>
        <Button type="submit" variant="contained" disabled={!file || !account}>
          Upload
        </Button>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
      {result && (
        <pre style={{ marginTop: 20 }}>{JSON.stringify(result, null, 2)}</pre>
      )}
    </Container>
  );
};

export default App;
