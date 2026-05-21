import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppLoggerService,
  EventMessage,
  RabbitService,
  RabbitTopology,
  RedisKeys,
  RedisService,
} from '@app/common';
import { ConsumeMessage } from 'amqplib';

@Injectable()
export class ConsumerService implements OnModuleInit {
  private readonly dedupTtlSeconds: number;

  constructor(
    private readonly rabbitService: RabbitService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly logger: AppLoggerService,
  ) {
    this.dedupTtlSeconds = Number(
      this.configService.get<number>('dedupTtlSeconds') ?? 60 * 60 * 24 * 7,
    );
  }

  async onModuleInit(): Promise<void> {
    await this.rabbitService.consume(RabbitTopology.ingestQueue, (msg) =>
      this.handleMessage(msg),
    );
    this.logger.log('Consumer worker started');
  }

  private async handleMessage(msg: ConsumeMessage): Promise<void> {
    const event = JSON.parse(msg.content.toString()) as EventMessage;
    const dedupKey = `${RedisKeys.consumerDedup}:${event.eventId}`;

    if (await this.redisService.exists(dedupKey)) {
      this.logger.warn(`Duplicate event skipped at consumer: ${event.eventId}`);
      await this.rabbitService.ack(msg);
      return;
    }

    try {
      const outgoing: EventMessage = { ...event, attempt: 0 };
      await this.rabbitService.publishWithConfirm(
        RabbitTopology.notificationsExchange,
        RabbitTopology.routingKeys.notificationTelegram,
        outgoing,
      );
      await this.redisService.setIfNotExists(
        dedupKey,
        new Date().toISOString(),
        this.dedupTtlSeconds,
      );
      this.logger.log(`Consumer processed event: ${event.eventId}`);
      await this.rabbitService.ack(msg);
    } catch (error) {
      await this.handleFailure(event, msg, error);
    }
  }

  private async handleFailure(
    event: EventMessage,
    msg: ConsumeMessage,
    error: unknown,
  ): Promise<void> {
    const attempt = (event.attempt ?? 0) + 1;
    const failedEvent: EventMessage = { ...event, attempt };

    if (attempt <= RabbitTopology.ingestRetryQueues.length) {
      const retryQueue = RabbitTopology.ingestRetryQueues[attempt - 1];
      await this.rabbitService.sendToQueue(retryQueue, failedEvent);
      this.logger.warn(
        `Consumer retry ${attempt} scheduled for ${event.eventId} -> ${retryQueue}`,
      );
    } else {
      await this.rabbitService.sendToQueue(
        RabbitTopology.ingestDlq,
        failedEvent,
      );
      this.logger.error(
        `Consumer moved event ${event.eventId} to DLQ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await this.rabbitService.ack(msg);
  }
}
