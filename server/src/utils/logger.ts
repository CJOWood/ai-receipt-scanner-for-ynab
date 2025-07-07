import env from "./env-vars";

// Bun-based logger utility. Differentiates between development and production.

const isDev = env.NODE_ENV !== "production";

function format(level: string, ...args: any[]) {
  const time = new Date().toISOString();
  return isDev
    ? `[${time}] [${level}]` + (args.length ? " " : "") + args.join(" ")
    : `[${level}]` + (args.length ? " " : "") + args.join(" ");
}

export const logger = {
  debug: (...args: any[]) => {
    if (isDev) console.debug(format("DEBUG", ...args));
  },
  info: (...args: any[]) => {
    console.info(format("INFO", ...args));
  },
  warn: (...args: any[]) => {
    console.warn(format("WARN", ...args));
  },
  error: (...args: any[]) => {
    console.error(format("ERROR", ...args));
  },
};

// Usage: import { logger } from './utils/logger';
// logger.info('message');
// logger.error('error', err);
