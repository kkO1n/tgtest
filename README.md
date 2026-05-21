# NestJS RabbitMQ + Telegram Microservices

Three NestJS microservices connected through RabbitMQ:

- `producer-api`: accepts `POST /v1/events`, validates payload, publishes to RabbitMQ with confirms and retries.
- `consumer-worker`: consumes incoming events, applies idempotency (Redis), forwards to notification queue.
- `telegram-notifier`: consumes notification events, applies idempotency (Redis), sends Telegram messages.

## Architecture

Flow:

`producer-api -> events.x/events.ingest.q -> consumer-worker -> notifications.x/notifications.telegram.q -> telegram-notifier -> Telegram Bot API`

Reliability:

- At-least-once delivery.
- Manual ACK after successful processing.
- 3 retry queues with exponential delays (5s, 30s, 120s).
- DLQ for messages that exceed retry attempts.
- Event idempotency via Redis (`dedup:consumer:{eventId}`, `dedup:notifier:{eventId}`).

## API

### `POST /v1/events`

Headers:

- `x-api-key: <API_KEY>`

Body:

```json
{
  "eventId": "optional-uuid",
  "eventType": "order.created",
  "chatId": "-1001234567890",
  "payload": { "orderId": "42" },
  "occurredAt": "optional-ISO-date",
  "metadata": { "source": "checkout" }
}
```

Response `202`:

```json
{ "eventId": "uuid", "status": "queued" }
```

Swagger: `http://localhost:3000/docs`

## Local run

```bash
npm install
npm run build
npm run start:dev:producer
npm run start:dev:consumer
npm run start:dev:notifier
```

## Docker

```bash
docker compose up --build
```

Producer API is available at `http://localhost:3000`.

## Tests

```bash
npm run test
npm run test:e2e
```
