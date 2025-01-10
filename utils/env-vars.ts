import { z } from "zod";

const envScheme = z.object({
  GEMINI_API_KEY: z.string().nonempty(),
  YNAB_API_KEY: z.string().nonempty(),
  YNAB_BUDGET_ID: z.string().nonempty(),
  YNAB_CATEGORY_GROUPS: z
    .string()
    .optional()
    .transform((str) => str?.split(",") || []),
  APP_PORT: z
    .string()
    .optional()
    .transform((str) => (str && parseInt(str)) || 3000),
  APP_API_KEY: z.string().nonempty(),
  APP_API_SECRET: z.string().nonempty(),
  MAX_FILE_SIZE: z
    .string()
    .optional()
    // Default file size is 5MB
    .transform((str) => (str && parseInt(str)) || 5242880),
});

const env = envScheme.parse(process.env);

export default env;
