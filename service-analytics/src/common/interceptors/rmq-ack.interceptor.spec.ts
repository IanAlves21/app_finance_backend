import { ExecutionContext } from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import { lastValueFrom, of, throwError } from 'rxjs';
import { RmqAckInterceptor } from './rmq-ack.interceptor';

describe('RmqAckInterceptor', () => {
    const interceptor = new RmqAckInterceptor();

    function buildRpcContext(redelivered: boolean) {
        const channel = { ack: jest.fn(), nack: jest.fn() };
        const message = { fields: { redelivered } };
        const rmqContext = new RmqContext([message as any, channel, 'transaction.created']);
        const context = {
            getType: () => 'rpc',
            switchToRpc: () => ({ getContext: () => rmqContext }),
        } as unknown as ExecutionContext;
        return { context, channel, message };
    }

    it('acks the message after the handler succeeds', async () => {
        const { context, channel, message } = buildRpcContext(false);

        await lastValueFrom(interceptor.intercept(context, { handle: () => of('ok') }));

        expect(channel.ack).toHaveBeenCalledWith(message);
        expect(channel.nack).not.toHaveBeenCalled();
    });

    it('requeues the message on the first failure', async () => {
        const { context, channel, message } = buildRpcContext(false);

        await lastValueFrom(
            interceptor.intercept(context, { handle: () => throwError(() => new Error('db down')) }),
        );

        expect(channel.ack).not.toHaveBeenCalled();
        expect(channel.nack).toHaveBeenCalledWith(message, false, true);
    });

    it('discards the message when it fails again after a redelivery', async () => {
        const { context, channel, message } = buildRpcContext(true);

        await lastValueFrom(
            interceptor.intercept(context, { handle: () => throwError(() => new Error('still failing')) }),
        );

        expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('does nothing for HTTP requests', async () => {
        const context = { getType: () => 'http' } as unknown as ExecutionContext;
        const result = await lastValueFrom(interceptor.intercept(context, { handle: () => of('http') }));
        expect(result).toBe('http');
    });
});
