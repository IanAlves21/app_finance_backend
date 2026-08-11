import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { GatewayGuard } from './common/guards/gateway.guard';

@Module({
    imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AnalyticsModule],
    controllers: [],
    providers: [
        {
            provide: APP_GUARD,
            useClass: GatewayGuard,
        },
    ],
})
export class AppModule {}
