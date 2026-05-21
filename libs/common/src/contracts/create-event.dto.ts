import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateEventDto {
  @ApiPropertyOptional({
    description: 'Unique event id for idempotency (UUID v4)',
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiProperty({
    description: 'Event type for downstream template routing',
    example: 'order.created',
  })
  @IsString()
  @IsNotEmpty()
  eventType!: string;

  @ApiProperty({ description: 'Telegram chat id', example: '-1001234567890' })
  @IsString()
  @IsNotEmpty()
  chatId!: string;

  @ApiProperty({ description: 'Arbitrary event payload' })
  @IsObject()
  payload!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Event occurrence timestamp in ISO format',
  })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}
