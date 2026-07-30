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
                date: parseSafeDate(createTransactionDto.date) || new Date(),
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
        const dataToUpdate: Prisma.TransactionUpdateInput = { ...updateTransactionDto };
        if (updateTransactionDto.date) {
            const parsedDate = parseSafeDate(updateTransactionDto.date);
            if (parsedDate) {
                dataToUpdate.date = parsedDate;
            } else {
                delete dataToUpdate.date;
            }
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

    async getMonthlySpending(
        userId?: string,
        userEmail?: string,
        userName?: string,
        limitNumber = 6,
        timeframe = 'MONTHLY',
    ) {
        const whereClause: Record<string, any> = {};

        if (userId && userEmail) {
            const dbUser = await this.getOrCreateUser(userId, userEmail, userName);
            whereClause.familyId = dbUser.familyId;
        } else {
            const family = await this.prisma.familyGroup.findFirst();
            if (family) {
                whereClause.familyId = family.id;
            }
        }

        const now = new Date();
        let startDate: Date;

        if (timeframe === 'YEARLY') {
            startDate = new Date(now.getFullYear() - limitNumber + 1, 0, 1);
        } else if (timeframe === 'WEEKLY') {
            const currentWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
            startDate = new Date(currentWeekStart.getTime() - (limitNumber - 1) * 7 * 24 * 60 * 60 * 1000);
        } else {
            startDate = new Date(now.getFullYear(), now.getMonth() - limitNumber + 1, 1);
        }

        whereClause.date = {
            gte: startDate,
        };

        const transactions = await this.prisma.transaction.findMany({
            where: whereClause,
            include: {
                category: true,
                paidBy: true,
            },
        });

        const dataMap: Record<string, { year: number; month?: number; day?: number; income: number; expense: number; categories: any; byUser: any }> = {};

        if (timeframe === 'YEARLY') {
            const currentYear = now.getFullYear();
            for (let i = limitNumber - 1; i >= 0; i--) {
                const y = currentYear - i;
                dataMap[String(y)] = {
                    year: y,
                    income: 0,
                    expense: 0,
                    categories: {},
                    byUser: {},
                };
            }

            for (const tx of transactions) {
                const txDate = new Date(tx.date);
                const key = String(txDate.getFullYear());
                if (dataMap[key]) {
                    const amountNumber = typeof tx.amount.toNumber === 'function' ? tx.amount.toNumber() : Number(tx.amount);
                    const absAmount = Math.abs(amountNumber);
                    if (tx.type === 'INCOME') {
                        dataMap[key].income += absAmount;
                    } else if (tx.type === 'EXPENSE') {
                        dataMap[key].expense += absAmount;

                        const catId = tx.categoryId;
                        if (!dataMap[key].categories[catId]) {
                            dataMap[key].categories[catId] = {
                                id: catId,
                                name: tx.category.name,
                                icon: tx.category.icon || 'category',
                                color: tx.category.color || '#1A2D5A',
                                amount: 0,
                            };
                        }
                        dataMap[key].categories[catId].amount += absAmount;

                        const userId = tx.paidById;
                        if (!dataMap[key].byUser[userId]) {
                            dataMap[key].byUser[userId] = {
                                id: userId,
                                name: tx.paidBy.name,
                                amount: 0,
                            };
                        }
                        dataMap[key].byUser[userId].amount += absAmount;
                    }
                }
            }
        } else if (timeframe === 'WEEKLY') {
            const currentWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
            for (let i = limitNumber - 1; i >= 0; i--) {
                const d = new Date(currentWeekStart.getTime() - i * 7 * 24 * 60 * 60 * 1000);
                const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
                dataMap[key] = {
                    year: d.getFullYear(),
                    month: d.getMonth() + 1,
                    day: d.getDate(),
                    income: 0,
                    expense: 0,
                    categories: {},
                    byUser: {},
                };
            }

            for (const tx of transactions) {
                const txDate = new Date(tx.date);
                const txWeekStart = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate() - txDate.getDay());
                const key = `${txWeekStart.getFullYear()}-${txWeekStart.getMonth() + 1}-${txWeekStart.getDate()}`;
                if (dataMap[key]) {
                    const amountNumber = typeof tx.amount.toNumber === 'function' ? tx.amount.toNumber() : Number(tx.amount);
                    const absAmount = Math.abs(amountNumber);
                    if (tx.type === 'INCOME') {
                        dataMap[key].income += absAmount;
                    } else if (tx.type === 'EXPENSE') {
                        dataMap[key].expense += absAmount;

                        const catId = tx.categoryId;
                        if (!dataMap[key].categories[catId]) {
                            dataMap[key].categories[catId] = {
                                id: catId,
                                name: tx.category.name,
                                icon: tx.category.icon || 'category',
                                color: tx.category.color || '#1A2D5A',
                                amount: 0,
                            };
                        }
                        dataMap[key].categories[catId].amount += absAmount;

                        const userId = tx.paidById;
                        if (!dataMap[key].byUser[userId]) {
                            dataMap[key].byUser[userId] = {
                                id: userId,
                                name: tx.paidBy.name,
                                amount: 0,
                            };
                        }
                        dataMap[key].byUser[userId].amount += absAmount;
                    }
                }
            }
        } else {
            for (let i = limitNumber - 1; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                dataMap[key] = {
                    year: d.getFullYear(),
                    month: d.getMonth() + 1,
                    income: 0,
                    expense: 0,
                    categories: {},
                    byUser: {},
                };
            }

            for (const tx of transactions) {
                const txDate = new Date(tx.date);
                const key = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
                if (dataMap[key]) {
                    const amountNumber = typeof tx.amount.toNumber === 'function' ? tx.amount.toNumber() : Number(tx.amount);
                    const absAmount = Math.abs(amountNumber);
                    if (tx.type === 'INCOME') {
                        dataMap[key].income += absAmount;
                    } else if (tx.type === 'EXPENSE') {
                        dataMap[key].expense += absAmount;

                        const catId = tx.categoryId;
                        if (!dataMap[key].categories[catId]) {
                            dataMap[key].categories[catId] = {
                                id: catId,
                                name: tx.category.name,
                                icon: tx.category.icon || 'category',
                                color: tx.category.color || '#1A2D5A',
                                amount: 0,
                            };
                        }
                        dataMap[key].categories[catId].amount += absAmount;

                        const userId = tx.paidById;
                        if (!dataMap[key].byUser[userId]) {
                            dataMap[key].byUser[userId] = {
                                id: userId,
                                name: tx.paidBy.name,
                                amount: 0,
                            };
                        }
                        dataMap[key].byUser[userId].amount += absAmount;
                    }
                }
            }
        }

        // Calculate percentages and convert categories/users maps to sorted lists
        for (const key of Object.keys(dataMap)) {
            const interval = dataMap[key];
            const totalExpense = interval.expense;
            
            // Categories
            const categoryList: any[] = Object.values(interval.categories);
            for (const cat of categoryList) {
                cat.percentage = totalExpense > 0 ? cat.amount / totalExpense : 0;
            }
            categoryList.sort((a, b) => b.amount - a.amount);
            interval.categories = categoryList;

            // Users
            const userList: any[] = Object.values(interval.byUser);
            for (const u of userList) {
                u.percentage = totalExpense > 0 ? u.amount / totalExpense : 0;
            }
            userList.sort((a, b) => b.amount - a.amount);
            interval.byUser = userList;
        }

        return Object.values(dataMap);
    }
}
