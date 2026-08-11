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
            providers: [
                TransactionsService,
                { provide: PrismaService, useValue: mockPrismaService },
                {
                    provide: 'ANALYTICS_SERVICE',
                    useValue: { emit: jest.fn() },
                },
            ],
        }).compile();

        controller = module.get<TransactionsController>(TransactionsController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
