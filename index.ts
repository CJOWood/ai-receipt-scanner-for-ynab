import { Hono, type Context, type Next } from "hono";
import { basicAuth } from "hono/basic-auth";
import { serveStatic } from "hono/bun";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import env from "./utils/env-vars";
import { logger } from "hono/logger";
import { processAndUploadReceipt } from "./services/receipt";

const app = new Hono();

app.use(logger());

const uploadAuth = async (c: Context, next: Next) => {
  const allowed = env.APP_FRONTEND_URL;
  const origin = c.req.header("origin") || "";
  const referer = c.req.header("referer") || "";

  if (allowed && (origin.startsWith(allowed) || referer.startsWith(allowed))) {
    await next();
    return;
  }

  await basicAuth({
    username: env.APP_API_KEY,
    password: env.APP_API_SECRET,
  })(c, next);
};

app.post(
  "/upload",
  uploadAuth,
  zValidator(
    "form",
    z.object({
      account: z.string().nonempty(),
      file: z
        .instanceof(File)
        .refine(
          (f) => f.size <= env.MAX_FILE_SIZE,
          `Max file size is ${env.MAX_FILE_SIZE / 1024 / 1024}MB`,
        )
        .refine((f) =>
          [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "application/pdf",
          ].includes(f.type),
        ),
    }),
  ),
  async (c) => {
    const { account, file } = c.req.valid("form");

    try {
      const receipt = await processAndUploadReceipt(account, file);

      return c.json(receipt, 200);
    } catch (err: any) {
      console.error("Error processing receipt:", err);
      return c.json(
        { error: err.message || "An unknown error occurred." },
        500,
      );
    }
  },
);

app.get("/healthz", async (c) => {
  return c.text("OK", 200);
});

// Expose selected env vars to the frontend
app.get("/config.js", (c) => {
  const script = `window.APP_FRONTEND_URL = ${JSON.stringify(env.APP_FRONTEND_URL || "")};`;
  return c.text(script, 200, {
    "content-type": "application/javascript",
  });
});

// Serve the front-end from the public directory
app.get("/*", serveStatic({ root: "./public" }));

export default {
  port: env.APP_PORT,
  fetch: app.fetch,
};
