import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { TransactionsModule } from './transactions/transactions.module';
import { BudgetsModule } from './budgets/budgets.module';
import { GroupsModule } from './groups/groups.module';
import { GatewayGuard } from './common/guards/gateway.guard';

@Module({
    imports: [
        // Isso aqui faz o Nest ler o arquivo .env e disponibilizar para o app inteiro
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        TransactionsModule,
        BudgetsModule,
        GroupsModule,
    ],
    controllers: [],
    providers: [
        {
            provide: APP_GUARD,
            useClass: GatewayGuard,
        },
    ],
})
export class AppModule {}
