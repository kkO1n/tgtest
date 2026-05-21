export interface EventMessage {
  eventId: string;
  eventType: string;
  chatId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  attempt: number;
  traceId: string;
  metadata?: Record<string, string>;
}
