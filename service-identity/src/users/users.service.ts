import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from '../auth/dto/register.dto';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) {}

    async create(data: RegisterDto) {
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

        // Retorna explicitamente os dados sem expor o hash da senha
        return {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            createdAt: newUser.createdAt,
            updatedAt: newUser.updatedAt,
        };
    }

    async findByEmail(email: string) {
        return this.prisma.user.findUnique({ where: { email } });
    }

    async createFromGoogle(name: string, email: string) {
        const randomPassword = await bcrypt.hash(
            Math.random().toString(36),
            10,
        );
        return this.prisma.user.create({
            data: {
                name,
                email,
                password: randomPassword,
            },
        });
    }
}
