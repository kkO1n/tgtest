import { Module } from '@nestjs/common';
import { AppConfigModule, RabbitModule, RedisModule } from '@app/common';
import { NotifierService } from './notifier.service';
import { TelegramApiService } from './telegram-api.service';
import { TelegramTemplateService } from './telegram-template.service';

@Module({
  imports: [AppConfigModule, RabbitModule, RedisModule],
  providers: [NotifierService, TelegramApiService, TelegramTemplateService],
})
export class AppModule {}
