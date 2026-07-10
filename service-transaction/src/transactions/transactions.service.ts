import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Injectable()
export class TransactionsService {
    constructor(private prisma: PrismaService) {}

    async create(createTransactionDto: CreateTransactionDto) {
        return this.prisma.transaction.create({
            data: {
                description: createTransactionDto.description,
                amount: createTransactionDto.amount,
                type: createTransactionDto.type,
                date: new Date(createTransactionDto.date),
                // Seus IDs do Seed continuam aqui:
                familyId: '8a9951a1-fbcc-4769-bcea-5eef53bf26bf',
                paidById: '968ab5f5-8277-487f-8554-7571872b0fee',
                walletId: 'ac149e49-2f12-4fd3-8aeb-55fd3f3d8655',
                categoryId: '5b2da0da-de54-49cc-affe-7b9cce9f67c8',
            },
        });
    }

    async findAll() {
        // Busca todas as transações, ordenando das mais novas para as mais velhas
        return this.prisma.transaction.findMany({
            orderBy: { date: 'desc' },
        });
    }

    async findOne(id: string) {
        return this.prisma.transaction.findUnique({ where: { id } });
    }

    async update(id: string, updateTransactionDto: any) {
        return `This action updates a #${id} transaction`; // Deixaremos para implementar depois
    }

    async remove(id: string) {
        return this.prisma.transaction.delete({ where: { id } });
    }
}
