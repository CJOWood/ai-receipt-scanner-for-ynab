import React, { useState } from "react";

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
    <main style={{ maxWidth: 600, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>YNAB Slip Uploader</h1>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          type="text"
          placeholder="Account name"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          required
        />
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
        />
        <button type="submit" disabled={!file || !account}>Upload</button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {result && (
        <pre style={{ marginTop: 20 }}>{JSON.stringify(result, null, 2)}</pre>
      )}
    </main>
  );
};

export default App;
