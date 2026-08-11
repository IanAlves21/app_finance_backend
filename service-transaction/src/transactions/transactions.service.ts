import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
    Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

export function parseSafeDate(dateStr: any): Date | null {
    if (!dateStr) return null;
    const cleanStr = String(dateStr).trim();
    if (cleanStr === '' || cleanStr === 'undefined' || cleanStr === 'null') {
        return null;
    }

    // Check for DD/MM/YYYY format
    const brSlashRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/;
    if (brSlashRegex.test(cleanStr)) {
        const match = cleanStr.match(brSlashRegex);
        if (match) {
            const part1 = parseInt(match[1], 10);
            const part2 = parseInt(match[2], 10);
            const year = match[3];
            const rest = match[4] || '';
            // If part1 is a valid day (1-31) and part2 is a valid month (1-12)
            if (part1 <= 31 && part2 <= 12) {
                const day = match[1].padStart(2, '0');
                const month = match[2].padStart(2, '0');
                const isoStr = `${year}-${month}-${day}${rest.replace(/^\s+/, 'T')}`;
                const parsed = new Date(isoStr);
                if (!isNaN(parsed.getTime())) {
                    return parsed;
                }
            }
        }
    }

    // Check for DD-MM-YYYY format
    const brDashRegex = /^(\d{1,2})-(\d{1,2})-(\d{4})(.*)$/;
    if (brDashRegex.test(cleanStr)) {
        const match = cleanStr.match(brDashRegex);
        if (match) {
            const part1 = parseInt(match[1], 10);
            const part2 = parseInt(match[2], 10);
            const year = match[3];
            const rest = match[4] || '';
            if (part1 <= 31 && part2 <= 12) {
                const day = match[1].padStart(2, '0');
                const month = match[2].padStart(2, '0');
                const isoStr = `${year}-${month}-${day}${rest.replace(/^\s+/, 'T')}`;
                const parsed = new Date(isoStr);
                if (!isNaN(parsed.getTime())) {
                    return parsed;
                }
            }
        }
    }

    // Default fallback to standard Date constructor
    const parsed = new Date(cleanStr);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }

    return null;
}

@Injectable()
export class TransactionsService {
    constructor(
        private prisma: PrismaService,
        @Inject('ANALYTICS_SERVICE') private readonly analyticsClient: ClientProxy,
    ) {}

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
        if (createTransactionDto.type === 'EXPENSE' && !createTransactionDto.paymentMethod) {
            throw new BadRequestException('Método de pagamento é obrigatório para despesas.');
        }

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

        const installments = createTransactionDto.installments && createTransactionDto.installments > 1
            ? createTransactionDto.installments
            : 1;

        if (createTransactionDto.paymentMethod === 'CREDIT' && installments > 1) {
            const createdTransactions: any[] = [];
            const baseAmount = createTransactionDto.amount / installments;
            const installmentAmount = Math.round(baseAmount * 100) / 100;
            const originalDate = parseSafeDate(createTransactionDto.date) || new Date();

            for (let i = 1; i <= installments; i++) {
                let finalAmount = installmentAmount;
                if (i === installments) {
                    const totalDivided = installmentAmount * (installments - 1);
                    finalAmount = Math.round((createTransactionDto.amount - totalDivided) * 100) / 100;
                }

                const installmentDate = new Date(originalDate);
                installmentDate.setMonth(originalDate.getMonth() + (i - 1));

                const transaction = await this.prisma.transaction.create({
                    data: {
                        description: `${createTransactionDto.description} (${i}/${installments})`,
                        amount: finalAmount,
                        type: createTransactionDto.type,
                        date: installmentDate,
                        familyId: finalFamilyId,
                        paidById: finalUserId,
                        walletId: finalWalletId,
                        categoryId: finalCategoryId,
                        paymentMethod: createTransactionDto.paymentMethod,
                    },
                    include: {
                        category: true,
                        paidBy: true,
                        wallet: true,
                        family: true,
                    },
                });

                this.analyticsClient.emit('transaction.created', transaction);
                createdTransactions.push(transaction);
            }

            return createdTransactions[0];
        }

        const transaction = await this.prisma.transaction.create({
            data: {
                description: createTransactionDto.description,
                amount: createTransactionDto.amount,
                type: createTransactionDto.type,
                date: parseSafeDate(createTransactionDto.date) || new Date(),
                familyId: finalFamilyId,
                paidById: finalUserId,
                walletId: finalWalletId,
                categoryId: finalCategoryId,
                paymentMethod: createTransactionDto.paymentMethod,
            },
            include: {
                category: true,
                paidBy: true,
                wallet: true,
                family: true,
            },
        });

        // Emit asynchronously to RabbitMQ
        this.analyticsClient.emit('transaction.created', transaction);

