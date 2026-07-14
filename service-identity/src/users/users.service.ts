import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) {}

    async create(data: any) {
        // 1. Verifica se o e-mail já existe
        const userExists = await this.prisma.user.findUnique({
            where: { email: data.email },
        });

        if (userExists) {
            throw new ConflictException('Este e-mail já está em uso.');
        }

        // 2. Criptografa a senha (o '10' é o custo do processamento, padrão de mercado)
        const hashedPassword = await bcrypt.hash(data.password, 10);

        // 3. Salva no banco e retorna os dados (escondendo a senha por segurança)
        const newUser = await this.prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                password: hashedPassword,
            },
        });

        // Removemos a senha do objeto antes de devolver como resposta HTTP
        const { password, ...result } = newUser;
        return result;
    }

    async findByEmail(email: string) {
        return this.prisma.user.findUnique({ where: { email } });
    }
}
