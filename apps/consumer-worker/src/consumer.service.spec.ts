import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppLoggerService, RabbitService, RedisService } from '@app/common';
import { ConsumerService } from './consumer.service';
import { ConsumeMessage } from 'amqplib';

describe('ConsumerService', () => {
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const rabbit = {
    consume: jest.fn<
      Promise<void>,
      [string, (msg: ConsumeMessage) => Promise<void>]
    >(),
    ack: jest.fn<Promise<void>, [ConsumeMessage]>(),
    sendToQueue: jest.fn<Promise<void>, [string, object]>(),
    publishWithConfirm: jest.fn<Promise<void>, [string, string, object]>(),
  };

  const redis = {
    setIfNotExists: jest.fn(),
    exists: jest.fn(),
  };

  const createMessage = (event: Record<string, unknown>): ConsumeMessage =>
    ({
      content: Buffer.from(JSON.stringify(event)),
    }) as ConsumeMessage;

  const getRegisteredHandler = (): ((msg: ConsumeMessage) => Promise<void>) => {
    const call = rabbit.consume.mock.calls[0];
    if (!call) {
      throw new Error('Consumer handler was not registered');
    }
    return call[1];
  };

  beforeEach(() => {
    jest.clearAllMocks();
    rabbit.consume.mockResolvedValue(undefined);
    rabbit.ack.mockResolvedValue(undefined);
    rabbit.sendToQueue.mockResolvedValue(undefined);
    rabbit.publishWithConfirm.mockResolvedValue(undefined);
    redis.setIfNotExists.mockResolvedValue(true);
    redis.exists.mockResolvedValue(false);
  });

  it('subscribes to ingest queue on module init', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConsumerService,
        { provide: AppLoggerService, useValue: logger },
        {
          provide: RabbitService,
          useValue: rabbit,
        },
        { provide: RedisService, useValue: redis },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(60) },
        },
      ],
    }).compile();

    const service = moduleRef.get(ConsumerService);
    await service.onModuleInit();

    expect(rabbit.consume).toHaveBeenCalledTimes(1);
    expect(rabbit.consume).toHaveBeenCalledWith(
      'events.ingest.q',
      expect.any(Function),
    );
    expect(logger.log).toHaveBeenCalledWith('Consumer worker started');
  });

  it('acks and logs duplicate messages without republishing', async () => {
    redis.exists.mockResolvedValue(true);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConsumerService,
        { provide: AppLoggerService, useValue: logger },
        { provide: RabbitService, useValue: rabbit },
        { provide: RedisService, useValue: redis },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(60) },
        },
      ],
    }).compile();

    const service = moduleRef.get(ConsumerService);
    await service.onModuleInit();
    const handler = getRegisteredHandler();
    const msg = createMessage({
      eventId: 'dup-1',
      eventType: 'order.created',
      chatId: '123',
      payload: { orderId: '1' },
      occurredAt: new Date().toISOString(),
      attempt: 0,
      traceId: 'trace-1',
    });

    await handler(msg);

    expect(rabbit.ack).toHaveBeenCalledWith(msg);
    expect(rabbit.publishWithConfirm).not.toHaveBeenCalled();
    expect(redis.setIfNotExists).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Duplicate event skipped at consumer'),
    );
  });

  it('publishes to notification exchange and manually acks on success', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConsumerService,
        { provide: AppLoggerService, useValue: logger },
        { provide: RabbitService, useValue: rabbit },
        { provide: RedisService, useValue: redis },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(60) },
        },
      ],
    }).compile();

    const service = moduleRef.get(ConsumerService);
    await service.onModuleInit();
    const handler = getRegisteredHandler();
    const msg = createMessage({
      eventId: 'ok-1',
      eventType: 'order.created',
      chatId: '123',
      payload: { orderId: '2' },
      occurredAt: new Date().toISOString(),
      attempt: 0,
      traceId: 'trace-1',
    });

    await handler(msg);

    expect(rabbit.publishWithConfirm).toHaveBeenCalledWith(
      'notifications.x',
      'notifications.telegram',
      expect.objectContaining({ eventId: 'ok-1', attempt: 0 }),
    );
    expect(redis.setIfNotExists).toHaveBeenCalledWith(
      'dedup:consumer:ok-1',
      expect.any(String),
      60,
    );
    expect(rabbit.ack).toHaveBeenCalledWith(msg);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('Consumer processed event: ok-1'),
    );
  });

  it('sends failed message to retry queue and logs warning', async () => {
    rabbit.publishWithConfirm.mockRejectedValueOnce(
      new Error('downstream unavailable'),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConsumerService,
        { provide: AppLoggerService, useValue: logger },
        { provide: RabbitService, useValue: rabbit },
        { provide: RedisService, useValue: redis },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(60) },
        },
      ],
    }).compile();

    const service = moduleRef.get(ConsumerService);
    await service.onModuleInit();
    const handler = getRegisteredHandler();
    const msg = createMessage({
      eventId: 'retry-1',
      eventType: 'order.created',
      chatId: '123',
      payload: { orderId: '3' },
      occurredAt: new Date().toISOString(),
      attempt: 0,
      traceId: 'trace-1',
    });

    await handler(msg);

    expect(rabbit.sendToQueue).toHaveBeenCalledWith(
      'events.ingest.retry.1',
      expect.objectContaining({ eventId: 'retry-1', attempt: 1 }),
    );
    expect(rabbit.ack).toHaveBeenCalledWith(msg);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Consumer retry 1 scheduled'),
    );
  });

  it('moves exhausted retries to DLQ and logs error', async () => {
    rabbit.publishWithConfirm.mockRejectedValueOnce(
      new Error('downstream unavailable'),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConsumerService,
        { provide: AppLoggerService, useValue: logger },
        { provide: RabbitService, useValue: rabbit },
        { provide: RedisService, useValue: redis },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(60) },
        },
      ],
    }).compile();

    const service = moduleRef.get(ConsumerService);
    await service.onModuleInit();
    const handler = getRegisteredHandler();
    const msg = createMessage({
      eventId: 'dlq-1',
      eventType: 'order.created',
      chatId: '123',
      payload: { orderId: '4' },
      occurredAt: new Date().toISOString(),
      attempt: 3,
      traceId: 'trace-1',
    });

    await handler(msg);

    expect(rabbit.sendToQueue).toHaveBeenCalledWith(
      'events.ingest.dlq',
      expect.objectContaining({ eventId: 'dlq-1', attempt: 4 }),
    );
    expect(rabbit.ack).toHaveBeenCalledWith(msg);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Consumer moved event dlq-1 to DLQ'),
    );
  });

  it('reprocesses message from retry queue and succeeds', async () => {
    rabbit.publishWithConfirm
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConsumerService,
        { provide: AppLoggerService, useValue: logger },
        { provide: RabbitService, useValue: rabbit },
        { provide: RedisService, useValue: redis },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(60) },
        },
      ],
    }).compile();

    const service = moduleRef.get(ConsumerService);
    await service.onModuleInit();
    const handler = getRegisteredHandler();

    const firstAttempt = createMessage({
      eventId: 'retry-cycle-1',
      eventType: 'order.created',
      chatId: '123',
      payload: { orderId: '5' },
      occurredAt: new Date().toISOString(),
      attempt: 0,
      traceId: 'trace-1',
    });
    await handler(firstAttempt);

    const secondAttempt = createMessage({
      eventId: 'retry-cycle-1',
      eventType: 'order.created',
      chatId: '123',
      payload: { orderId: '5' },
      occurredAt: new Date().toISOString(),
      attempt: 1,
      traceId: 'trace-1',
    });
    await handler(secondAttempt);

    expect(rabbit.sendToQueue).toHaveBeenCalledWith(
      'events.ingest.retry.1',
      expect.objectContaining({ eventId: 'retry-cycle-1', attempt: 1 }),
    );
    expect(rabbit.publishWithConfirm).toHaveBeenCalledTimes(2);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('Consumer processed event: retry-cycle-1'),
    );
  });
});
