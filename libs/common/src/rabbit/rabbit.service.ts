import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Channel,
  ChannelModel,
  ConfirmChannel,
  connect,
  ConsumeMessage,
  Options,
} from 'amqplib';
import { AppLoggerService } from '../logging/app-logger.service';
import { RabbitTopology } from '../constants/rabbit.constants';

@Injectable()
export class RabbitService implements OnModuleDestroy {
  private connection?: ChannelModel;
  private channel?: Channel;
  private confirmChannel?: ConfirmChannel;
  private topologyReady = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLoggerService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.confirmChannel?.close().catch(() => undefined);
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  async getChannel(): Promise<Channel> {
    if (this.channel) {
      return this.channel;
    }

    const conn = await this.getConnection();
    this.channel = await conn.createChannel();
    await this.ensureTopology(this.channel);
    return this.channel;
  }

  async getConfirmChannel(): Promise<ConfirmChannel> {
    if (this.confirmChannel) {
      return this.confirmChannel;
    }

    const conn = await this.getConnection();
    this.confirmChannel = await conn.createConfirmChannel();
    await this.ensureTopology(this.confirmChannel);
    return this.confirmChannel;
  }

  async publishWithConfirm(
    exchange: string,
    routingKey: string,
    payload: object,
    options?: Options.Publish,
  ): Promise<void> {
    const channel = await this.getConfirmChannel();
    channel.publish(
      exchange,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      {
        persistent: true,
        contentType: 'application/json',
        ...options,
      },
    );
    await channel.waitForConfirms();
  }

  async consume(
    queue: string,
    handler: (msg: ConsumeMessage) => Promise<void>,
  ): Promise<void> {
    const channel = await this.getChannel();
    const prefetch = Number(this.configService.get<number>('rabbitPrefetch') ?? 10);
    if (Number.isFinite(prefetch) && prefetch > 0) {
      await channel.prefetch(prefetch);
    }
    await channel.consume(queue, (msg) => {
      if (!msg) {
        return;
      }
      void handler(msg);
    }, { noAck: false });
  }

  async ack(msg: ConsumeMessage): Promise<void> {
    const channel = await this.getChannel();
    channel.ack(msg);
  }

  async nack(msg: ConsumeMessage, requeue = true): Promise<void> {
    const channel = await this.getChannel();
    channel.nack(msg, false, requeue);
  }

  async sendToQueue(queue: string, payload: object): Promise<void> {
    const channel = await this.getChannel();
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: 'application/json',
    });
  }

  private async getConnection(): Promise<ChannelModel> {
    if (this.connection) {
      return this.connection;
    }

    const rabbitUrl = this.configService.get<string>('rabbitUrl');
    if (!rabbitUrl) {
      throw new Error('RABBITMQ_URL is required');
    }

    const connection = await connect(rabbitUrl);
    connection.on('error', (error: unknown) =>
      this.logger.error(
        `RabbitMQ connection error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
    connection.on('close', () =>
      this.logger.warn('RabbitMQ connection closed'),
    );
    this.connection = connection;

    return connection;
  }

  private async ensureTopology(channel: Channel): Promise<void> {
    if (this.topologyReady) {
      return;
    }
    await this.setupTopology(channel);
    this.topologyReady = true;
  }

  private async setupTopology(channel: Channel): Promise<void> {
    await channel.assertExchange(RabbitTopology.eventsExchange, 'topic', {
      durable: true,
    });
    await channel.assertExchange(
      RabbitTopology.notificationsExchange,
      'topic',
      { durable: true },
    );

    await channel.assertQueue(RabbitTopology.ingestQueue, { durable: true });
    await channel.bindQueue(
      RabbitTopology.ingestQueue,
      RabbitTopology.eventsExchange,
      RabbitTopology.routingKeys.eventIncoming,
    );

    await channel.assertQueue(RabbitTopology.ingestDlq, { durable: true });

    await Promise.all(
      RabbitTopology.ingestRetryQueues.map((queueName, idx) =>
        channel.assertQueue(queueName, {
          durable: true,
          deadLetterExchange: RabbitTopology.eventsExchange,
          deadLetterRoutingKey: RabbitTopology.routingKeys.eventIncoming,
          messageTtl: RabbitTopology.retryTtlsMs[idx],
        }),
      ),
    );

    await channel.assertQueue(RabbitTopology.notifyQueue, { durable: true });
    await channel.bindQueue(
      RabbitTopology.notifyQueue,
      RabbitTopology.notificationsExchange,
      RabbitTopology.routingKeys.notificationTelegram,
    );

    await channel.assertQueue(RabbitTopology.notifyDlq, { durable: true });

    await Promise.all(
      RabbitTopology.notifyRetryQueues.map((queueName, idx) =>
        channel.assertQueue(queueName, {
          durable: true,
          deadLetterExchange: RabbitTopology.notificationsExchange,
          deadLetterRoutingKey: RabbitTopology.routingKeys.notificationTelegram,
          messageTtl: RabbitTopology.retryTtlsMs[idx],
        }),
      ),
    );
  }
}
