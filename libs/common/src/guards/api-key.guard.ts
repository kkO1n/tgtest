import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const configuredKey =
      this.configService.get<string>('apiKey') ??
      this.configService.get<string>('API_KEY');
    const receivedKey = request.headers['x-api-key'];

    if (!configuredKey || !receivedKey || configuredKey !== receivedKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
