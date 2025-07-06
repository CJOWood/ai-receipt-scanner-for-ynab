import { useState } from 'react'
import beaver from './assets/beaver.svg'
import type { ApiResponse, Receipt } from 'shared'
import './App.css'

const SERVER_URL = import.meta.env.APP_SERVER_URL || "http://localhost:3000"

function App() {
  const [data, setData] = useState<ApiResponse | undefined>()

  async function sendHelloRequest() {
    try {
      const req = await fetch(`${SERVER_URL}/hello`)
      const res: ApiResponse = await req.json()
      setData(res)
    } catch (error) {
      console.log(error)
    }
  }

  async function sendUploadRequest() {
    try {
      const res = await fetch("/src/assets/sample.jpg");
      const blob = await res.blob();
      const file = new File([blob], "sample.jpg", { type: blob.type, lastModified: Date.now() });

      const infoRes = await fetch(`${SERVER_URL}/ynab-info`);
      const ynabInfo = await infoRes.json();

      const parseData = new FormData();
      parseData.append("file", file);
      parseData.append("categories", JSON.stringify(ynabInfo.categories));
      parseData.append("payees", JSON.stringify(ynabInfo.payees));
      const parseRes = await fetch(`${SERVER_URL}/parse-receipt`, {
        method: "POST",
        body: parseData,
      });
      const receipt: Receipt = await parseRes.json();

      await fetch(`${SERVER_URL}/create-transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: "test-account", receipt }),
      });

      const uploadData = new FormData();
      uploadData.append("merchant", receipt.merchant);
      uploadData.append("transactionDate", receipt.transactionDate);
      uploadData.append("file", file);
      await fetch(`${SERVER_URL}/upload-file`, {
        method: "POST",
        body: uploadData,
      });

      setData({ message: JSON.stringify(receipt), success: true });
    } catch (error) {
      console.error("Error sending upload request:", error);
      setData({ message: "Error sending upload request", success: false });
    }
  }

  return (
    <>
      <div>
        <a href="https://github.com/stevedylandev/bhvr" target="_blank">
          <img src={beaver} className="logo" alt="beaver logo" />
        </a>
      </div>
      <h1>bhvr</h1>
      <h2>Bun + Hono + Vite + React</h2>
      <p>A typesafe fullstack monorepo</p>
      <div className="card">
        <div className='button-container'>
          <button onClick={sendHelloRequest}>
            Call /hello
          </button>
          <button onClick={sendUploadRequest}>
            Call /upload
          </button>
          <a className='docs-link' target='_blank' href="https://bhvr.dev">Docs</a>
        </div>
        {data && (
          <pre className='response'>
            <code>
            Message: {data.message} <br />
            Success: {data.success.toString()}
            </code>
          </pre>
        )}
      </div>
    </>
  )
}

export default App
