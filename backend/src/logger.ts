import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['*.apiKey', '*.apikey', '*.password', '*.cookie', '*.token', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
    censor: '[REDACTED]',
  },
});
