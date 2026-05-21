import { Global, Module } from '@nestjs/common';
import { RabbitService } from './rabbit.service';
import { AppLoggerService } from '../logging/app-logger.service';

@Global()
@Module({
  providers: [RabbitService, AppLoggerService],
  exports: [RabbitService, AppLoggerService],
})
export class RabbitModule {}
