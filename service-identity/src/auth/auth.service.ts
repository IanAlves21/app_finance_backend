import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

@Injectable()
export class AuthService {
    private googleClient = new OAuth2Client();

    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
    ) {}

    async login(email: string, pass: string) {
        // 1. Busca o usuário
        const user = await this.usersService.findByEmail(email);
        if (!user) {
            throw new UnauthorizedException('Credenciais inválidas');
        }

        // 2. Compara a senha digitada com o Hash do banco
        const isPasswordValid = await bcrypt.compare(pass, user.password);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Credenciais inválidas');
        }

        // 3. Monta o payload (os dados que vão dentro do Token)
        const payload = { sub: user.id, email: user.email, name: user.name };

        // 4. Gera e devolve o Token
        return {
            access_token: await this.jwtService.signAsync(payload),
            user: { id: user.id, name: user.name, email: user.email },
        };
    }

    async loginGoogle(idToken: string) {
        let payloadGoogle: TokenPayload | undefined;
        try {
            const ticket = await this.googleClient.verifyIdToken({
                idToken: idToken,
            });
            payloadGoogle = ticket.getPayload();
        } catch {
            throw new UnauthorizedException(
                'Token do Google inválido ou expirado',
            );
        }

        if (!payloadGoogle || !payloadGoogle.email) {
            throw new UnauthorizedException(
                'Dados de e-mail ausentes no token do Google',
            );
        }

        const email = payloadGoogle.email;
        const name = payloadGoogle.name ? payloadGoogle.name : 'Google User';

        // 1. Busca se o usuário já existe
        let user = await this.usersService.findByEmail(email);

        // 2. Se não existir, registra automaticamente
        if (!user) {
            user = await this.usersService.createFromGoogle(name, email);
        }

        // 3. Monta o payload do JWT para a sessão no app
        const payload = { sub: user.id, email: user.email, name: user.name };

        // 4. Gera e devolve o Token de acesso
        return {
            access_token: await this.jwtService.signAsync(payload),
            user: { id: user.id, name: user.name, email: user.email },
        };
    }
}
