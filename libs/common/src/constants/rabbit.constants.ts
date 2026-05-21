export const RabbitTopology = {
  eventsExchange: 'events.x',
  notificationsExchange: 'notifications.x',
  ingestQueue: 'events.ingest.q',
  ingestDlq: 'events.ingest.dlq',
  notifyQueue: 'notifications.telegram.q',
  notifyDlq: 'notifications.telegram.dlq',
  ingestRetryQueues: [
    'events.ingest.retry.1',
    'events.ingest.retry.2',
    'events.ingest.retry.3',
  ],
  notifyRetryQueues: [
    'notifications.telegram.retry.1',
    'notifications.telegram.retry.2',
    'notifications.telegram.retry.3',
  ],
  routingKeys: {
    eventIncoming: 'events.incoming',
    notificationTelegram: 'notifications.telegram',
  },
  retryTtlsMs: [5000, 30000, 120000],
} as const;

export const RedisKeys = {
  consumerDedup: 'dedup:consumer',
  notifierDedup: 'dedup:notifier',
} as const;
