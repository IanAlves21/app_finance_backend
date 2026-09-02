import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';
import { NextFunction, Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import * as jwt from 'jsonwebtoken';
import { AppModule } from './app.module';

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config();

const JWT_SECRET: string = process.env.JWT_SECRET || '';
if (JWT_SECRET.trim() === '') {
    console.error('❌ ERRO CRÍTICO DE SEGURANÇA: A variável de ambiente JWT_SECRET não está definida no Gateway!');
    process.exit(1);
}

// Interface customizada para requisições autenticadas no Gateway
interface AuthenticatedRequest extends Request {
    user?: {
        sub?: string;
        email?: string;
        name?: string;
    };
}

// Middleware de Autenticação JWT no nível do API Gateway
function authMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): void {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        res.status(401).json({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Token de acesso não fornecido.',
        });
        return;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        res.status(401).json({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Formato do token inválido. Use "Bearer <token>".',
        });
        return;
    }

    const token = parts[1];

    jwt.verify(
        token,
        JWT_SECRET,
        (err: jwt.VerifyErrors | null, decoded: unknown) => {
            if (err) {
                const isExpired = err.name === 'TokenExpiredError';
                res.status(401).json({
                    statusCode: 401,
                    error: 'Unauthorized',
                    message: isExpired ? 'Token expirado.' : 'Token inválido.',
                });
                return;
            }

            // Salva o payload decodificado na requisição para uso posterior
            req.user = decoded as AuthenticatedRequest['user'];
            next();
        },
    );
}

async function bootstrap(): Promise<void> {
    // Desativamos o bodyParser para que o Gateway não interfira no JSON das requisições POST
    const app = await NestFactory.create(AppModule, { bodyParser: false });

    // Habilitar CORS para o aplicativo mobile se necessário
    app.enableCors();

    // 1. Nosso espião: Um middleware global simples para registrar TUDO que chega no Gateway
    app.use((req: Request, _res: Response, next: NextFunction): void => {
        console.log(
            `\n[Gateway Logger] ➡️ Recebeu: ${req.method} ${req.originalUrl}`,
        );
        next();
    });

    // 2. Rota de Autenticação (Pública)
    app.use(
        '/auth',
        createProxyMiddleware({
            target: 'http://localhost:3001/auth', // <--- O SEGREDO ESTÁ AQUI: repomos o /auth no destino!
            changeOrigin: true,
            logger: console, // Habilita os logs internos da própria biblioteca do proxy
        }),
    );

    // 3. Rota de Transações (Protegida)
    app.use(
        '/transactions',
        authMiddleware as any, // Cast temporário para middleware Express padrão se necessário
        createProxyMiddleware({
            target: 'http://localhost:3000/transactions', // Repomos o /transactions no destino
            changeOrigin: true,
            logger: console,
            on: {
                proxyReq: (proxyReq, req: any) => {
                    // Adiciona a assinatura de segurança secreta do Gateway para comunicação interna confiável
                    proxyReq.setHeader(
                        'x-gateway-signature',
                        process.env.API_GATEWAY_SECRET || '',
                    );

                    // Opcional: Adiciona cabeçalhos com dados do usuário autenticado para os microserviços consumirem
                    const authReq = req as AuthenticatedRequest;
                    if (authReq.user) {
                        proxyReq.setHeader('x-user-id', authReq.user.sub || '');
                        proxyReq.setHeader(
                            'x-user-email',
                            authReq.user.email || '',
                        );
                        proxyReq.setHeader(
                            'x-user-name',
                            encodeURIComponent(authReq.user.name || ''),
                        );
                    }
                },
            },
        }),
    );

    // 4. Rota de Analytics (Protegida)
    app.use(
        '/analytics',
        authMiddleware as any,
        createProxyMiddleware({
            target: 'http://localhost:3003/analytics', // Repomos o /analytics no destino
            changeOrigin: true,
            logger: console,
            on: {
                proxyReq: (proxyReq, req: any) => {
                    proxyReq.setHeader(
                        'x-gateway-signature',
                        process.env.API_GATEWAY_SECRET || '',
                    );

                    const authReq = req as AuthenticatedRequest;
                    if (authReq.user) {
                        proxyReq.setHeader('x-user-id', authReq.user.sub || '');
                        proxyReq.setHeader(
                            'x-user-email',
                            authReq.user.email || '',
                        );
                        proxyReq.setHeader(
                            'x-user-name',
                            encodeURIComponent(authReq.user.name || ''),
                        );
                    }
                },
            },
        }),
    );

    // 5. Rota de Budgets (Protegida)
    app.use(
        '/budgets',
        authMiddleware as any,
        createProxyMiddleware({
            target: 'http://localhost:3000/budgets', // Repomos o /budgets no destino
            changeOrigin: true,
            logger: console,
            on: {
                proxyReq: (proxyReq, req: any) => {
                    proxyReq.setHeader(
                        'x-gateway-signature',
                        process.env.API_GATEWAY_SECRET || '',
                    );

                    const authReq = req as AuthenticatedRequest;
                    if (authReq.user) {
                        proxyReq.setHeader('x-user-id', authReq.user.sub || '');
                        proxyReq.setHeader(
                            'x-user-email',
                            authReq.user.email || '',
                        );
                        proxyReq.setHeader(
                            'x-user-name',
                            encodeURIComponent(authReq.user.name || ''),
                        );
                    }
                },
            },
        }),
    );

    await app.listen(8080, '0.0.0.0');
    console.log(`🚀 API Gateway rodando na porta 8080...`);
}

bootstrap().catch((err: unknown) => {
    console.error('Erro ao inicializar o API Gateway:', err);
});
