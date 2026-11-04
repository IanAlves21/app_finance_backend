import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { UnauthorizedException } from '@nestjs/common';

describe('TransactionsController', () => {
    let controller: TransactionsController;
    let service: TransactionsService;

    const mockTransactionsService = {
        create: jest.fn(),
        findAll: jest.fn(),
        getSummary: jest.fn(),
        findAllCategories: jest.fn(),
        createCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [TransactionsController],
            providers: [
                { provide: TransactionsService, useValue: mockTransactionsService },
            ],
        }).compile();

        controller = module.get<TransactionsController>(TransactionsController);
        service = module.get<TransactionsService>(TransactionsService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('Header Validation', () => {
        it('should throw UnauthorizedException if headers are missing x-user-id or x-user-email', () => {
            const emptyHeaders = {};
            expect(() => (controller as any).validateAuthHeaders(emptyHeaders)).toThrow(UnauthorizedException);
        });

        it('should return extracted credentials if headers are valid', () => {
            const validHeaders = {
                'x-user-id': 'u-1',
                'x-user-email': 'test@test.com',
                'x-user-name': 'User One',
            };
            const result = (controller as any).validateAuthHeaders(validHeaders);
            expect(result).toEqual({
                userId: 'u-1',
                userEmail: 'test@test.com',
                userName: 'User One',
            });
        });
    });

    describe('Controller Routes', () => {
        const validHeaders = {
            'x-user-id': 'u-1',
            'x-user-email': 'test@test.com',
            'x-user-name': 'User%20One',
        };

        it('create should validate headers and delegate to service', async () => {
            const dto: CreateTransactionDto = { description: 'Supermarket', amount: 100, type: 'EXPENSE', date: '2026-07-15' };
            await controller.create(dto, validHeaders);
            expect(mockTransactionsService.create).toHaveBeenCalledWith(dto, 'u-1', 'test@test.com', 'User%20One');
        });

        it('findAll should validate headers and delegate to service', async () => {
            await controller.findAll(validHeaders, '1', '10', '2026-07-01', '2026-07-31', 'cat-1');
            expect(mockTransactionsService.findAll).toHaveBeenCalledWith('u-1', 'test@test.com', 'User%20One', 1, 10, '2026-07-01', '2026-07-31', 'cat-1');
        });

        it('getSummary should delegate to service', async () => {
            await controller.getSummary(validHeaders, '2026-07-01', '2026-07-31');
            expect(mockTransactionsService.getSummary).toHaveBeenCalledWith('u-1', 'test@test.com', 'User%20One', '2026-07-01', '2026-07-31');
        });

        it('findAllCategories should delegate to service', async () => {
            await controller.findAllCategories(validHeaders);
            expect(mockTransactionsService.findAllCategories).toHaveBeenCalledWith('u-1', 'test@test.com', 'User%20One');
        });

        it('update should validate headers and delegate to service', async () => {
            const dto: UpdateTransactionDto = { description: 'Updated' };
            await controller.update('tx-1', dto, validHeaders);
            expect(mockTransactionsService.update).toHaveBeenCalledWith('tx-1', dto);
        });

        it('remove should validate headers and delegate to service', async () => {
            await controller.remove('tx-1', validHeaders);
            expect(mockTransactionsService.remove).toHaveBeenCalledWith('tx-1', 'u-1', 'test@test.com', 'User%20One');
        });

        it('createCategory should validate headers and delegate to service', async () => {
            const body = { name: 'Aluguel', type: 'EXPENSE' as const };
            await controller.createCategory(body, validHeaders);
            expect(mockTransactionsService.createCategory).toHaveBeenCalledWith(body, 'u-1', 'test@test.com', 'User%20One');
        });

        it('updateCategory should validate headers and delegate to service', async () => {
            const body = { name: 'Aluguel Novo' };
            await controller.updateCategory('cat-1', body, validHeaders);
            expect(mockTransactionsService.updateCategory).toHaveBeenCalledWith('cat-1', body, 'u-1', 'test@test.com', 'User%20One');
        });

        it('deleteCategory should validate headers and delegate to service', async () => {
            await controller.deleteCategory('cat-1', validHeaders);
            expect(mockTransactionsService.deleteCategory).toHaveBeenCalledWith('cat-1', 'u-1', 'test@test.com', 'User%20One');
        });
    });
});
