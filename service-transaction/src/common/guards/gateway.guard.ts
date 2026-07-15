import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GatewayGuard implements CanActivate {
    constructor(private configService: ConfigService) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<any>();
        const signature = request.headers['x-gateway-signature'];
        const expectedSignature = this.configService.get<string>('API_GATEWAY_SECRET');

        if (!signature || signature !== expectedSignature) {
            throw new ForbiddenException(
                'Acesso direto não permitido. Requisição deve passar pelo API Gateway legítimo.',
            );
        }

        return true;
    }
}
