import { useState } from 'react'
import beaver from './assets/beaver.svg'
import type { ApiResponse } from 'shared'
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
      const formData = new FormData();
      formData.append("account", "test-account");
      formData.append("file", new File(
        [Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg", 
          "base64"
        )], 
        "receipt.pdf",
        {
          type: "image/png",
          lastModified: Date.now()
        }
      )); // Replace with actual file content

      try {
        const res = await fetch(`${SERVER_URL}/upload`, {
          method: "POST",
          body: formData,
        });

        if (!res.body) {
          throw new Error("No response body");
        }
        const data = await res.json();
        setData({ message: data, success: true });
      } catch (error) {
        console.error("Error uploading file:", error);
        setData({ message: "Error uploading file", success: false });
      }
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
