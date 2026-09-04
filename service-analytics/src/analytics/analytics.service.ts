import { Injectable } from '@nestjs/common';
import { Transaction, Category, User, Wallet, FamilyGroup, Budget } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer';

export type RichTransactionEvent = Transaction & {
    category: Category;
    paidBy: User;
    wallet: Wallet;
    family: FamilyGroup;
};

export interface CategorySpending {
    id: string;
    name: string;
    icon: string;
    color: string;
    amount: number;
    percentage?: number;
    budgetAmount?: number | null;
}

export interface UserSpending {
    id: string;
    name: string;
    amount: number;
    percentage?: number;
}

export interface SpendingInterval {
    year: number;
    month?: number;
    day?: number;
    income: number;
    expense: number;
    categories: Record<string, CategorySpending>;
    byUser: Record<string, UserSpending>;
}

@Injectable()
export class AnalyticsService {
    constructor(private readonly prisma: PrismaService) {}

    private async getOrCreateUser(userId: string, userEmail: string, userName?: string) {
        const decodedName = userName ? decodeURIComponent(userName) : 'Usuário';

        let user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            user = await this.prisma.user.findUnique({
                where: { email: userEmail },
            });

            if (user) {
                return user;
            }

            // Cria um FamilyGroup exclusivo e isolado para este novo usuário
            const family = await this.prisma.familyGroup.create({
                data: { name: `${decodedName} & Família` },
            });

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

        let maxDate = new Date(now);
        for (const tx of transactions) {
            const txDate = new Date(tx.date);
            if (txDate > maxDate) {
                maxDate = txDate;
            }
        }

        const dataMap: Record<string, SpendingInterval> = {};

        if (timeframe === 'YEARLY') {
            const currentYear = now.getFullYear();
            const extraYears = maxDate.getFullYear() - currentYear;
            for (let i = limitNumber - 1; i >= -extraYears; i--) {
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
                    const amountNumber =
                        typeof tx.amount.toNumber === 'function' ? tx.amount.toNumber() : Number(tx.amount);
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
            const maxWeekStart = new Date(
                maxDate.getFullYear(),
                maxDate.getMonth(),
                maxDate.getDate() - maxDate.getDay(),
            );
            const extraWeeks = Math.max(
                0,
                Math.ceil((maxWeekStart.getTime() - currentWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)),
            );

            for (let i = limitNumber - 1; i >= -extraWeeks; i--) {
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
                const txWeekStart = new Date(
                    txDate.getFullYear(),
                    txDate.getMonth(),
                    txDate.getDate() - txDate.getDay(),
                );
                const key = `${txWeekStart.getFullYear()}-${txWeekStart.getMonth() + 1}-${txWeekStart.getDate()}`;
                if (dataMap[key]) {
                    const amountNumber =
                        typeof tx.amount.toNumber === 'function' ? tx.amount.toNumber() : Number(tx.amount);
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
            const extraMonths =
                (maxDate.getFullYear() - now.getFullYear()) * 12 + (maxDate.getMonth() - now.getMonth());
            for (let i = limitNumber - 1; i >= -extraMonths; i--) {
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
                    const amountNumber =
                        typeof tx.amount.toNumber === 'function' ? tx.amount.toNumber() : Number(tx.amount);
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

        // Buscar todos os limites de orçamento (Budgets) cadastrados para essa família
        const budgets = whereClause.familyId
            ? await this.prisma.budget.findMany({
                  where: { familyId: whereClause.familyId as string },
              })
            : [];

        return Object.values(dataMap).map((interval) => {
            const totalExpense = interval.expense;

            const categoryList = Object.values(interval.categories);
            for (const cat of categoryList) {
                cat.percentage = totalExpense > 0 ? cat.amount / totalExpense : 0;

                // Filtra os orçamentos criados para essa categoria específica
                const catBudgets = budgets
                    .filter((b) => b.categoryId === cat.id)
                    .map((b) => ({
                        amount: typeof b.amount.toNumber === 'function' ? b.amount.toNumber() : Number(b.amount),
                        month: b.month,
                        year: b.year,
                        score: b.year * 12 + b.month,
                    }));

                if (catBudgets.length === 0) {
                    cat.budgetAmount = null;
                } else {
                    const currentScore = interval.year * 12 + (interval.month || 0);

                    // 1. Tenta achar uma correspondência exata para o mês e ano do intervalo
                    const exactMatch = catBudgets.find((b) => b.month === interval.month && b.year === interval.year);

                    if (exactMatch) {
                        cat.budgetAmount = exactMatch.amount;
                    } else {
                        // 2. Busca o orçamento mais recente definido até (ou antes) do intervalo atual
                        const priorBudgets = catBudgets
                            .filter((b) => b.score <= currentScore)
                            .sort((a, b) => b.score - a.score);

                        if (priorBudgets.length > 0) {
                            cat.budgetAmount = priorBudgets[0].amount;
                        } else {
                            // 3. Caso não haja orçamentos anteriores, usa o orçamento mais antigo definido (como default global)
                            const sortedBudgets = [...catBudgets].sort((a, b) => a.score - b.score);
                            cat.budgetAmount = sortedBudgets[0].amount;
                        }
                    }
                }
            }
            categoryList.sort((a, b) => b.amount - a.amount);

            const userList = Object.values(interval.byUser);
            for (const u of userList) {
                u.percentage = totalExpense > 0 ? u.amount / totalExpense : 0;
            }
            userList.sort((a, b) => b.amount - a.amount);

            return {
                ...interval,
                categories: categoryList,
                byUser: userList,
            };
        });
    }

    async generateReportPdf(
        startDateStr: string,
        endDateStr: string,
        userId?: string,
        userEmail?: string,
        userName?: string,
        acceptLanguage?: string,
    ): Promise<Buffer> {
        const decodedUserName = userName ? decodeURIComponent(userName) : undefined;
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

        const start = new Date(startDateStr);
        start.setUTCHours(0, 0, 0, 0);

        const end = new Date(endDateStr);
        end.setUTCHours(23, 59, 59, 999);

        whereClause.date = {
            gte: start,
            lte: end,
        };

        const transactions = await this.prisma.transaction.findMany({
            where: whereClause,
            include: {
                category: true,
                paidBy: true,
            },
            orderBy: {
                date: 'desc',
            },
        });

        // 1. Cálculos de macro métricas
        let totalIncome = 0;
        let totalExpense = 0;
        const categoryMap: Record<string, { name: string; amount: number; color: string; icon: string }> = {};
        const userMap: Record<string, { name: string; amount: number }> = {};

        for (const tx of transactions) {
            const amountNumber = typeof tx.amount.toNumber === 'function' ? tx.amount.toNumber() : Number(tx.amount);
            const absAmount = Math.abs(amountNumber);

            if (tx.type === 'INCOME') {
                totalIncome += absAmount;
            } else if (tx.type === 'EXPENSE') {
                totalExpense += absAmount;

                // Agrupamento por Categoria
                if (!categoryMap[tx.categoryId]) {
                    categoryMap[tx.categoryId] = {
                        name: tx.category.name,
                        amount: 0,
                        color: tx.category.color || '#1A2D5A',
                        icon: tx.category.icon || 'category',
                    };
                }
                categoryMap[tx.categoryId].amount += absAmount;

                // Agrupamento por Usuário
                if (!userMap[tx.paidById]) {
                    userMap[tx.paidById] = {
                        name: tx.paidBy.name,
                        amount: 0,
                    };
                }
                userMap[tx.paidById].amount += absAmount;
            }
        }

        const netSavings = totalIncome - totalExpense;

        // Buscar todos os orçamentos (Budgets) para poder mapear limites e fallbacks
        const budgets = whereClause.familyId
            ? await this.prisma.budget.findMany({
                  where: { familyId: whereClause.familyId as string },
              })
            : [];

        // Monta a lista de categorias formatadas com porcentagens e limites
        const categoriesList = Object.keys(categoryMap)
            .map((catId) => {
                const cat = categoryMap[catId];
                const percentageOfTotal = totalExpense > 0 ? cat.amount / totalExpense : 0;

                // Encontra limite de orçamento (fallback semelhante ao getMonthlySpending)
                const catBudgets = budgets
                    .filter((b) => b.categoryId === catId)
                    .map((b) => ({
                        amount: typeof b.amount.toNumber === 'function' ? b.amount.toNumber() : Number(b.amount),
                        month: b.month,
                        year: b.year,
                        score: b.year * 12 + b.month,
                    }));

                let budgetAmount: number | null = null;
                if (catBudgets.length > 0) {
                    const currentScore = end.getFullYear() * 12 + (end.getMonth() + 1);
                    const exactMatch = catBudgets.find(
                        (b) => b.month === end.getMonth() + 1 && b.year === end.getFullYear(),
                    );
                    if (exactMatch) {
                        budgetAmount = exactMatch.amount;
                    } else {
                        const priorBudgets = catBudgets
                            .filter((b) => b.score <= currentScore)
                            .sort((a, b) => b.score - a.score);
                        if (priorBudgets.length > 0) {
                            budgetAmount = priorBudgets[0].amount;
                        } else {
                            const sortedBudgets = [...catBudgets].sort((a, b) => a.score - b.score);
                            budgetAmount = sortedBudgets[0].amount;
                        }
                    }
                }

                return {
                    id: catId,
                    name: cat.name,
                    amount: cat.amount,
                    color: cat.color,
                    icon: cat.icon,
                    percentageOfTotal: percentageOfTotal * 100,
                    budgetAmount,
                    budgetUsage: budgetAmount && budgetAmount > 0 ? (cat.amount / budgetAmount) * 100 : null,
                };
            })
            .sort((a, b) => b.amount - a.amount);

        // Monta a lista de usuários com percentual de gastos
        const usersList = Object.keys(userMap)
            .map((uId) => {
                const u = userMap[uId];
                return {
                    name: u.name,
                    amount: u.amount,
                    percentage: totalExpense > 0 ? (u.amount / totalExpense) * 100 : 0,
                };
            })
            .sort((a, b) => b.amount - a.amount);

        // 2. Criação do HTML Template
        const formatDate = (d: Date) => {
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        };

        const formatCurrency = (val: number) => {
            const sign = val < 0 ? '-' : '';
            return `${sign}R$ ${Math.abs(val)
                .toFixed(2)
                .replace('.', ',')
                .replace(/\d(?=(\d{3})+,)/g, '$&.')}`;
        };

        const isEnglish = acceptLanguage?.toLowerCase().includes('en') || false;
        const templateFileName = isEnglish ? 'report_en.html' : 'report.html';

        let templatePath = path.join(__dirname, templateFileName);
        if (!fs.existsSync(templatePath)) {
            // Fallback for compiled NestJS root mismatch (dist/src/analytics vs dist/analytics)
            templatePath = path.join(__dirname, `../../analytics/${templateFileName}`);
        }
        if (!fs.existsSync(templatePath)) {
            // Ultimate fallback to source path
            templatePath = path.join(__dirname, `../../../src/analytics/${templateFileName}`);
        }
        let htmlContent = fs.readFileSync(templatePath, 'utf8');

        const categoriesRows = categoriesList
            .map(
                (cat, idx) => `
            <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
                <td style="font-weight: bold; color: #0f172a; vertical-align: middle; white-space: nowrap;"><span class="material-icons" style="font-size: 16px; color: ${cat.color || '#3b82f6'}; margin-right: 6px; vertical-align: middle;">${this.getMaterialIconName(cat.icon)}</span><span style="vertical-align: middle;">${cat.name}</span></td>
                <td style="font-weight: bold; color: #0f172a; text-align: right; vertical-align: middle; white-space: nowrap;">${formatCurrency(cat.amount)}</td>
                <td style="text-align: right; color: ${cat.budgetUsage && cat.budgetUsage > 100 ? '#ef4444' : '#64748b'}; font-weight: ${cat.budgetUsage && cat.budgetUsage > 100 ? 'bold' : 'normal'}; vertical-align: middle; white-space: nowrap;">
                    ${cat.budgetAmount && cat.budgetUsage !== null && cat.budgetUsage !== undefined ? `${cat.budgetUsage.toFixed(0)}% de ${formatCurrency(cat.budgetAmount)}` : `${cat.percentageOfTotal.toFixed(0)}% do total`}
                </td>
            </tr>
        `,
            )
            .join('');

        const usersRows = usersList
            .map(
                (u, idx) => `
            <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
                <td style="font-weight: bold; color: #0f172a; vertical-align: middle; white-space: nowrap;">${u.name}</td>
                <td style="font-weight: bold; color: #0f172a; text-align: right; vertical-align: middle; white-space: nowrap;">${formatCurrency(u.amount)}</td>
                <td style="font-weight: bold; color: #3b82f6; text-align: right; vertical-align: middle; white-space: nowrap;">
                    <div style="width: 30px; background-color: #e2e8f0; height: 4px; border-radius: 10px; display: inline-block; vertical-align: middle; margin-right: 6px; overflow: hidden;">
                        <div style="width: ${u.percentage.toFixed(0)}%; background-color: #3b82f6; height: 100%; border-radius: 10px;"></div>
                    </div>
                    <span style="vertical-align: middle;">${u.percentage.toFixed(0)}%</span>
                </td>
            </tr>
        `,
            )
            .join('');

        const transactionsRows = transactions
            .map((tx, idx) => {
                const amountNumber =
                    typeof tx.amount.toNumber === 'function' ? tx.amount.toNumber() : Number(tx.amount);
                const isIncome = tx.type === 'INCOME';
                const absAmount = Math.abs(amountNumber);
                const trClass = isIncome ? 'receita' : 'despesa';
                const sign = isIncome ? '+' : '-';
                return `
                <tr class="${trClass}" style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
                    <td style="color: #475569; vertical-align: middle; white-space: nowrap;">${formatDate(new Date(tx.date))}</td>
                    <td style="vertical-align: middle; color: #0f172a;">
                        <strong>${tx.description}</strong>
                        ${tx.note ? `<br><small style="color: #64748b; font-size: 10px; font-weight: normal;">${tx.note}</small>` : ''}
                    </td>
                    <td style="color: #475569; vertical-align: middle; white-space: nowrap;"><span class="material-icons" style="font-size: 16px; color: ${tx.category.color || '#3b82f6'}; margin-right: 6px; vertical-align: middle;">${this.getMaterialIconName(tx.category.icon)}</span><span style="vertical-align: middle;">${tx.category.name}</span></td>
                    <td style="color: #475569; vertical-align: middle; white-space: nowrap;">${tx.paidBy.name}</td>
                    <td class="valor" style="vertical-align: middle; white-space: nowrap;">
                        ${sign} ${formatCurrency(absAmount)}
                    </td>
                </tr>
            `;
            })
            .join('');

        htmlContent = htmlContent
            .replace('{{userName}}', decodedUserName || 'Ian Gustavo')
            .replace('{{startDate}}', formatDate(start))
            .replace('{{endDate}}', formatDate(end))
            .replace('{{emissaoDate}}', formatDate(new Date()))
            .replace(
                '{{emissaoTime}}',
                `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
            )
            .replace('{{totalIncome}}', formatCurrency(totalIncome))
            .replace('{{totalExpense}}', formatCurrency(totalExpense))
            .replace('{{netSavings}}', formatCurrency(netSavings))
            .replace('{{categoriesRows}}', categoriesRows)
            .replace('{{usersRows}}', usersRows)
            .replace('{{transactionsRows}}', transactionsRows)
            .replace('{{reportId}}', String(Math.floor(100000 + Math.random() * 900000)));

        // 3. Conversão de HTML para PDF via Puppeteer (Pixel-Perfect)
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
        try {
            const page = await browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'load' });

            const pdfBuffer = Buffer.from(
                await page.pdf({
                    format: 'A4',
                    printBackground: true,
                    margin: {
                        top: '40px',
                        bottom: '40px',
                        left: '40px',
                        right: '40px',
                    },
                }),
            );

            await browser.close();
            return pdfBuffer;
        } catch (err: unknown) {
            await browser.close();
            throw err instanceof Error ? err : new Error(String(err));
        }
    }

    // -------------------------------------------------------------------------
    // EVENT-DRIVEN DATABASE SYNCHRONIZATION (CQRS)
    // -------------------------------------------------------------------------

    async syncBudget(budget: Budget) {
        if (!budget) return;
        return this.prisma.budget.upsert({
            where: { id: budget.id },
            update: {
                amount: budget.amount,
                month: budget.month,
                year: budget.year,
                categoryId: budget.categoryId,
                familyId: budget.familyId,
            },
            create: {
                id: budget.id,
                amount: budget.amount,
                month: budget.month,
                year: budget.year,
                categoryId: budget.categoryId,
                familyId: budget.familyId,
            },
        });
    }

    async deleteBudgetLocal(id: string) {
        return this.prisma.budget
            .delete({
                where: { id },
            })
            .catch(() => null);
    }

    async syncCategory(category: Category) {
        if (!category) return;
        return this.prisma.category.upsert({
            where: { id: category.id },
            update: {
                name: category.name,
                type: category.type,
                icon: category.icon,
                color: category.color,
                familyId: category.familyId,
            },
            create: {
                id: category.id,
                name: category.name,
                type: category.type,
                icon: category.icon,
                color: category.color,
                familyId: category.familyId,
            },
        });
    }

    async deleteCategoryLocal(id: string) {
        return this.prisma.category
            .delete({
                where: { id },
            })
            .catch(() => null);
    }

    async syncFamilyGroup(family: FamilyGroup) {
        if (!family) return;
        return this.prisma.familyGroup.upsert({
            where: { id: family.id },
            update: { name: family.name },
            create: { id: family.id, name: family.name },
        });
    }

    async syncUser(user: User) {
        if (!user) return;
        return this.prisma.user.upsert({
            where: { id: user.id },
            update: {
                name: user.name,
                email: user.email,
                avatarUrl: user.avatarUrl,
                familyId: user.familyId,
            },
            create: {
                id: user.id,
                name: user.name,
                email: user.email,
                avatarUrl: user.avatarUrl,
                familyId: user.familyId,
            },
        });
    }

    async syncWallet(wallet: Wallet) {
        if (!wallet) return;
        return this.prisma.wallet.upsert({
            where: { id: wallet.id },
            update: {
                name: wallet.name,
                balance: wallet.balance,
                familyId: wallet.familyId,
            },
            create: {
                id: wallet.id,
                name: wallet.name,
                balance: wallet.balance,
                familyId: wallet.familyId,
            },
        });
    }

    async handleTransactionCreatedOrUpdated(tx: RichTransactionEvent) {
        // Sync relations sequentially
        await this.syncFamilyGroup(tx.family);
        await this.syncCategory(tx.category);
        await this.syncUser(tx.paidBy);
        await this.syncWallet(tx.wallet);

        // Upsert the main transaction record
        return this.prisma.transaction.upsert({
            where: { id: tx.id },
            update: {
                description: tx.description,
                note: tx.note,
                amount: tx.amount,
                date: tx.date,
                type: tx.type,
                status: tx.status,
                paymentMethod: tx.paymentMethod,
                categoryId: tx.categoryId,
                walletId: tx.walletId,
                paidById: tx.paidById,
                familyId: tx.familyId,
            },
            create: {
                id: tx.id,
                description: tx.description,
                note: tx.note,
                amount: tx.amount,
                date: tx.date,
                type: tx.type,
                status: tx.status,
                paymentMethod: tx.paymentMethod,
                categoryId: tx.categoryId,
                walletId: tx.walletId,
                paidById: tx.paidById,
                familyId: tx.familyId,
            },
        });
    }

    async handleTransactionDeleted(id: string) {
        return this.prisma.transaction
            .delete({
                where: { id },
            })
            .catch(() => null);
    }

    private getMaterialIconName(iconName: string | null | undefined): string {
        switch (iconName?.toLowerCase()) {
            case 'briefcase':
            case 'savings':
                return 'savings';
            case 'shopping-cart':
            case 'food':
                return 'shopping_cart';
            case 'restaurant':
            case 'dining':
                return 'restaurant';
            case 'directions-car':
            case 'transport':
                return 'directions_car';
            case 'money':
            case 'monetization-on':
                return 'monetization_on';
            case 'subscriptions':
            case 'streaming':
                return 'subscriptions';
            case 'home':
            case 'rent':
                return 'home';
            case 'medical':
            case 'health':
                return 'medical_services';
            case 'school':
            case 'education':
                return 'school';
            case 'pets':
            case 'pet':
                return 'pets';
            default:
                return 'category';
        }
    }

    async mergeFamilyLocal(oldFamilyId: string, targetFamilyId: string, userId: string) {
        await this.prisma.$transaction([
            this.prisma.category.updateMany({
                where: { familyId: oldFamilyId },
                data: { familyId: targetFamilyId },
            }),
            this.prisma.wallet.updateMany({
                where: { familyId: oldFamilyId },
                data: { familyId: targetFamilyId },
            }),
            this.prisma.budget.updateMany({
                where: { familyId: oldFamilyId },
                data: { familyId: targetFamilyId },
            }),
            this.prisma.transaction.updateMany({
                where: { familyId: oldFamilyId },
                data: { familyId: targetFamilyId },
            }),
            this.prisma.user.updateMany({
                where: { id: userId },
                data: { familyId: targetFamilyId },
            }),
        ]);

        const remainingUsers = await this.prisma.user.count({
            where: { familyId: oldFamilyId },
        });

        if (remainingUsers === 0) {
            await this.prisma.familyGroup.delete({
                where: { id: oldFamilyId },
            }).catch(() => null);
        }
    }

    async userLeftGroupLocal(
        userId: string,
        userName: string,
        userEmail: string,
        userAvatarUrl: string | null,
        newFamilyId: string,
        newFamilyName: string
    ) {
        await this.prisma.familyGroup.upsert({
            where: { id: newFamilyId },
            update: { name: newFamilyName },
            create: { id: newFamilyId, name: newFamilyName },
        });

        await this.prisma.user.upsert({
            where: { id: userId },
            update: {
                familyId: newFamilyId,
            },
            create: {
                id: userId,
                name: userName,
                email: userEmail,
                avatarUrl: userAvatarUrl,
                familyId: newFamilyId,
            },
        });

        // Atualiza todas as transações pagas por este usuário para o novo grupo familiar no banco de Analytics
        await this.prisma.transaction.updateMany({
            where: { paidById: userId },
            data: { familyId: newFamilyId },
        });

        // Atualiza todas as categorias criadas por este usuário para o novo grupo familiar no banco de Analytics
        await this.prisma.category.updateMany({
            where: { createdById: userId },
            data: { familyId: newFamilyId },
        });
    }
}
