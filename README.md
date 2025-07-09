# AI Receipt Scanner for YNAB

A robust, AI-powered service that processes receipt images and PDFs using Google's Gemini AI, then automatically creates detailed transactions in YNAB (You Need A Budget). Designed for efficiency, privacy, and seamless budgeting.

---

## 🚀 Features

- **Web browser frontend with detailed, step-by-step user feedback** — visualize upload, parsing, AI, and YNAB sync status with clear error/success logs, far surpassing the original CLI-only or “no front-end” versions
- Upload and process receipt images (JPEG, PNG, WebP) or PDFs
- AI-powered extraction of transaction details including line items **and taxes**
- Automatic categorization of line items and transactions using your YNAB categories
- Supports split transactions for line items
- API endpoints for your own use
- Built-in cropping interface
- Flexible storage: save receipts locally or to S3
- Fully open source, MIT licensed

---

## ⚡ Quick Start

### Docker

You can get up and running quickly using Docker:

```shell
docker run \
    -e APP_API_KEY=your_api_key \
    -e APP_API_SECRET=your_api_secret \
    -e GEMINI_API_KEY=your_gemini_api_key \
    -e GEMINI_MODEL=gemini-2.0-flash-exp \
    -e YNAB_API_KEY=your_ynab_api_key \
    -e YNAB_BUDGET_ID=your_ynab_budget_id \
    -p 3000:3000 \
    cjowood/ynab-receipt-uploader:latest
```

### Docker Compose

Here’s a sample `docker-compose.yml` to run the service:

```yaml
version: "3.8"
services:
  ynab-ai-receipt-scanner:
    image: cjowood/ynab-receipt-uploader:latest
    environment:
      APP_API_KEY: your_api_key
      APP_API_SECRET: your_api_secret
      GEMINI_API_KEY: your_gemini_api_key
      GEMINI_MODEL: gemini-2.0-flash-exp
      YNAB_API_KEY: your_ynab_api_key
      YNAB_BUDGET_ID: your_ynab_budget_id
      # Add storage/env options as needed
    ports:
      - "3000:3000"
    volumes:
      - ./receipts:/data # If using local storage
```

---

## ⚙️ Environment Variables

The following environment variables allow you to configure the application:

| Environment Variable            | Required                         | Description                                                                                                                                                                       |
| ------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`                | Required                         | Google Gemini API key ([get one](https://aistudio.google.com/app/apikey))                                                                                                          |
| `GEMINI_MODEL`                  | Required                         | Gemini model variant (minimum 1.5 for structured outputs)                                                                                                                         |
| `YNAB_API_KEY`                  | Required                         | YNAB Account API Key ([get one](https://app.ynab.com/settings/developer))                                                                                                         |
| `YNAB_BUDGET_ID`                | Required                         | The ID of your YNAB budget (found in the URL in YNAB)                                                                                                                             |
| `YNAB_CATEGORY_GROUPS`          | Optional                         | Comma-separated list of category group names to include (all if blank)                                                                                                            |
| `YNAB_INCLUDE_PAYEES_IN_PROMPT` | Optional                         | If `true`, includes your existing payees for more accurate AI matching (default: true)                                                                                            |
| `APP_PORT`                      | Optional                         | Port to run on (default: 3000)                                                                                                             |
| `APP_API_KEY`                   | Required                         | Username for Basic authentication                                                                                                           |
| `APP_API_SECRET`                | Required                         | Password for Basic authentication                                                                                                           |
| `APP_TRUSTED_IPS`               | Optional                         | Comma-separated list of IPs/CIDR/ranges that bypass authentication                                                                         |
| `APP_DISABLE_AUTH`              | Optional                         | Set to `true` to disable authentication                                                                                                    |
| `MAX_FILE_SIZE`                 | Optional                         | Max upload file size in bytes (default: 5MB)                                                                                               |
| `FILE_STORAGE`                  | Optional                         | Where to save receipts: `local` or `s3` (if blank, receipts aren't saved)                                                                        |
| `DATE_SUBDIRECTORIES`           | Optional                         | If `true`, groups receipts in subdirs by date (`2025/01/11/...`). If `false`, all receipts in one dir.                                           |
| `LOCAL_DIRECTORY`               | Required if `FILE_STORAGE=local` | Local directory to save receipts                                                                                                               |
| `S3_ACCESS_KEY_ID`              | Required if `FILE_STORAGE=s3`    | AWS Access Key for S3                                                                                                                      |
| `S3_SECRET_ACCESS_KEY`          | Required if `FILE_STORAGE=s3`    | AWS Secret Key for S3                                                                                                                      |
| `S3_BUCKET`                     | Required if `FILE_STORAGE=s3`    | S3 bucket name                                                                                                                             |
| `S3_PATH_PREFIX`                | Optional                         | Path prefix in S3 bucket                                                                                                                   |
| `S3_ENDPOINT`                   | Required if `FILE_STORAGE=s3`    | S3 endpoint URL                                                                                                                            |

---

## 🛠️ API Endpoints

YNAB receipt Uploader provides a range of API endpoints for integrating with your own tools, scripts, or for advanced use. All endpoints (except `/healthz`) require authentication using the `APP_API_KEY` and `APP_API_SECRET` via HTTP Basic Auth (unless you’ve disabled auth in config).

### Authentication

Send the following HTTP header with your requests (use your API key and secret):

```
Authorization: Basic <base64(APP_API_KEY:APP_API_SECRET)>
```

You can generate the header in bash:

```bash
echo -n "your_api_key:your_api_secret" | base64
```

---

### Endpoints

#### `GET /healthz`

- **Purpose:** Health check. Returns `OK` if the server is running.
- **Auth:** None required.

---

#### `GET /api/ynab-info`

- **Purpose:** Fetches available YNAB accounts, categories, and payees for your configured budget.
- **Returns:** JSON object with arrays of accounts, categories, and payees.
- **Auth:** Required.

**Example:**
```shell
curl -u your_api_key:your_api_secret http://localhost:3000/api/ynab-info
```

---

#### `POST /api/parse-receipt`

- **Purpose:** Upload a receipt (image or PDF) and get it parsed by Gemini AI; returns structured transaction details (does not create a YNAB transaction).
- **Auth:** Required.
- **Content-Type:** `multipart/form-data`
- **Body:**
  - `file` — The receipt image or PDF (required)
  - `categories` — JSON array of YNAB category names (required)
  - `payees` — JSON array of YNAB payees (optional)

**Example:**
```shell
curl -u your_api_key:your_api_secret \
     -F "file=@/path/to/receipt.pdf" \
     -F "categories=[\"Groceries\",\"Dining Out\"]" \
     -F "payees=[\"Woolworths\",\"Coles\"]" \
     http://localhost:3000/api/parse-receipt
