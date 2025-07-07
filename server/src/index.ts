import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import env from "./utils/env-vars";
import { logger } from "./utils/logger";
import { processAndUploadReceipt, uploadReceiptFile } from "./services/receipt";
import { getYnabInfo, createTransaction } from "./services/budget";
import { parseReceipt } from "./services/gen-ai";
import type { Receipt, ApiResponse } from "shared";
import { serveStatic } from 'hono/bun';

const app = new Hono();
app.use(cors())

// Serve static files for frontend
app.use('/*', serveStatic({ root: './server/public', rewriteRequestPath: (path) => path === '/' ? '/index.html' : path }));

app.get("/ynab-info", async (c) => {
  try {
    const info = await getYnabInfo();
    logger.info("Fetched YNAB info");
    return c.json(info, 200);
  } catch (err: any) {
    logger.error("Error getting YNAB info:", err);
    return c.json({ error: err.message }, 500);
  }
});

app.post(
  "/parse-receipt",
  zValidator(
    "form",
    z.object({
      file: z
        .instanceof(File)
        .refine((f) => f.size <= env.MAX_FILE_SIZE, `Max file size is ${env.MAX_FILE_SIZE / 1024 / 1024}MB`)
        .refine((f) => [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/webp",
          "application/pdf",
        ].includes(f.type)),
      categories: z.string().nonempty(),
      payees: z.string().optional(),
    })
  ),
  async (c) => {
    try {
      const { file, categories, payees } = c.req.valid("form");
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const categoriesArr = JSON.parse(categories) as string[];
      const payeesArr = payees ? (JSON.parse(payees) as string[]) : undefined;
      const receipt = await parseReceipt(
        fileBuffer,
        file.type,
        categoriesArr,
        payeesArr || null
      );
      logger.info("Parsed receipt for categories", categoriesArr, "payees", payeesArr);
      return c.json(receipt, 200);
    } catch (err: any) {
      logger.error("Error parsing receipt:", err);
      return c.json({ error: err.message }, 500);
    }
  }
);

app.post(
  "/create-transaction",
  zValidator(
    "json",
    z.object({
      account: z.string().nonempty(),
      receipt: z.any(),
    })
  ),
  async (c) => {
    try {
      const { account, receipt } = c.req.valid("json") as { account: string; receipt: Receipt };
      const result = await createTransaction(
        account,
        receipt.merchant,
        receipt.category,
        receipt.transactionDate,
        receipt.memo,
        receipt.totalAmount,
        receipt.lineItems?.map((li) => ({ category: li.category, amount: li.lineItemTotalAmount })),
        receipt.totalTaxes
      );
      logger.info("Created transaction for account", account);
      return c.json(result, 200);
    } catch (err: any) {
      logger.error("Error creating transaction:", err);
      return c.json({ error: err.message }, 500);
    }
  }
);

app.post(
  "/upload-file",
  zValidator(
    "form",
    z.object({
      merchant: z.string().nonempty(),
      transactionDate: z.string().nonempty(),
      file: z
        .instanceof(File)
        .refine((f) => f.size <= env.MAX_FILE_SIZE, `Max file size is ${env.MAX_FILE_SIZE / 1024 / 1024}MB`)
        .refine((f) => [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/webp",
          "application/pdf",
        ].includes(f.type)),
    })
  ),
  async (c) => {
    try {
      const { merchant, transactionDate, file } = c.req.valid("form");
      const result = await uploadReceiptFile(merchant, transactionDate, file);
      logger.info("Uploaded receipt file for merchant", merchant);
      return c.json(result, 200);
    } catch (err: any) {
      logger.error("Error uploading file:", err);
      return c.json({ error: err.message }, 500);
    }
  }
);

app.post(
  "/upload",
  zValidator(
    "form",
    z.object({
      account: z.string().nonempty(),
      file: z
        .instanceof(File)
        .refine(
          (f) => f.size <= env.MAX_FILE_SIZE,
          `Max file size is ${env.MAX_FILE_SIZE / 1024 / 1024}MB`
        )
        .refine((f) =>
          [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "application/pdf",
          ].includes(f.type)
        ),
    })
  ),
  async (c) => {
    try {
      const { account, file } = c.req.valid("form");
      
      const receipt = await processAndUploadReceipt(account, file);
      logger.info("Processed and uploaded receipt for account", account);
      return c.json(receipt, 200);
    } catch (err: any) {
      logger.error("Error processing receipt:", err)
      return c.json(
        { error: err.message || "An unknown error occurred." },
        500
      );
    }
  }
);

app.get("/healthz", async (c) => {
  return c.text("OK", 200);
});

app.get('/hello', async (c) => {
  const data: ApiResponse = {
    message: "Hello BHVR!",
    success: true
  }

  return c.json(data, { status: 200 })
})

export default {
  port: env.APP_PORT,
  fetch: app.fetch,
};
