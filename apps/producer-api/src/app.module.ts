import { Module } from '@nestjs/common';
import { AppConfigModule, RabbitModule } from '@app/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [AppConfigModule, RabbitModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class AppModule {}
