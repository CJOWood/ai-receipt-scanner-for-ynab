# YNAB Slip Uploader

A service that processes receipt images using Google's Gemini AI and automatically creates transactions in YNAB (You Need A Budget).

## Features

- Processes receipt images (JPEG, PNG, WebP) and PDFs
- Uses Gemini AI to extract transaction details
- Automatically categorizes line items and overall transactions
- Creates transactions in YNAB with proper categorization
- Supports split transactions for line items
- Basic auth protection for API endpoints

## Quick Start

You can quickly get up and running by running the container in Docker.

### Prerequisites

You will need the following before you can run the container:

- [Google Gemini AI API key](https://aistudio.google.com/app/apikey)
- [YNAB API key](https://app.ynab.com/settings/developer)
- [YNAB Budget](https://www.ynab.com/)

### Running the Container

Run the command below to start the container.

```shell
docker run \
    -e APP_API_KEY=your_api_key \
    -e APP_API_SECRET=your_api_secret \
    -e GEMINI_API_KEY=your_gemini_api_key \
    -e GEMINI_MODEL=gemini-2.0-flash-exp
    -e YNAB_API_KEY=your_ynab_api_key \
    -e YNAB_BUDGET_ID=your_ynab_budget_id \
    -p 3000:3000 \
    ivankahl/ynab-slip-uploader
```

Replace the `your_gemini_api_key`, `your_ynab_api_key`, and `your_ynab_budget_id` placeholders with your Google Gemini and YNAB API credentials. You should also replace `your_ynab_budget_id` with the ID of your YNAB budget. The application is secured using basic authentication, with `your_api_key` as the username and `your_api_secret` as the password. You can customize which Gemini model should be used with the `GEMINI_MODEL` variable.

Finally, you can provide a comma-separated list of category groups if you want to limit which envelopes should be considered when classifying transactions. Leaving it empty means all envelopes will be used.

### Check it's Running

If everything is running, you should get an `OK` response when accessing `/healthz` endpoint.

### Uploading Slip

Send the following cURL request to upload a slip:

```shell
curl -X POST 'http://localhost:3000/upload' \
  -H 'Authorization: Basic $(echo -n "YOUR_API_KEY:YOUR_API_SECRET" | base64)' \
  -F 'account=Bank Cheque Account' \
  -F 'file=@/path/to/slip.pdf' \
  --fail
```

If all goes well, you should receive a `200` response with the transaction details in a JSON object like the one below:

```json
{
  "category": "Groceries",
  "memo": "Purchased apples and mangos",
  "storeName": "Woolworths",
  "totalAmount": 86.97,
  "transactionDate": "2024-01-08",
  "lineItems": [
    {
      "category": "Groceries",
      "lineItemTotalAmount": 11.99,
      "productName": "Apples",
      "quantity": 1
    },
    {
      "category": "Groceries",
      "lineItemTotalAmount": 49.99,
      "productName": "Box of Mangos",
      "quantity": 1
    }
  ]
}
```

## Environment Variables

The following environment variables let you configure the application:

| Environment Variable            | Required                         | Description                                                                                                                                                                                                                                                                                           |
| ------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`                | Required                         | Your Google Gemini API key which you can generate [here](https://aistudio.google.com/app/apikey).                                                                                                                                                                                                     |
| `GEMINI_MODEL`                  | Required                         | The [Gemini model variant](https://ai.google.dev/gemini-api/docs/models/gemini) you want to use. Minimum required variant is Gemini 1.5 and up as these support structured outputs.                                                                                                                   |
| `YNAB_API_KEY`                  | Required                         | Your YNAB Account API Key which y can generate [here](https://app.ynab.com/settings/developer).                                                                                                                                                                                                       |
| `YNAB_BUDGET_ID`                | Required                         | The ID of your YNAB budget. You'll find this in the URL when viewing your budget on YNAB.                                                                                                                                                                                                             |
| `YNAB_CATEGORY_GROUPS`          | Optional                         | A comma-separated list of category group names that should be considered when categorizing the transaction. If left blank, all categories will be used.                                                                                                                                               |
| `YNAB_INCLUDE_PAYEES_IN_PROMPT` | Optional                         | Specifies whether you want to include a list of your existing payees to be sent to Gemini. Can be `true` or `false`.                                                                                                                                                                                                            |
| `APP_PORT`                      | Optional                         | Port that the application should run on. Will default to `3000` if not specified.                                                                                                                                                                                                                     |
| `APP_API_KEY`                   | Required                         | The service uses Basic authentication to secure the `/upload` endpoint. This environment variable is the username.                                                                                                                                                                                    |
| `APP_API_SECRET`                | Required                         | The service uses Basic authentication to secure the `/upload` endpoint. This environment variable is the password.                                                                                                                                                                                    |
| `APP_TRUSTED_IPS` | Optional | A comma-separated list of client IP addresses, IP ranges (`start-end`) or CIDR blocks that should bypass Basic authentication.
| `MAX_FILE_SIZE`                 | Optional                         | The maximum upload file size if bytes. Defaults to 5MB if not specified.                                                                                                                                                                                                                              |
| `FILE_STORAGE`                  | Optional                         | Configure where you want to save slips to: `s3` or `local`. If not specified, slips won't be saved.                                                                                                                                                                                                   |
| `DATE_SUBDIRECTORES`            | Optional                         | Configure whether to use the transaction date to group slips in sub-directories.<br/><br/>If `false`, files will be stored in a single directory with name: `2025-01-11_merchant_12343452345.pdf`.<br/><br/>If `true`, files will be stored in subdirectories: `2025/01/11/merchant_12343452345.pdf`. |
| `LOCAL_DIRECTORY`               | Required if `FILE_STORAGE=local` | Configure where files should be stored if using local storage.                                                                                                                                                                                                                                        |
| `S3_ACCESS_KEY_ID`              | Required if `FILE_STORAGE=s3`    | Configure the access key if using S3 to store slips.                                                                                                                                                                                                                                                  |
| `S3_SECRET_ACCESS_KEY`          | Required if `FILE_STORAGE=s3`    | Configure the secret access key if using S3 to store slips.                                                                                                                                                                                                                                           |
| `S3_BUCKET`                     | Required if `FILE_STORAGE=s3`    | Configure the bucket to save slips to if using S3.                                                                                                                                                                                                                                                    |
| `S3_PATH_PREFIX`                | Optional                         | Define a path prefix to use when saving slips to S3. Will default to bucket root if none is specified.                                                                                                                                                                                                |
| `S3_ENDPOINT`                   | Required if `FILE_STORAGE=s3`    | Configure the S3 endpoint to use save slips to S3.                                                                                                                                                                                                                                                    |

## Contributing

If you think something's missing or want to find a bug, please feel free to fork this repository and create a pull request with your changes.

### Cloning and Running the Project

If you'd like to contribute, you'll need to install the latest version of [Bun](https://bun.sh/).

Once installed, clone the repository and install the dependencies:

```shell
bun install
```

Copy the `.env.example` file and replace the placeholders with your own files.

Then, run the application using the following command:

```shell
bun run index.ts
```

Make your changes, push them and create a pull request.

## License

This repository is distributed under the [MIT License](LICENSE.md).
