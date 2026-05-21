import { TelegramTemplateService } from './telegram-template.service';

describe('TelegramTemplateService', () => {
  const service = new TelegramTemplateService();

  it('renders known template', () => {
    const text = service.render({
      eventId: 'id',
      eventType: 'order.created',
      chatId: '1',
      payload: { orderId: '42' },
      occurredAt: new Date().toISOString(),
      attempt: 0,
      traceId: 'trace',
    });

    expect(text).toContain('42');
  });

  it('renders fallback template', () => {
    const text = service.render({
      eventId: 'id',
      eventType: 'custom',
      chatId: '1',
      payload: { foo: 'bar' },
      occurredAt: new Date().toISOString(),
      attempt: 0,
      traceId: 'trace',
    });

    expect(text).toContain('custom');
  });
});
