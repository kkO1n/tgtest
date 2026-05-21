import { Test } from '@nestjs/testing';
import { AppLoggerService, RabbitService } from '@app/common';
import { EventsService } from './events.service';

describe('EventsService', () => {
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns queued response and generated eventId', async () => {
    const publishWithConfirm = jest
      .fn<Promise<void>, [string, string, object]>()
      .mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: AppLoggerService, useValue: logger },
        { provide: RabbitService, useValue: { publishWithConfirm } },
      ],
    }).compile();

    const service = moduleRef.get(EventsService);
    const result = await service.enqueue({
      eventType: 'order.created',
      chatId: '12345',
      payload: { orderId: '42' },
    });

    expect(result.status).toBe('queued');
    expect(result.eventId).toBeDefined();
    expect(publishWithConfirm).toHaveBeenCalledTimes(1);
    const publishedEvent = publishWithConfirm.mock.calls[0]?.[2] as Record<
      string,
      unknown
    >;
    expect(publishWithConfirm).toHaveBeenCalledWith(
      'events.x',
      'events.incoming',
      expect.any(Object),
    );
    expect(typeof publishedEvent.eventId).toBe('string');
    expect(typeof publishedEvent.traceId).toBe('string');
    expect(publishedEvent.eventType).toBe('order.created');
    expect(publishedEvent.chatId).toBe('12345');
    expect(publishedEvent.payload).toEqual({ orderId: '42' });
    expect(publishedEvent.attempt).toBe(0);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('Event queued:'),
    );
  });

  it('uses provided eventId to support idempotent publishing', async () => {
    const publishWithConfirm = jest
      .fn<Promise<void>, [string, string, object]>()
      .mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: AppLoggerService, useValue: logger },
        { provide: RabbitService, useValue: { publishWithConfirm } },
      ],
    }).compile();

    const service = moduleRef.get(EventsService);
    const eventId = '14e3f6a4-8740-4f10-a8f8-c5de6a537676';

    const result = await service.enqueue({
      eventId,
      eventType: 'payment.failed',
      chatId: '12345',
      payload: { orderId: '77' },
    });

    expect(result.eventId).toBe(eventId);
    expect(publishWithConfirm).toHaveBeenCalledWith(
      'events.x',
      'events.incoming',
      expect.objectContaining({ eventId }),
    );
  });

  it('retries temporary publish failures and confirms successful send', async () => {
    const publishWithConfirm = jest
      .fn<Promise<void>, [string, string, object]>()
      .mockRejectedValueOnce(new Error('Temporary connection error'))
      .mockRejectedValueOnce(new Error('Temporary channel error'))
      .mockResolvedValueOnce(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: AppLoggerService, useValue: logger },
        { provide: RabbitService, useValue: { publishWithConfirm } },
      ],
    }).compile();

    const service = moduleRef.get(EventsService);

    const result = await service.enqueue({
      eventType: 'order.created',
      chatId: '12345',
      payload: { orderId: '101' },
    });

    expect(result.status).toBe('queued');
    expect(publishWithConfirm).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('Event queued:'),
    );
  });

  it('fails after max retries on persistent connection issues', async () => {
    const publishWithConfirm = jest
      .fn<Promise<void>, [string, string, object]>()
      .mockRejectedValue(new Error('Connection down'));

    const moduleRef = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: AppLoggerService, useValue: logger },
        { provide: RabbitService, useValue: { publishWithConfirm } },
      ],
    }).compile();

    const service = moduleRef.get(EventsService);

    await expect(
      service.enqueue({
        eventType: 'order.created',
        chatId: '12345',
        payload: { orderId: '101' },
      }),
    ).rejects.toThrow('Connection down');

    expect(publishWithConfirm).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to queue event'),
    );
  });
});