```

---

#### `POST /api/create-transaction`

- **Purpose:** Create a YNAB transaction using the AI-parsed receipt data.
- **Auth:** Required.
- **Content-Type:** `application/json`
- **Body:**  
  ```json
  {
    "account": "Bank Cheque Account",
    "receipt": {
      "merchant": "Woolworths",
      "transactionDate": "2024-01-08",
      "memo": "Purchased apples",
      "totalAmount": 86.97,
      "category": "Groceries",
      "lineItems": [
        { "category": "Groceries", "lineItemTotalAmount": 11.99, "productName": "Apples", "quantity": 1 }
      ]
    }
  }
  ```

**Example:**
```shell
curl -u your_api_key:your_api_secret \
     -H "Content-Type: application/json" \
     -d @payload.json \
     http://localhost:3000/api/create-transaction
```

---

#### `POST /api/upload-file`

- **Purpose:** Save the original receipt file to your configured storage (local or S3).
- **Auth:** Required.
- **Content-Type:** `multipart/form-data`
- **Body:**
  - `merchant` — Merchant/store name (required)
  - `transactionDate` — Transaction date (required)
  - `file` — The receipt image or PDF (required)

**Example:**
```shell
curl -u your_api_key:your_api_secret \
     -F "merchant=Woolworths" \
     -F "transactionDate=2024-01-08" \
     -F "file=@/path/to/receipt.pdf" \
     http://localhost:3000/api/upload-file
```

---

### Typical Workflow

1. Call `/api/ynab-info` to get categories/accounts/payees.
2. Call `/api/parse-receipt` to extract transaction details from a receipt.
3. Call `/api/create-transaction` to create the transaction in YNAB.
4. Optionally, call `/api/upload-file` to save the original file to storage.

The browser UI automates this flow, but you can use the endpoints directly for scripting or integration.

---

---

## 🤝 Contributing

Your contributions are welcome! To get started:

1. Install [Bun](https://bun.sh/)
2. Fork and clone this repo
3. Install dependencies:

    ```shell
    bun install
    ```

4. Copy `.env.example` to `.env` and fill in your values
5. Run the app:

    ```shell
    bun run index.ts
    ```

6. Make your changes, push, and open a pull request!

---

## 📁 Repository Structure

This repo follows the [bhvr](https://github.com/stevedylandev/bhvr) monorepo layout:

```
.
├── server/        # Hono backend (API, processing, storage)
├── shared/        # Shared TypeScript definitions
├── client/        # React + TypeScript + Vite client (browser UI)
└── package.json   # Root workspace configuration
```

---

## 📄 License

This repository is distributed under the [MIT License](LICENSE.md).
