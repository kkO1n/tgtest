import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../apps/producer-api/src/app.module';
import { EventsController } from '../../apps/producer-api/src/events.controller';
import { EventsService } from '../../apps/producer-api/src/events.service';
import { ApiKeyGuard } from '../../libs/common/src/guards/api-key.guard';

describe('Producer API module integration (e2e-like)', () => {
  it('returns queued response from controller', async () => {
    process.env.API_KEY = 'test-key';

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EventsService)
      .useValue({
        enqueue: jest
          .fn()
          .mockResolvedValue({ eventId: 'event-1', status: 'queued' }),
      })
      .compile();

    const controller = moduleFixture.get(EventsController);
    await expect(
      controller.enqueue({
        eventType: 'order.created',
        chatId: '123',
        payload: { orderId: '42' },
      }),
    ).resolves.toEqual({ eventId: 'event-1', status: 'queued' });
  });

  it('rejects invalid x-api-key', async () => {
    process.env.API_KEY = 'test-key';

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const guard = moduleFixture.get(ApiKeyGuard);

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-api-key': 'wrong-key' } }),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
