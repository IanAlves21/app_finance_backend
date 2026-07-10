import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
    imports: [
        // Isso aqui faz o Nest ler o arquivo .env e disponibilizar para o app inteiro
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        TransactionsModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}
