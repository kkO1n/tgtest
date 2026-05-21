import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AppLoggerService,
  CreateEventDto,
  EventMessage,
  RabbitService,
  RabbitTopology,
  sleep,
} from '@app/common';

@Injectable()
export class EventsService {
  private static readonly maxAttempts = 3;

  constructor(
    private readonly rabbitService: RabbitService,
    private readonly logger: AppLoggerService,
  ) {}

  async enqueue(
    dto: CreateEventDto,
  ): Promise<{ eventId: string; status: 'queued' }> {
    const event: EventMessage = {
      eventId: dto.eventId ?? randomUUID(),
      eventType: dto.eventType,
      chatId: dto.chatId,
      payload: dto.payload,
      occurredAt: dto.occurredAt ?? new Date().toISOString(),
      metadata: dto.metadata,
      attempt: 0,
      traceId: randomUUID(),
    };

    let lastError: unknown;

    for (let attempt = 1; attempt <= EventsService.maxAttempts; attempt += 1) {
      try {
        await this.rabbitService.publishWithConfirm(
          RabbitTopology.eventsExchange,
          RabbitTopology.routingKeys.eventIncoming,
          event,
        );

        this.logger.log(`Event queued: ${event.eventId}`);
        return { eventId: event.eventId, status: 'queued' };
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Publish attempt ${attempt} failed for ${event.eventId}`,
        );
        if (attempt < EventsService.maxAttempts) {
          await sleep(100 * 2 ** attempt);
        }
      }
    }

    this.logger.error(`Failed to queue event ${event.eventId}`);
    throw new ServiceUnavailableException(
      lastError instanceof Error ? lastError.message : 'RabbitMQ unavailable',
    );
  }
}
