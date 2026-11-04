import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class GatewayGuard implements CanActivate {
    constructor(private configService: ConfigService) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();
        const signature = request.headers['x-gateway-signature'];
        const expectedSignature = this.configService.get<string>('API_GATEWAY_SECRET');

        if (!expectedSignature || expectedSignature.trim() === '' || !signature || signature !== expectedSignature) {
            throw new ForbiddenException(
                'Acesso direto não permitido. Requisição deve passar pelo API Gateway legítimo.',
            );
        }

        return true;
    }
}
