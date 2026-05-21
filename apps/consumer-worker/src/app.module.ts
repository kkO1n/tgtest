import { Module } from '@nestjs/common';
import { AppConfigModule, RabbitModule, RedisModule } from '@app/common';
import { ConsumerService } from './consumer.service';

@Module({
  imports: [AppConfigModule, RabbitModule, RedisModule],
  providers: [ConsumerService],
})
export class AppModule {}
