import { Injectable } from '@nestjs/common';
import { EventMessage } from '@app/common';

@Injectable()
export class TelegramTemplateService {
  render(event: EventMessage): string {
    const orderId = String(event.payload.orderId);

    switch (event.eventType) {
      case 'order.created': {
        return `New order created: ${orderId}`;
      }
      case 'payment.failed': {
        return `Payment failed for order: ${orderId}`;
      }
      default:
        return `Event ${event.eventType}: ${JSON.stringify(event.payload)}`;
    }
  }
}
