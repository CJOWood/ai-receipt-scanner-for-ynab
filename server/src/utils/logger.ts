import env from "./env-vars";

// Bun-based logger utility. Differentiates between development and production.

const isDev = env.NODE_ENV !== "production";

function format(level: string, ...args: any[]) {
  const time = new Date().toISOString();
  const processedArgs = args.map((arg) => {
    if (typeof arg === "object" && arg !== null) {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  });
  return isDev
    ? `[${time}] [${level}]` + (processedArgs.length ? " " : "") + processedArgs.join(" ")
    : `[${level}]` + (processedArgs.length ? " " : "") + processedArgs.join(" ");
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
