import { ApiProperty } from '@nestjs/swagger';

export class CreateEventResponseDto {
  @ApiProperty({ example: '8d57fd89-8b12-43d4-a181-88f7cb5f4da4' })
  eventId!: string;

  @ApiProperty({ example: 'queued' })
  status!: 'queued';
}
