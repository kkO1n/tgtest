import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ApiKeyGuard,
  CreateEventDto,
  CreateEventResponseDto,
} from '@app/common';
import { EventsService } from './events.service';

@ApiTags('events')
@Controller('v1/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(ApiKeyGuard)
  @ApiHeader({ name: 'x-api-key', required: true })
  @ApiResponse({ status: 202, type: CreateEventResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid API key' })
  enqueue(@Body() body: CreateEventDto): Promise<CreateEventResponseDto> {
    return this.eventsService.enqueue(body);
  }
}
