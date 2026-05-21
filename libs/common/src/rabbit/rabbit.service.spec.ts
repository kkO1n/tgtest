import { ConfigService } from '@nestjs/config';
import { RabbitService } from './rabbit.service';
import { AppLoggerService } from '../logging/app-logger.service';

describe('RabbitService', () => {
  it('serializes payload to JSON buffer and waits for publisher confirms', async () => {
    const publish = jest.fn();
    const waitForConfirms = jest.fn().mockResolvedValue(undefined);

    const service = new RabbitService(
      {
        get: jest.fn().mockReturnValue('amqp://guest:guest@localhost:5672'),
      } as unknown as ConfigService,
      {
        error: jest.fn(),
        warn: jest.fn(),
        log: jest.fn(),
      } as unknown as AppLoggerService,
    );

    jest.spyOn(service, 'getConfirmChannel').mockResolvedValue({
      publish,
      waitForConfirms,
    } as never);

    const payload = { eventId: 'evt-1', payload: { orderId: '42' } };
    await service.publishWithConfirm('events.x', 'events.incoming', payload);

    expect(publish).toHaveBeenCalledTimes(1);
    const [exchange, routingKey, messageBuffer, options] = publish.mock
      .calls[0] as [string, string, Buffer, Record<string, unknown>];

    expect(exchange).toBe('events.x');
    expect(routingKey).toBe('events.incoming');
    expect(messageBuffer.toString()).toBe(JSON.stringify(payload));
    expect(options).toEqual(
      expect.objectContaining({
        persistent: true,
        contentType: 'application/json',
      }),
    );
    expect(waitForConfirms).toHaveBeenCalledTimes(1);
  });
});
