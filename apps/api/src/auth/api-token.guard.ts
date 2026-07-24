import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

function extractBearer(header: string | undefined): string {
  if (!header) return '';
  const value = header.trim();
  if (value.toLowerCase().startsWith('bearer ')) {
    return value.slice(7).trim();
  }
  return value.trim();
}

@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = (this.config.get<string>('apiToken') ?? '').trim();
    if (!expected) {
      throw new UnauthorizedException('API_TOKEN is not configured on the server');
    }

    const req = context.switchToHttp().getRequest<Request>();
    const fromAuth = extractBearer(req.headers.authorization);
    const fromApiKey = String(req.headers['x-api-token'] ?? '').trim();
    const token = fromAuth || fromApiKey;

    if (!token || token !== expected) {
      throw new UnauthorizedException('Invalid or missing bearer token');
    }
    return true;
  }
}
