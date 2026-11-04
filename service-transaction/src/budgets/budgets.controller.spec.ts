import { Test, TestingModule } from '@nestjs/testing';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';

describe('BudgetsController', () => {
    let controller: BudgetsController;
    let service: BudgetsService;

    const mockBudgetsService = {
        upsert: jest.fn(),
        findAll: jest.fn(),
        remove: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [BudgetsController],
            providers: [
                { provide: BudgetsService, useValue: mockBudgetsService },
            ],
        }).compile();

        controller = module.get<BudgetsController>(BudgetsController);
        service = module.get<BudgetsService>(BudgetsService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('upsert', () => {
        it('should call budgetsService.upsert', async () => {
            const dto = { categoryId: 'cat-1', month: 7, year: 2026, amount: 500 };
            const headers = { 'x-user-id': 'u-1', 'x-user-email': 'test@test.com', 'x-user-name': 'User 1' };
            mockBudgetsService.upsert.mockResolvedValueOnce({ id: 'b-1' });

            const result = await controller.upsert(dto, headers);
            expect(service.upsert).toHaveBeenCalledWith(dto, 'u-1', 'test@test.com', 'User 1');
            expect(result).toEqual({ id: 'b-1' });
        });
    });

    describe('findAll', () => {
        it('should call budgetsService.findAll', async () => {
            const headers = { 'x-user-id': 'u-1', 'x-user-email': 'test@test.com', 'x-user-name': 'User 1' };
            mockBudgetsService.findAll.mockResolvedValueOnce([]);

            const result = await controller.findAll('7', '2026', headers);
            expect(service.findAll).toHaveBeenCalledWith(7, 2026, 'u-1', 'test@test.com', 'User 1');
            expect(result).toEqual([]);
        });
    });

    describe('remove', () => {
        it('should call budgetsService.remove', async () => {
            const headers = { 'x-user-id': 'u-1', 'x-user-email': 'test@test.com', 'x-user-name': 'User 1' };
            mockBudgetsService.remove.mockResolvedValueOnce({ success: true });

            const result = await controller.remove('b-1', headers);
            expect(service.remove).toHaveBeenCalledWith('b-1', 'u-1', 'test@test.com', 'User 1');
            expect(result).toEqual({ success: true });
        });
    });
});