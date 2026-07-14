import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
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
}
