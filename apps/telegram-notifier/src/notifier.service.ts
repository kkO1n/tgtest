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
import { TelegramApiService } from './telegram-api.service';
import { TelegramTemplateService } from './telegram-template.service';

@Injectable()
export class NotifierService implements OnModuleInit {
  private readonly dedupTtlSeconds: number;
  private readonly botToken: string;

  constructor(
    private readonly rabbitService: RabbitService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly telegramApiService: TelegramApiService,
    private readonly telegramTemplateService: TelegramTemplateService,
    private readonly logger: AppLoggerService,
  ) {
    this.dedupTtlSeconds = Number(
      this.configService.get<number>('dedupTtlSeconds') ?? 60 * 60 * 24 * 7,
    );
    this.botToken = this.configService.get<string>('telegramBotToken') ?? '';
  }

  async onModuleInit(): Promise<void> {
    await this.rabbitService.consume(RabbitTopology.notifyQueue, (msg) =>
      this.handleMessage(msg),
    );
    this.logger.log('Telegram notifier started');
  }

  private async handleMessage(msg: ConsumeMessage): Promise<void> {
    const event = JSON.parse(msg.content.toString()) as EventMessage;
    const dedupKey = `${RedisKeys.notifierDedup}:${event.eventId}`;

    if (await this.redisService.exists(dedupKey)) {
      this.logger.warn(`Duplicate event skipped at notifier: ${event.eventId}`);
      await this.rabbitService.ack(msg);
      return;
    }

    try {
      if (!this.botToken) {
        throw new Error('TELEGRAM_BOT_TOKEN is required');
      }
      const text = this.telegramTemplateService.render(event);
      await this.telegramApiService.sendMessage(
        this.botToken,
        event.chatId,
        text,
      );
      await this.redisService.setIfNotExists(
        dedupKey,
        new Date().toISOString(),
        this.dedupTtlSeconds,
      );
      this.logger.log(`Telegram notification sent for event ${event.eventId}`);
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

    if (attempt <= RabbitTopology.notifyRetryQueues.length) {
      const retryQueue = RabbitTopology.notifyRetryQueues[attempt - 1];
      await this.rabbitService.sendToQueue(retryQueue, failedEvent);
      this.logger.warn(
        `Notifier retry ${attempt} scheduled for ${event.eventId} -> ${retryQueue}`,
      );
    } else {
      await this.rabbitService.sendToQueue(
        RabbitTopology.notifyDlq,
        failedEvent,
      );
      this.logger.error(
        `Notifier moved event ${event.eventId} to DLQ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await this.rabbitService.ack(msg);
  }
}
