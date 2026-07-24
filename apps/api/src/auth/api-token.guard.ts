import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('apiToken');
    if (!expected) {
      throw new UnauthorizedException('API_TOKEN is not configured');
    }

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

    if (!token || token !== expected) {
      throw new UnauthorizedException('Invalid or missing bearer token');
    }
    return true;
  }
}