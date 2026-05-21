export const appConfig = () => ({
  serviceName: process.env.SERVICE_NAME ?? 'app',
  port: Number(process.env.PORT ?? 3000),
  rabbitUrl: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@rabbitmq:5672',
  redisUrl: process.env.REDIS_URL ?? 'redis://redis:6379',
  apiKey: process.env.API_KEY ?? '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  dedupTtlSeconds: Number(process.env.DEDUP_TTL_SECONDS ?? 60 * 60 * 24 * 7),
});
