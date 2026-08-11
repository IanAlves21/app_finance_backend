import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BudgetsService } from './budgets.service';
import { BudgetsController } from './budgets.controller';

@Module({
    imports: [
        ClientsModule.register([
            {
                name: 'ANALYTICS_SERVICE',
                transport: Transport.RMQ,
                options: {
                    urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
                    queue: 'analytics_queue',
                    queueOptions: {
                        durable: false,
                    },
                },
            },
        ]),
    ],
    controllers: [BudgetsController],
    providers: [BudgetsService],
})
export class BudgetsModule {}
