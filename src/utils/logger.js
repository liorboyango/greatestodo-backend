/**
 * Winston Logger Configuration
 *
 * Provides structured logging for the application.
 * In production, logs are formatted as JSON for easy parsing.
 * In development, logs are formatted for human readability.
 */

const winston = require('winston');

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

/** Custom log format for development */
const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  let log = `${ts} [${level}]: ${message}`;
  if (Object.keys(meta).length > 0) {
    log += ` ${JSON.stringify(meta)}`;
  }
  if (stack) {
    log += `\n${stack}`;
  }
  return log;
});

const isProduction = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    isProduction ? json() : combine(colorize(), devFormat)
  ),
  transports: [
    new winston.transports.Console({
      silent: process.env.NODE_ENV === 'test',
    }),
  ],
  exitOnError: false,
});

module.exports = logger;