        return transaction;
    }

    async findAll(
        userId?: string,
        userEmail?: string,
        userName?: string,
        page?: number,
        limit?: number,
        startDate?: string,
        endDate?: string,
        categoryId?: string,
    ) {
        // await new Promise((r) => setTimeout(r, 10000));
        const skip = page && limit ? (page - 1) * limit : undefined;
        const take = limit ? limit : undefined;

        const parsedStartDate = parseSafeDate(startDate);
        const parsedEndDate = parseSafeDate(endDate);

        const dateFilter: Record<string, any> = {};
        if (parsedStartDate) {
            dateFilter.gte = parsedStartDate;
        }
        if (parsedEndDate) {
            dateFilter.lte = parsedEndDate;
        }

        const whereClause: Record<string, any> = {};
        if (userId && userEmail) {
            const dbUser = await this.getOrCreateUser(userId, userEmail, userName);
            whereClause.familyId = dbUser.familyId;
        }
        if (parsedStartDate || parsedEndDate) {
            whereClause.date = dateFilter;
        }
        if (categoryId) {
            whereClause.categoryId = categoryId;
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

    async getSummary(userId?: string, userEmail?: string, userName?: string, startDate?: string, endDate?: string) {
        const parsedStartDate = parseSafeDate(startDate);
        const parsedEndDate = parseSafeDate(endDate);

        const dateFilter: Record<string, any> = {};
        if (parsedStartDate) {
            dateFilter.gte = parsedStartDate;
        }
        if (parsedEndDate) {
            dateFilter.lte = parsedEndDate;
        }

        const whereClause: Record<string, any> = {};
        if (userId && userEmail) {
            const dbUser = await this.getOrCreateUser(userId, userEmail, userName);
            whereClause.familyId = dbUser.familyId;
        }
        if (parsedStartDate || parsedEndDate) {
            whereClause.date = dateFilter;
        }

        const transactions = await this.prisma.transaction.findMany({
            where: whereClause,
            select: {
                amount: true,
                type: true,
            },
        });

        console.log(transactions);

        let income = 0;
        let expenses = 0;
        for (const tx of transactions) {
            // Convert Prisma.Decimal to standard JavaScript number safely (supports mock numbers too)
            const amountNumber = typeof tx.amount.toNumber === 'function' ? tx.amount.toNumber() : Number(tx.amount);
            const absAmount = Math.abs(amountNumber);
            if (tx.type === 'INCOME') {
                income += absAmount;
            } else if (tx.type === 'EXPENSE') {
                expenses += absAmount;
            }
        }

        const balance = income - expenses;

        return {
            income,
            expenses,
            balance,
        };
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
        if (updateTransactionDto.type === 'EXPENSE' && updateTransactionDto.paymentMethod === null) {
            throw new BadRequestException('Método de pagamento é obrigatório para despesas.');
        }

        const dataToUpdate: Prisma.TransactionUpdateInput = { ...updateTransactionDto };
        if (updateTransactionDto.date) {
            const parsedDate = parseSafeDate(updateTransactionDto.date);
            if (parsedDate) {
                dataToUpdate.date = parsedDate;
            } else {
                delete dataToUpdate.date;
            }
        }

        const updatedTx = await this.prisma.transaction.update({
            where: { id },
            data: dataToUpdate,
            include: {
                category: true,
                paidBy: true,
                wallet: true,
                family: true,
            },
        });

        // Emit asynchronously to RabbitMQ
        this.analyticsClient.emit('transaction.updated', updatedTx);

        return updatedTx;
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

        const deletedTx = await this.prisma.transaction.delete({ where: { id } });

        // Emit asynchronously to RabbitMQ
        this.analyticsClient.emit('transaction.deleted', { id: deletedTx.id });

        return deletedTx;
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

        const category = await this.prisma.category.create({
            data: {
                name: data.name,
                type: data.type,
                icon: data.icon || 'category',
                color: data.color || '#1A2D5A',
                familyId: finalFamilyId,
            },
        });

        // Emit asynchronously to RabbitMQ
        this.analyticsClient.emit('category.created', category);

        return category;
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

        const updatedCategory = await this.prisma.category.update({
            where: { id },
            data: {
                name: data.name,
                type: data.type,
                icon: data.icon,
                color: data.color,
            },
        });

        // Emit asynchronously to RabbitMQ
        this.analyticsClient.emit('category.updated', updatedCategory);

        return updatedCategory;
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

        const deletedCategory = await this.prisma.category.delete({
            where: { id },
        });

        // Emit asynchronously to RabbitMQ
        this.analyticsClient.emit('category.deleted', { id: deletedCategory.id });

        return deletedCategory;
    }
}
