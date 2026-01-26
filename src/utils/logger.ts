import { Logtail } from '@logtail/node';
import { ENV } from '../config/index.js';

enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

class Logger {
  private logtail?: Logtail;

  constructor() {
    const token = ENV.logtailSourceToken;

    if (token) {
      this.logtail = new Logtail(token, {
        endpoint: ENV.logtailEndpoint,
      });
    }
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private log(level: LogLevel, message: string, meta?: unknown): void {
    const timestamp = this.getTimestamp();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    // 1. Console Logging (Formatted for terminal)
    if (meta) {
      console.log(logMessage, meta);
    } else {
      console.log(logMessage);
    }

    // 2. Cloud Logging (BetterStack)
    if (this.logtail) {
      this.logtail[level as 'error' | 'warn' | 'info' | 'debug'](
        message,
        meta as Record<string, unknown>
      );
    }
  }

  error(message: string, error?: unknown): void {
    const meta =
      error instanceof Error
        ? { error: error.message, stack: error.stack }
        : error;
    this.log(LogLevel.ERROR, message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.log(LogLevel.WARN, message, meta);
  }

  info(message: string, meta?: unknown): void {
    this.log(LogLevel.INFO, message, meta);
  }

  debug(message: string, meta?: unknown): void {
    if (ENV.nodeEnv === 'development') {
      // Use this.config
      this.log(LogLevel.DEBUG, message, meta);
    }
  }
}

export const logger = new Logger();
