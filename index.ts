import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { createTransaction, getAllEnvelopes } from "./services/budget";
import { parseSlip } from "./services/gen-ai";
import env from "./utils/env-vars";
import { logger } from "hono/logger";

const app = new Hono();

app.use(logger());

app.post(
  "/upload",
  basicAuth({
    username: env.APP_API_KEY,
    password: env.APP_API_SECRET,
  }),
  zValidator(
    "form",
    z.object({
      account: z.string().nonempty(),
      file: z
        .instanceof(File)
        .refine((f) => f.size <= env.MAX_FILE_SIZE, `Max file size is ${env.MAX_FILE_SIZE / 1024 / 1024}MB`)
        .refine((f) => ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"].includes(f.type)),
    })
  ),
  async (c) => {
    const { account, file } = c.req.valid("form");

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Get the list of available envelopes
    const envelopes = await getAllEnvelopes();

    const slip = await parseSlip(fileBuffer, file.type, envelopes);

    if (!slip) {
      return c.json({ error: "Failed to parse slip" }, 500);
    }

    await createTransaction(
      account,
      slip.storeName,
      slip.category,
      slip.transactionDate,
      slip.memo,
      slip.totalAmount,
      slip.lineItems?.map((li) => ({
        category: li.category,
        amount: li.lineItemTotalAmount,
      })) || []
    );

    return c.json(slip, 200);
  }
);

app.get("/healthz", async (c) => {
  return c.text("OK", 200);
});

export default {
  port: env.APP_PORT,
  fetch: app.fetch,
};
