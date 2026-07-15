import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Injectable()
export class TransactionsService {
    constructor(private prisma: PrismaService) {}

    private async getOrCreateUser(userId: string, userEmail: string, userName?: string) {
        const decodedName = userName ? decodeURIComponent(userName) : 'Usuário';

        // 1. Verifica se o usuário já existe
        let user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            // Verifica por e-mail caso o ID seja diferente por qualquer motivo
            user = await this.prisma.user.findUnique({
                where: { email: userEmail },
            });

            if (user) {
                return user;
            }

            // 2. Garante que exista ao menos um FamilyGroup
            let family = await this.prisma.familyGroup.findFirst();
            if (!family) {
                family = await this.prisma.familyGroup.create({
                    data: { name: `${decodedName} & Família` },
                });
            }

            // 3. Cria o usuário no banco de transações para manter a integridade referencial
            user = await this.prisma.user.create({
                data: {
                    id: userId,
                    email: userEmail,
                    name: decodedName,
                    familyId: family.id,
                },
            });
        }

        return user;
    }

    async create(createTransactionDto: CreateTransactionDto, userId?: string, userEmail?: string, userName?: string) {
        let finalUserId = userId;
        let finalFamilyId = '8a9951a1-fbcc-4769-bcea-5eef53bf26bf'; // fallback ID do Seed (Lucas & Mariana)

        if (userId && userEmail) {
            const dbUser = await this.getOrCreateUser(userId, userEmail, userName);
            finalUserId = dbUser.id;
            finalFamilyId = dbUser.familyId;
        } else {
            finalUserId = '968ab5f5-8277-487f-8554-7571872b0fee'; // fallback ID do Seed (Lucas)
        }

        let finalCategoryId = createTransactionDto.categoryId;
        if (!finalCategoryId) {
            const category = await this.prisma.category.findFirst({
                where: { type: createTransactionDto.type },
            });
            if (category) {
                finalCategoryId = category.id;
            } else {
                const newCategory = await this.prisma.category.create({
                    data: {
                        name: createTransactionDto.type === 'INCOME' ? 'Receita' : 'Despesa',
                        type: createTransactionDto.type,
                        icon: createTransactionDto.type === 'INCOME' ? 'briefcase' : 'shopping-cart',
                    },
                });
                finalCategoryId = newCategory.id;
            }
        }

        let finalWalletId = createTransactionDto.walletId;
        if (!finalWalletId) {
            const wallet = await this.prisma.wallet.findFirst({
                where: { familyId: finalFamilyId },
            });
            if (wallet) {
                finalWalletId = wallet.id;
            } else {
                const newWallet = await this.prisma.wallet.create({
                    data: {
                        name: 'Shared Wallet Account',
                        balance: 0,
                        familyId: finalFamilyId,
                    },
                });
                finalWalletId = newWallet.id;
            }
        }

        return this.prisma.transaction.create({
            data: {
                description: createTransactionDto.description,
                amount: createTransactionDto.amount,
                type: createTransactionDto.type,
                date: new Date(createTransactionDto.date),
                familyId: finalFamilyId,
                paidById: finalUserId,
                walletId: finalWalletId,
                categoryId: finalCategoryId,
            },
        });
    }

    async findAll(userId?: string, userEmail?: string, userName?: string, page?: number, limit?: number) {
        const skip = page && limit ? (page - 1) * limit : undefined;
        const take = limit ? limit : undefined;

        if (userId && userEmail) {
            await this.getOrCreateUser(userId, userEmail, userName);
            // Busca apenas as transações do usuário logado com seus relacionamentos
            return this.prisma.transaction.findMany({
                where: { paidById: userId },
                orderBy: { date: 'desc' },
                skip,
                take,
                include: {
                    category: true,
                    wallet: true,
                    paidBy: true,
                },
            });
        }

        // Busca todas as transações caso não haja userId (fallback para desenvolvimento local)
        return this.prisma.transaction.findMany({
            orderBy: { date: 'desc' },
            skip,
            take,
            include: {
                category: true,
                wallet: true,
                paidBy: true,
            },
        });
    }

    async findOne(id: string) {
        return this.prisma.transaction.findUnique({
            where: { id },
            include: {
                category: true,
                wallet: true,
                paidBy: true,
            },
        });
    }

    update(id: string) {
        return `This action updates a #${id} transaction`; // Deixaremos para implementar depois
    }

    async remove(id: string) {
        return this.prisma.transaction.delete({ where: { id } });
    }
}
