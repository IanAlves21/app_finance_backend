import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

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

    async findAll(
        userId?: string,
        userEmail?: string,
        userName?: string,
        page?: number,
        limit?: number,
        startDate?: string,
        endDate?: string,
    ) {
        // await new Promise((r) => setTimeout(r, 10000));
        const skip = page && limit ? (page - 1) * limit : undefined;
        const take = limit ? limit : undefined;

        const dateFilter: Record<string, any> = {};
        if (startDate) {
            dateFilter.gte = new Date(startDate);
        }
        if (endDate) {
            dateFilter.lte = new Date(endDate);
        }

        const whereClause: Record<string, any> = {};
        if (userId && userEmail) {
            await this.getOrCreateUser(userId, userEmail, userName);
            whereClause.paidById = userId;
        }
        if (startDate || endDate) {
            whereClause.date = dateFilter;
        }

        return this.prisma.transaction.findMany({
            where: whereClause,
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

    async update(id: string, updateTransactionDto: UpdateTransactionDto) {
        const dataToUpdate: Prisma.TransactionUpdateInput = { ...updateTransactionDto };
        if (updateTransactionDto.date) {
            dataToUpdate.date = new Date(updateTransactionDto.date);
        }

        return this.prisma.transaction.update({
            where: { id },
            data: dataToUpdate,
        });
    }

    async remove(id: string, userId?: string, userEmail?: string, userName?: string) {
        const transaction = await this.prisma.transaction.findUnique({
            where: { id },
        });

        if (!transaction) {
            throw new NotFoundException('Transação não encontrada');
        }

        if (userId && userEmail) {
            const dbUser = await this.getOrCreateUser(userId, userEmail, userName);
            // Verifica se o usuário é o dono da transação
            if (transaction.paidById !== dbUser.id) {
                throw new ForbiddenException('Você não tem permissão para excluir esta transação.');
            }
        }

        return this.prisma.transaction.delete({ where: { id } });
    }

    async findAllCategories(userId?: string, userEmail?: string, userName?: string) {
        let finalFamilyId: string | undefined = undefined;

        if (userId && userEmail) {
            const dbUser = await this.getOrCreateUser(userId, userEmail, userName);
            finalFamilyId = dbUser.familyId;
        }

        return this.prisma.category.findMany({
            where: {
                OR: [{ familyId: null }, ...(finalFamilyId ? [{ familyId: finalFamilyId }] : [])],
            },
            orderBy: {
                name: 'asc',
            },
        });
    }

    async createCategory(
        data: { name: string; type: 'INCOME' | 'EXPENSE'; icon?: string; color?: string },
        userId?: string,
        userEmail?: string,
        userName?: string,
    ) {
        let finalFamilyId: string | null = null;

        if (userId && userEmail) {
            const dbUser = await this.getOrCreateUser(userId, userEmail, userName);
            finalFamilyId = dbUser.familyId;
        }

        return this.prisma.category.create({
            data: {
                name: data.name,
                type: data.type,
                icon: data.icon || 'category',
                color: data.color || '#1A2D5A',
                familyId: finalFamilyId,
            },
        });
    }

    async updateCategory(
        id: string,
        data: { name?: string; type?: 'INCOME' | 'EXPENSE'; icon?: string; color?: string },
        userId?: string,
        userEmail?: string,
        userName?: string,
    ) {
        if (!userId || !userEmail) {
            throw new UnauthorizedException('User credentials are required');
        }

        const dbUser = await this.getOrCreateUser(userId, userEmail, userName);

        const category = await this.prisma.category.findUnique({
            where: { id },
        });

        if (!category) {
            throw new NotFoundException('Category not found');
        }

        if (!category.familyId) {
            throw new ForbiddenException('System default categories cannot be modified');
        }

        if (category.familyId !== dbUser.familyId) {
            throw new ForbiddenException('You do not have permission to modify this category');
        }

        return this.prisma.category.update({
            where: { id },
            data: {
                name: data.name,
                type: data.type,
                icon: data.icon,
                color: data.color,
            },
        });
    }

    async deleteCategory(id: string, userId?: string, userEmail?: string, userName?: string) {
        if (!userId || !userEmail) {
            throw new UnauthorizedException('User credentials are required');
        }

        const dbUser = await this.getOrCreateUser(userId, userEmail, userName);

        const category = await this.prisma.category.findUnique({
            where: { id },
        });

        if (!category) {
            throw new NotFoundException('Category not found');
        }

        if (!category.familyId) {
            throw new ForbiddenException('System default categories cannot be deleted');
        }

        if (category.familyId !== dbUser.familyId) {
            throw new ForbiddenException('You do not have permission to delete this category');
        }

        // Check associated transactions
        const associatedTransactions = await this.prisma.transaction.count({
            where: { categoryId: id },
        });

        if (associatedTransactions > 0) {
            throw new BadRequestException(
                'Não é possível excluir esta categoria pois ela já possui transações associadas.',
            );
        }

        return this.prisma.category.delete({
            where: { id },
        });
    }
}
