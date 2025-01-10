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
    -e APP_PORT=3000 \
    -e GEMINI_API_KEY=your_gemini_api_key \
    -e YNAB_API_KEY=your_ynab_api_key \
    -e YNAB_BUDGET_ID=your_ynab_budget_id \
    -e YNAB_CATEGORY_GROUPS=optional_comma_separated_category_groups \
    -p 3000:3000 \
    ivankahl/ynab-slip-uploader
```

Replace the `your_gemini_api_key`, `your_ynab_api_key`, and `your_ynab_budget_id` placeholders with your Google Gemini and YNAB API credentials. You should also replace `your_ynab_budget_id` with the ID of your YNAB budget. The application is secured using basic authentication, with `your_api_key` as the username and `your_api_secret` as the password.

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

| Environment Variable   | Required | Description                                                                                                                                             |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`       | Required | Your Google Gemini API key which you can generate [here](https://aistudio.google.com/app/apikey).                                                       |
| `YNAB_API_KEY`         | Required | Your YNAB Account API Key which y can generate [here](https://app.ynab.com/settings/developer).                                                         |
| `YNAB_BUDGET_ID`       | Required | The ID of your YNAB budget. You'll find this in the URL when viewing your budget on YNAB.                                                               |
| `YNAB_CATEGORY_GROUPS` | Optional | A comma-separated list of category group names that should be considered when categorizing the transaction. If left blank, all categories will be used. |
| `APP_PORT`             | Optional | Port that the application should run on. Will default to `3000` if not specified.                                                                       |
| `APP_API_KEY`          | Required | The service uses Basic authentication to secure the `/upload` endpoint. This environment variable is the username.                                      |
| `APP_API_SECRET`       | Required | The service uses Basic authentication to secure the `/upload` endpoint. This environment variable is the password.                                      |
| `MAX_FILE_SIZE`        | Optional | The maximum upload file size if bytes. Defaults to 5MB if not specified.                                                                                |

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
