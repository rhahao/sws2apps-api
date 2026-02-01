import { Logtail } from '@logtail/node';
import { Context, LogLevel } from '@logtail/types';
import Config from '../config/index.js';

let logtail: Logtail;

const getTimestamp = () => {
  return new Date().toISOString();
};

const log = (
  level: LogLevel,
  message: string,
  context?: Context,
  error?: unknown
) => {
  if (!logtail && Config.ENV.logtailSourceToken) {
    logtail = new Logtail(Config.ENV.logtailSourceToken, {
      endpoint: Config.ENV.logtailEndpoint,
    });
  }

  const timestamp = getTimestamp();

  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  // 1. Console Logging (Formatted for terminal)
  if (error) {
    console.error(logMessage, error);
  } else {
    console[level as 'warn' | 'info' | 'debug'](logMessage);
  }

  // 2. Cloud Logging (BetterStack)
  if (logtail) {
    logtail[level as 'error' | 'warn' | 'info' | 'debug'](message, context);

    logtail.flush();
  }
};

export const error = (message: string, error: unknown, context?: Context) => {
  const errorData =
    error instanceof Error
      ? { error: error.message, stack: error.stack }
      : error;

  log(LogLevel.Error, message, context, errorData);
};

export const warn = (message: string, context?: Context) => {
  log(LogLevel.Warn, message, context);
};

export const info = (message: string, context?: Context) => {
  log(LogLevel.Info, message, context);
};

export const debug = (message: string, context?: Context) => {
  if (Config.ENV.nodeEnv !== 'development') return;

  log(LogLevel.Debug, message, context);
};
