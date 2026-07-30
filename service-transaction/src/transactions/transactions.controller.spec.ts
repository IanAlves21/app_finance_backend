import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsController', () => {
    let controller: TransactionsController;

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
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [TransactionsController],
            providers: [TransactionsService, { provide: PrismaService, useValue: mockPrismaService }],
        }).compile();

        controller = module.get<TransactionsController>(TransactionsController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    it('should call service.getMonthlySpending and return chronological monthly spending data', async () => {
        const headers = { 'x-user-id': 'user-1', 'x-user-email': 'user@test.com', 'x-user-name': 'User' };

        mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-1', familyId: 'fam-1' });
        mockPrismaService.transaction.findMany.mockResolvedValue([
            {
                amount: { toNumber: () => 100 },
                type: 'INCOME',
                date: new Date(),
                categoryId: 'cat-1',
                category: { id: 'cat-1', name: 'Freelance', icon: 'briefcase', color: '#10B981' },
                paidById: 'user-1',
                paidBy: { name: 'User' }
            },
            {
                amount: { toNumber: () => 50 },
                type: 'EXPENSE',
                date: new Date(),
                categoryId: 'cat-2',
                category: { id: 'cat-2', name: 'Compras', icon: 'shopping-cart', color: '#8B5CF6' },
                paidById: 'user-1',
                paidBy: { name: 'User' }
            }
        ]);

        const result = await controller.getMonthlySpending(headers, '6');
        expect(result).toHaveLength(6);
        expect(result[5].income).toBe(100);
        expect(result[5].expense).toBe(50);
        expect(result[5].categories).toHaveLength(1);
        expect(result[5].categories[0].name).toBe('Compras');
        expect(result[5].byUser).toHaveLength(1);
        expect(result[5].byUser[0].name).toBe('User');
    });
});
