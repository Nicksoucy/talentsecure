import winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';

// Ensure logs directory exists
const logDir = process.env.LOG_FILE_PATH || path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Production (Cloud Logging) : mappe le niveau winston vers le champ `severity`
// que Cloud Logging reconnaît, pour que le filtre/alerting `severity>=ERROR`
// fonctionne (sinon les erreurs sont visibles mais non étiquetées).
const SEVERITY_BY_LEVEL: Record<string, string> = {
  error: 'ERROR', warn: 'WARNING', info: 'INFO', http: 'INFO', debug: 'DEBUG',
};
const gcpProdFormat = winston.format.combine(
  winston.format((info) => {
    info.severity = SEVERITY_BY_LEVEL[info.level] || 'DEFAULT';
    return info;
  })(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Define console format (more readable)
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? `\n${info.stack}` : ''}`
  )
);

// Create transports.
// O1 (audit) — sur Cloud Run le filesystem est ÉPHÉMÈRE : les transports fichier
// sont invisibles dans Cloud Logging (et grossissent en RAM jusqu'à l'OOM). En
// production on loggue donc en JSON sur stdout, que Cloud Logging capte et parse
// nativement (champ `severity`). En dev on garde la console lisible + les fichiers.
const isProd = process.env.NODE_ENV === 'production';
const transports: winston.transport[] = isProd
  ? [new winston.transports.Console({ format: gcpProdFormat })]
  : [
      new winston.transports.Console({ format: consoleFormat }),
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        format: logFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        format: logFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
    ];

// In test environment, only log errors
const level = process.env.NODE_ENV === 'test' ? 'error' : (process.env.LOG_LEVEL || 'info');

// Create the logger
const logger = winston.createLogger({
  level,
  levels,
  format: logFormat,
  transports,
  exceptionHandlers: isProd
    ? [new winston.transports.Console({ format: gcpProdFormat })]
    : [new winston.transports.File({ filename: path.join(logDir, 'exceptions.log') })],
  rejectionHandlers: isProd
    ? [new winston.transports.Console({ format: gcpProdFormat })]
    : [new winston.transports.File({ filename: path.join(logDir, 'rejections.log') })],
  exitOnError: false,
});

// Create a stream object for morgan HTTP request logging
export const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

export default logger;
