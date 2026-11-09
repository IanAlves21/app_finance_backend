import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

/**
 * Confirmação manual (ack) das mensagens do RabbitMQ.
 *
 * Com `noAck: false`, a mensagem só é removida da fila depois que o handler
 * terminar com sucesso. Se o handler falhar:
 *  - 1ª falha: a mensagem volta para a fila (requeue) para uma nova tentativa;
 *  - falha numa reentrega: é descartada e logada (evita loop infinito com mensagem "envenenada").
 *    Esses casos são corrigidos pelo script de reconciliação (prisma/sync.ts).
 *
 * Se a instância cair no meio do processamento, o RabbitMQ reentrega a mensagem
 * automaticamente, pois ela ainda não foi confirmada.
 *
 * Em requisições HTTP o interceptor não faz nada.
 */
@Injectable()
export class RmqAckInterceptor implements NestInterceptor {
    private readonly logger = new Logger('RmqAck');

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if (context.getType() !== 'rpc') {
            return next.handle();
        }

        const rmqContext = context.switchToRpc().getContext<RmqContext>();
        if (!(rmqContext instanceof RmqContext)) {
            return next.handle();
        }

        const channel = rmqContext.getChannelRef();
        const message = rmqContext.getMessage();
        const pattern = rmqContext.getPattern();

        return next.handle().pipe(
            tap(() => channel.ack(message)),
            catchError((error: unknown) => {
                const redelivered = Boolean(message?.fields?.redelivered);
                const reason = error instanceof Error ? error.message : String(error);
                if (redelivered) {
                    this.logger.error(
                        `Falha ao processar "${pattern}" novamente; mensagem descartada (rode o prisma/sync.ts para reconciliar): ${reason}`,
                    );
                } else {
                    this.logger.warn(`Falha ao processar "${pattern}", recolocando na fila para nova tentativa: ${reason}`);
                }
                channel.nack(message, false, !redelivered);
                return of(undefined);
            }),
        );
    }
}
