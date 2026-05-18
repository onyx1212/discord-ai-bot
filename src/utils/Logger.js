const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const config = require('../config');

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const consoleFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
  const errorStr = stack ? `\n${stack}` : '';
  return `[${timestamp}] ${level}: ${message}${errorStr}${metaStr}`;
});

const fileTransport = (filename, level = 'info') =>
  new DailyRotateFile({
    filename: path.join(config.logging.dir, `${filename}-%DATE%.log`),
    datePattern: 'YYYY-MM-DD',
    maxSize: config.logging.maxSize,
    maxFiles: config.logging.maxFiles,
    level,
    format: combine(timestamp(), errors({ stack: true }), json()),
  });

const logger = winston.createLogger({
  level: config.logging.level,
  defaultMeta: { service: 'discord-ai-bot' },
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        consoleFormat
      ),
    }),
    fileTransport('combined'),
    fileTransport('error', 'error'),
  ],
  exceptionHandlers: [fileTransport('exceptions')],
  rejectionHandlers: [fileTransport('rejections')],
});

logger.child = (meta) => logger.child(meta);

const createContextLogger = (context) => ({
  info: (msg, extra = {}) => logger.info(msg, { context, ...extra }),
  warn: (msg, extra = {}) => logger.warn(msg, { context, ...extra }),
  error: (msg, extra = {}) => logger.error(msg, { context, ...extra }),
  debug: (msg, extra = {}) => logger.debug(msg, { context, ...extra }),
  verbose: (msg, extra = {}) => logger.verbose(msg, { context, ...extra }),
});

module.exports = { logger, createContextLogger };
