import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import env from "./utils/env-vars";
import { logger } from "hono/logger";
import { processAndUploadReceipt } from "./services/receipt";
import type { ApiResponse } from "shared/dist";

const app = new Hono();
app.use(logger())
app.use(cors())

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

      return c.json(receipt, 200);
    } catch (err: any) {
      console.error("Error processing receipt:", err)
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
