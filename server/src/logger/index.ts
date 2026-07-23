import fs from 'node:fs';
import winston from 'winston';
import 'winston-daily-rotate-file';
import { env } from '../config/env.js';
import { redact } from './redact.js';

fs.mkdirSync(env.logDirectory, { recursive: true });
const sanitize = winston.format((info) => redact(info) as winston.Logform.TransformableInfo);
const transports: winston.transport[] = [new winston.transports.Console()];
if (env.nodeEnv !== 'test') {
  transports.push(
    new winston.transports.DailyRotateFile({
      dirname: env.logDirectory,
      filename: 'application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '20m',
    }),
  );
  transports.push(
    new winston.transports.DailyRotateFile({
      dirname: env.logDirectory,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '90d',
      maxSize: '20m',
    }),
  );
}

export const logger = winston.createLogger({
  level: env.logLevel,
  format: winston.format.combine(
    sanitize(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports,
});

export const httpLogStream = { write: (message: string) => logger.http(message.trim()) };
