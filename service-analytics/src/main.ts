import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { Transport } from '@nestjs/microservices';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
        }),
    );

    // Conecta o transporte de mensageria do RabbitMQ
    app.connectMicroservice({
        transport: Transport.RMQ,
        options: {
            urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
            queue: 'analytics_queue',
            queueOptions: {
                durable: true,
            },
        },
    });

    // Inicia os microserviços em segundo plano
    await app.startAllMicroservices();

    const port = process.env.PORT ?? 3003;
    await app.listen(port);
    console.log(`🚀 Service Analytics rodando na porta ${port} com mensageria...`);
}
bootstrap().catch((err) => console.error(err));
