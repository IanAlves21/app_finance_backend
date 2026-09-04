jest.mock('puppeteer', () => {
    return {
        launch: jest.fn().mockResolvedValue({
            newPage: jest.fn().mockResolvedValue({
                setContent: jest.fn().mockResolvedValue(undefined),
                pdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
                close: jest.fn().mockResolvedValue(undefined),
            }),
            close: jest.fn().mockResolvedValue(undefined),
        }),
    };
});

import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService, RichTransactionEvent } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType } from '@prisma/client';

describe('AnalyticsService', () => {
    let service: AnalyticsService;

    const mockPrismaService = {
        user: {
            findUnique: jest.fn(),
            create: jest.fn(),
            upsert: jest.fn(),
        },
        familyGroup: {
            findFirst: jest.fn(),
            create: jest.fn(),
            upsert: jest.fn(),
        },
        transaction: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            upsert: jest.fn(),
        },
        category: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            upsert: jest.fn(),
        },
        budget: {
            findMany: jest.fn(),
            upsert: jest.fn(),
            delete: jest.fn(),
        },
        wallet: {
            upsert: jest.fn(),
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AnalyticsService,
                { provide: PrismaService, useValue: mockPrismaService },
            ],
        }).compile();

        service = module.get<AnalyticsService>(AnalyticsService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('getMonthlySpending', () => {
        it('should get monthly spending and group it correctly for MONTHLY timeframe', async () => {
            const userId = 'user-1';
            const userEmail = 'test@example.com';
            const mockUser = { id: userId, email: userEmail, familyId: 'fam-1', name: 'Test' };
            const mockTransactions = [
                {
                    id: 'tx-1',
                    amount: 500,
                    type: 'INCOME',
                    date: new Date(),
                    categoryId: 'cat-income',
                    paidById: userId,
                    category: { id: 'cat-income', name: 'Salary', icon: 'briefcase', color: '#111' },
                    paidBy: { name: 'Test' },
                },
                {
                    id: 'tx-2',
                    amount: -150,
                    type: 'EXPENSE',
                    date: new Date(),
                    categoryId: 'cat-expense',
                    paidById: userId,
                    category: { id: 'cat-expense', name: 'Food', icon: 'shopping-cart', color: '#222' },
                    paidBy: { name: 'Test' },
                },
            ];

            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
            mockPrismaService.transaction.findMany.mockResolvedValue(mockTransactions);
            mockPrismaService.budget.findMany.mockResolvedValue([]);

            const result = await service.getMonthlySpending(userId, userEmail, 'Test', 6, 'MONTHLY');

            expect(result).toBeDefined();
            expect(mockPrismaService.transaction.findMany).toHaveBeenCalled();
        });

        it('should get yearly spending correctly', async () => {
            const userId = 'user-1';
            const userEmail = 'test@example.com';
            const mockUser = { id: userId, email: userEmail, familyId: 'fam-1', name: 'Test' };
            const mockTransactions = [
                {
                    id: 'tx-1',
                    amount: 1000,
                    type: 'INCOME',
                    date: new Date(),
                    categoryId: 'cat-income',
                    paidById: userId,
                    category: { id: 'cat-income', name: 'Salary', icon: 'briefcase', color: '#111' },
                    paidBy: { name: 'Test' },
                },
            ];

            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
            mockPrismaService.transaction.findMany.mockResolvedValue(mockTransactions);
            mockPrismaService.budget.findMany.mockResolvedValue([]);

            const result = await service.getMonthlySpending(userId, userEmail, 'Test', 6, 'YEARLY');
            expect(result).toBeDefined();
        });

        it('should get weekly spending correctly', async () => {
            const userId = 'user-1';
            const userEmail = 'test@example.com';
            const mockUser = { id: userId, email: userEmail, familyId: 'fam-1', name: 'Test' };
            const mockTransactions = [
                {
                    id: 'tx-1',
                    amount: -50,
                    type: 'EXPENSE',
                    date: new Date(),
                    categoryId: 'cat-expense',
                    paidById: userId,
                    category: { id: 'cat-expense', name: 'Food', icon: 'shopping-cart', color: '#222' },
                    paidBy: { name: 'Test' },
                },
            ];

            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
            mockPrismaService.transaction.findMany.mockResolvedValue(mockTransactions);
            mockPrismaService.budget.findMany.mockResolvedValue([]);

            const result = await service.getMonthlySpending(userId, userEmail, 'Test', 6, 'WEEKLY');
            expect(result).toBeDefined();
        });
    });

    describe('handleTransactionCreatedOrUpdated', () => {
        it('should upsert transaction successfully', async () => {
            const mockEvent: RichTransactionEvent = {
                id: 'tx-1',
                description: 'Supermarket',
                amount: -100 as any,
                type: 'EXPENSE',
                date: new Date(),
                categoryId: 'cat-1',
                paidById: 'user-1',
                walletId: 'wal-1',
                familyId: 'fam-1',
                category: { id: 'cat-1', name: 'Food', type: 'EXPENSE', icon: 'shopping-cart', color: '#222', familyId: null, createdById: null },
                paidBy: { id: 'user-1', email: 'test@example.com', name: 'User One', familyId: 'fam-1', avatarUrl: null },
                wallet: { id: 'wal-1', name: 'Wallet', balance: 0 as any, familyId: 'fam-1' },
                family: { id: 'fam-1', name: 'Family', createdAt: new Date() },
                note: null,
                status: 'COMPLETED' as any,
                paymentMethod: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrismaService.user.upsert.mockResolvedValue(mockEvent.paidBy);
            mockPrismaService.familyGroup.upsert.mockResolvedValue(mockEvent.family);
            mockPrismaService.category.upsert.mockResolvedValue(mockEvent.category);
            mockPrismaService.wallet.upsert.mockResolvedValue(mockEvent.wallet);
            mockPrismaService.transaction.upsert.mockResolvedValue(mockEvent);

            await service.handleTransactionCreatedOrUpdated(mockEvent);

            expect(mockPrismaService.transaction.upsert).toHaveBeenCalled();
        });
    });

    describe('handleTransactionDeleted', () => {
        it('should delete transaction from local database', async () => {
            mockPrismaService.transaction.delete.mockResolvedValue({ id: 'tx-1' });

            await service.handleTransactionDeleted('tx-1');

            expect(mockPrismaService.transaction.delete).toHaveBeenCalledWith({
                where: { id: 'tx-1' },
            });
        });
    });

    describe('syncCategory', () => {
        it('should upsert category successfully', async () => {
            const mockCategory = { id: 'cat-1', name: 'Food', type: TransactionType.EXPENSE, icon: 'shopping', color: '#333', familyId: null, createdById: null };
            mockPrismaService.category.upsert.mockResolvedValue(mockCategory);

            await service.syncCategory(mockCategory);

            expect(mockPrismaService.category.upsert).toHaveBeenCalled();
        });

        it('should return undefined if null category provided', async () => {
            const result = await service.syncCategory(null as any);
            expect(result).toBeUndefined();
        });
    });

    describe('generateReportPdf', () => {
        it('should generate a PDF report buffer successfully', async () => {
            const userId = 'user-1';
            const userEmail = 'test@example.com';
            const mockUser = { id: userId, email: userEmail, familyId: 'fam-1', name: 'Test' };
            const mockTransactions = [
                {
                    id: 'tx-1',
                    amount: 500,
                    type: 'INCOME',
                    date: new Date(),
                    categoryId: 'cat-income',
                    paidById: userId,
                    category: { id: 'cat-income', name: 'Salary', icon: 'briefcase', color: '#111' },
                    paidBy: { name: 'Test' },
                },
                {
                    id: 'tx-2',
                    amount: -150,
                    type: 'EXPENSE',
                    date: new Date(),
                    categoryId: 'cat-expense',
                    paidById: 'user-2',
                    category: { id: 'cat-expense', name: 'Food', icon: 'shopping-cart', color: '#222' },
                    paidBy: { name: 'User Two' },
                },
            ];

            const mockBudget = {
                id: 'b-1',
                amount: 300 as any,
                month: new Date().getMonth() + 1,
                year: new Date().getFullYear(),
                categoryId: 'cat-expense',
                familyId: 'fam-1',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
            mockPrismaService.transaction.findMany.mockResolvedValue(mockTransactions);
            mockPrismaService.budget.findMany.mockResolvedValue([mockBudget]);

            const result = await service.generateReportPdf(
                '2026-07-01',
                '2026-07-31',
                userId,
                userEmail,
                'Test',
                'pt',
            );

            expect(result).toBeDefined();
            expect(result).toBeInstanceOf(Buffer);
        });
    });

    describe('syncBudget', () => {
        it('should upsert budget', async () => {
            const mockBudget = { id: 'b-1', amount: 100 as any, month: 7, year: 2026, categoryId: 'cat-1', familyId: 'fam-1', createdAt: new Date(), updatedAt: new Date() };
            mockPrismaService.budget.upsert.mockResolvedValue(mockBudget);
            await service.syncBudget(mockBudget);
            expect(mockPrismaService.budget.upsert).toHaveBeenCalled();
        });

        it('should return undefined if no budget provided', async () => {
            const result = await service.syncBudget(null as any);
            expect(result).toBeUndefined();
        });
    });

    describe('deleteBudgetLocal', () => {
        it('should delete budget', async () => {
            mockPrismaService.budget.delete.mockResolvedValue({ id: 'b-1' });
            await service.deleteBudgetLocal('b-1');
            expect(mockPrismaService.budget.delete).toHaveBeenCalled();
        });
    });

    describe('deleteCategoryLocal', () => {
        it('should delete category', async () => {
            mockPrismaService.category.delete.mockResolvedValue({ id: 'cat-1' });
            await service.deleteCategoryLocal('cat-1');
            expect(mockPrismaService.category.delete).toHaveBeenCalled();
        });
    });

    describe('syncFamilyGroup', () => {
        it('should upsert family group', async () => {
            const mockFG = { id: 'fam-1', name: 'Family', createdAt: new Date() };
            mockPrismaService.familyGroup.upsert.mockResolvedValue(mockFG);
            await service.syncFamilyGroup(mockFG);
            expect(mockPrismaService.familyGroup.upsert).toHaveBeenCalled();
        });

        it('should return undefined if no family group provided', async () => {
            const result = await service.syncFamilyGroup(null as any);
            expect(result).toBeUndefined();
        });
    });

    describe('syncUser', () => {
        it('should upsert user', async () => {
            const mockUser = { id: 'u-1', name: 'User', email: 'test@example.com', avatarUrl: 'avatar', familyId: 'fam-1' };
            mockPrismaService.user.upsert.mockResolvedValue(mockUser);
            await service.syncUser(mockUser);
            expect(mockPrismaService.user.upsert).toHaveBeenCalled();
        });

        it('should return undefined if no user provided', async () => {
            const result = await service.syncUser(null as any);
            expect(result).toBeUndefined();
        });
    });

    describe('syncWallet', () => {
        it('should upsert wallet', async () => {
            const mockWallet = { id: 'w-1', name: 'Wallet', balance: 0 as any, familyId: 'fam-1' };
            mockPrismaService.wallet.upsert.mockResolvedValue(mockWallet);
            await service.syncWallet(mockWallet);
            expect(mockPrismaService.wallet.upsert).toHaveBeenCalled();
        });

        it('should return undefined if no wallet provided', async () => {
            const result = await service.syncWallet(null as any);
            expect(result).toBeUndefined();
        });
    });
});
