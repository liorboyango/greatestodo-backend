/**
 * Winston Logger Configuration
 *
 * Provides structured logging for the application.
 * In production, logs are formatted as JSON for easy parsing.
 * In development, logs are formatted for human readability.
 *
 * Features:
 * - Structured JSON logging in production
 * - Human-readable colorized output in development
 * - Child logger support for request-scoped context (e.g., requestId, uid)
 * - Helper to create a request-scoped logger with correlation ID
 */

const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

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

// NOTE: Do NOT override logger.child here.
// Winston v3+ provides a built-in child() method that correctly creates a
// child logger inheriting the parent's transports and format while merging
// the supplied metadata into every log entry.
// Overriding it with a wrapper that calls logger.child(meta) would create
// infinite recursion (RangeError: Maximum call stack size exceeded).

/**
 * Generates a new unique request correlation ID.
 * Used to trace a single HTTP request across all log lines.
 *
 * @returns {string} UUID v4 string
 */
logger.generateRequestId = () => uuidv4();

/**
 * Creates a request-scoped logger that automatically includes
 * the requestId in every log call.
 *
 * Uses Winston's built-in child() method (available since Winston v3)
 * to create a child logger with the given metadata merged into every
 * log entry produced by the returned logger instance.
 *
 * @param {string} [requestId] - Correlation ID (auto-generated if not provided)
 * @param {Object} [extraMeta] - Additional metadata to include in every log
 * @returns {{ log: winston.Logger, requestId: string }}
 *
 * @example
 * const { log, requestId } = logger.forRequest(req.id);
 * log.info('[Register] Starting registration', { email });
 * // → { message: '[Register] Starting registration', requestId: '...', email: '...' }
 */
logger.forRequest = (requestId, extraMeta = {}) => {
  const id = requestId || uuidv4();
  // Use Winston's native child() — no override needed
  const childLogger = logger.child({ requestId: id, ...extraMeta });
  return { log: childLogger, requestId: id };
};

module.exports = logger;
