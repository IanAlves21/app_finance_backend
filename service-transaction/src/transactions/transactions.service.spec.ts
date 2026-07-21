import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType } from '@prisma/client';

describe('TransactionsService', () => {
    let service: TransactionsService;

    const mockPrismaService = {
        transaction: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
        },
        user: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
        familyGroup: {
            findFirst: jest.fn(),
            create: jest.fn(),
        },
        category: {
            findFirst: jest.fn(),
            create: jest.fn(),
        },
        wallet: {
            findFirst: jest.fn(),
            create: jest.fn(),
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [TransactionsService, { provide: PrismaService, useValue: mockPrismaService }],
        }).compile();

        service = module.get<TransactionsService>(TransactionsService);

        // Limpa os mocks antes de cada teste
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('findAll', () => {
        it('should return all transactions when no userId is provided (fallback)', async () => {
            const mockTransactions = [
                { id: '1', description: 'T1', paidById: 'user-1' },
                { id: '2', description: 'T2', paidById: 'user-2' },
            ];
            mockPrismaService.transaction.findMany.mockResolvedValue(mockTransactions);

            const result = await service.findAll();

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith({
                orderBy: { date: 'desc' },
                include: {
                    category: true,
                    wallet: true,
                    paidBy: true,
                },
            });
            expect(result).toEqual(mockTransactions);
        });

        it('should return user-specific transactions when userId and userEmail are provided', async () => {
            const userId = 'user-123';
            const userEmail = 'user@test.com';
            const userName = 'User One';
            const mockUser = { id: userId, email: userEmail, name: userName, familyId: 'fam-123' };
            const mockTransactions = [{ id: '1', description: 'T1', paidById: userId }];

            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
            mockPrismaService.transaction.findMany.mockResolvedValue(mockTransactions);

            const result = await service.findAll(userId, userEmail, userName);

            expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({ where: { id: userId } });
            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith({
                where: { paidById: userId },
                orderBy: { date: 'desc' },
                include: {
                    category: true,
                    wallet: true,
                    paidBy: true,
                },
            });
            expect(result).toEqual(mockTransactions);
        });

        it('should paginate transactions when page and limit are provided', async () => {
            const userId = 'user-123';
            const userEmail = 'user@test.com';
            const userName = 'User One';
            const mockUser = { id: userId, email: userEmail, name: userName, familyId: 'fam-123' };

            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
            mockPrismaService.transaction.findMany.mockResolvedValue([]);

            await service.findAll(userId, userEmail, userName, 2, 10);

            expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith({
                where: { paidById: userId },
                orderBy: { date: 'desc' },
                skip: 10,
                take: 10,
                include: {
                    category: true,
                    wallet: true,
                    paidBy: true,
                },
            });
        });

        it('should create user and default family group if user does not exist in transactions db', async () => {
            const userId = 'user-new';
            const userEmail = 'new@test.com';
            const userName = 'New User';
            const mockFamily = { id: 'fam-new', name: 'New User & Família' };
            const mockUser = { id: userId, email: userEmail, name: userName, familyId: 'fam-new' };

            mockPrismaService.user.findUnique.mockResolvedValue(null);
            mockPrismaService.familyGroup.findFirst.mockResolvedValue(null);
            mockPrismaService.familyGroup.create.mockResolvedValue(mockFamily);
            mockPrismaService.user.create.mockResolvedValue(mockUser);
            mockPrismaService.transaction.findMany.mockResolvedValue([]);

            await service.findAll(userId, userEmail, userName);

            expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({ where: { id: userId } });
            expect(mockPrismaService.familyGroup.findFirst).toHaveBeenCalled();
            expect(mockPrismaService.familyGroup.create).toHaveBeenCalledWith({
                data: { name: 'New User & Família' },
            });
            expect(mockPrismaService.user.create).toHaveBeenCalledWith({
                data: {
                    id: userId,
                    email: userEmail,
                    name: 'New User',
                    familyId: 'fam-new',
                },
            });
        });
    });

    describe('create', () => {
        it('should create transaction with user-specific IDs and dynamically resolved wallet/category', async () => {
            const userId = 'user-123';
            const userEmail = 'user@test.com';
            const userName = 'User One';
            const mockUser = { id: userId, email: userEmail, name: userName, familyId: 'fam-123' };
            const mockCategory = { id: 'cat-123', type: TransactionType.EXPENSE };
            const mockWallet = { id: 'wal-123', familyId: 'fam-123' };
            const createDto = {
                description: 'Supermarket',
                amount: 150,
                type: TransactionType.EXPENSE,
                date: '2026-07-15',
            };

            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
            mockPrismaService.category.findFirst.mockResolvedValue(mockCategory);
            mockPrismaService.wallet.findFirst.mockResolvedValue(mockWallet);
            mockPrismaService.transaction.create.mockResolvedValue({ id: 'tx-123', ...createDto });

            const result = await service.create(createDto, userId, userEmail, userName);

            expect(mockPrismaService.transaction.create).toHaveBeenCalledWith({
                data: {
                    description: 'Supermarket',
                    amount: 150,
                    type: TransactionType.EXPENSE,
                    date: new Date('2026-07-15'),
                    familyId: 'fam-123',
                    paidById: userId,
                    walletId: 'wal-123',
                    categoryId: 'cat-123',
                },
            });
            expect(result).toBeDefined();
        });
    });

    describe('update', () => {
        it('should update a transaction and format date if provided', async () => {
            const updateDto = {
                description: 'Updated Description',
                date: '2026-07-16',
            };
            mockPrismaService.transaction.update = jest.fn().mockResolvedValue({ id: 'tx-123', ...updateDto });

            const result = await service.update('tx-123', updateDto);

            expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
                where: { id: 'tx-123' },
                data: {
                    description: 'Updated Description',
                    date: new Date('2026-07-16'),
                },
            });
            expect(result).toBeDefined();
        });
    });

    describe('remove', () => {
        it('should delete the transaction if no user credentials are provided (local development fallback)', async () => {
            const mockTx = { id: 'tx-123', paidById: 'user-123' };
            mockPrismaService.transaction.findUnique.mockResolvedValue(mockTx);
            mockPrismaService.transaction.delete.mockResolvedValue(mockTx);

            const result = await service.remove('tx-123');

            expect(mockPrismaService.transaction.findUnique).toHaveBeenCalledWith({ where: { id: 'tx-123' } });
            expect(mockPrismaService.transaction.delete).toHaveBeenCalledWith({ where: { id: 'tx-123' } });
            expect(result).toEqual(mockTx);
        });

        it('should throw NotFoundException if transaction does not exist', async () => {
            mockPrismaService.transaction.findUnique.mockResolvedValue(null);

            await expect(service.remove('tx-nonexistent')).rejects.toThrow('Transação não encontrada');
        });

        it('should delete the transaction if user is the owner', async () => {
            const userId = 'user-123';
            const userEmail = 'user@test.com';
            const userName = 'User One';
            const mockUser = { id: userId, email: userEmail, name: userName, familyId: 'fam-123' };
            const mockTx = { id: 'tx-123', paidById: userId };

            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
            mockPrismaService.transaction.findUnique.mockResolvedValue(mockTx);
            mockPrismaService.transaction.delete.mockResolvedValue(mockTx);

            const result = await service.remove('tx-123', userId, userEmail, userName);

            expect(result).toEqual(mockTx);
            expect(mockPrismaService.transaction.delete).toHaveBeenCalledWith({ where: { id: 'tx-123' } });
        });

        it('should throw ForbiddenException if user is NOT the owner', async () => {
            const userId = 'user-123';
            const userEmail = 'user@test.com';
            const userName = 'User One';
            const mockUser = { id: userId, email: userEmail, name: userName, familyId: 'fam-123' };
            const mockTx = { id: 'tx-123', paidById: 'user-other' };

            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
            mockPrismaService.transaction.findUnique.mockResolvedValue(mockTx);

            await expect(service.remove('tx-123', userId, userEmail, userName)).rejects.toThrow(
                'Você não tem permissão para excluir esta transação.',
            );
        });
    });
});
