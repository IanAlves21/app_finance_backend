import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';

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
                        durable: true,
                    },
                },
            },
        ]),
    ],
    controllers: [TransactionsController],
    providers: [TransactionsService],
})
export class TransactionsModule {}
