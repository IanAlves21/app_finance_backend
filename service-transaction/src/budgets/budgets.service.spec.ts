import { Test, TestingModule } from '@nestjs/testing';
import { BudgetsService } from './budgets.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnauthorizedException, NotFoundException, ForbiddenException } from '@nestjs/common';

describe('BudgetsService', () => {
    let service: BudgetsService;

    const mockPrismaService = {
        user: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
        familyGroup: {
            create: jest.fn(),
        },
        category: {
            findUnique: jest.fn(),
        },
        budget: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            upsert: jest.fn(),
            delete: jest.fn(),
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BudgetsService,
                { provide: PrismaService, useValue: mockPrismaService },
                {
                    provide: 'ANALYTICS_SERVICE',
                    useValue: { emit: jest.fn() },
                },
            ],
        }).compile();

        service = module.get<BudgetsService>(BudgetsService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('upsert', () => {
        it('should throw UnauthorizedException if credentials missing', async () => {
            const dto = { categoryId: 'cat-1', month: 7, year: 2026, amount: 500 };
            await expect(service.upsert(dto)).rejects.toThrow(UnauthorizedException);
        });

        it('should throw NotFoundException if category not found', async () => {
            const dto = { categoryId: 'cat-1', month: 7, year: 2026, amount: 500 };
            mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u-1', familyId: 'fam-1' });
            mockPrismaService.category.findUnique.mockResolvedValue(null);

            await expect(service.upsert(dto, 'u-1', 'test@test.com')).rejects.toThrow(NotFoundException);
        });

        it('should throw ForbiddenException if category belongs to another family', async () => {
            const dto = { categoryId: 'cat-1', month: 7, year: 2026, amount: 500 };
            mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u-1', familyId: 'fam-1' });
            mockPrismaService.category.findUnique.mockResolvedValue({ id: 'cat-1', familyId: 'fam-other' });

            await expect(service.upsert(dto, 'u-1', 'test@test.com')).rejects.toThrow(ForbiddenException);
        });

        it('should upsert budget successfully', async () => {
            const dto = { categoryId: 'cat-1', month: 7, year: 2026, amount: 500 };
            const mockUser = { id: 'u-1', familyId: 'fam-1' };
            const mockCategory = { id: 'cat-1', familyId: 'fam-1' };
            const mockBudget = { id: 'b-1', ...dto, familyId: 'fam-1' };

            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
            mockPrismaService.category.findUnique.mockResolvedValue(mockCategory);
            mockPrismaService.budget.upsert.mockResolvedValue(mockBudget);

            const result = await service.upsert(dto, 'u-1', 'test@test.com');

            expect(mockPrismaService.budget.upsert).toHaveBeenCalled();
            expect(result).toEqual(mockBudget);
        });
    });

    describe('findAll', () => {
        it('should throw UnauthorizedException if credentials missing', async () => {
            await expect(service.findAll(7, 2026)).rejects.toThrow(UnauthorizedException);
        });

        it('should find budgets for user family successfully', async () => {
            const mockUser = { id: 'u-1', familyId: 'fam-1' };
            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
            mockPrismaService.budget.findMany.mockResolvedValue([]);

            await service.findAll(7, 2026, 'u-1', 'test@test.com');

            expect(mockPrismaService.budget.findMany).toHaveBeenCalledWith({
                where: {
                    familyId: 'fam-1',
                    month: 7,
                    year: 2026,
                },
                include: {
                    category: true,
                },
            });
        });
    });

    describe('remove', () => {
        it('should throw UnauthorizedException if credentials missing', async () => {
            await expect(service.remove('b-1')).rejects.toThrow(UnauthorizedException);
        });

        it('should throw NotFoundException if budget does not exist', async () => {
            mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u-1', familyId: 'fam-1' });
            mockPrismaService.budget.findUnique.mockResolvedValue(null);

            await expect(service.remove('b-1', 'u-1', 'test@test.com')).rejects.toThrow(NotFoundException);
        });

        it('should throw ForbiddenException if user has no permission for this budget', async () => {
            mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u-1', familyId: 'fam-1' });
            mockPrismaService.budget.findUnique.mockResolvedValue({ id: 'b-1', familyId: 'fam-other' });

            await expect(service.remove('b-1', 'u-1', 'test@test.com')).rejects.toThrow(ForbiddenException);
        });

        it('should remove budget successfully', async () => {
            mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u-1', familyId: 'fam-1' });
            mockPrismaService.budget.findUnique.mockResolvedValue({ id: 'b-1', familyId: 'fam-1' });
            mockPrismaService.budget.delete.mockResolvedValue({ id: 'b-1' });

            const result = await service.remove('b-1', 'u-1', 'test@test.com');

            expect(mockPrismaService.budget.delete).toHaveBeenCalledWith({ where: { id: 'b-1' } });
            expect(result).toBeDefined();
        });
    });
});
