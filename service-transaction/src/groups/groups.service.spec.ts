import { Test, TestingModule } from '@nestjs/testing';
import { GroupsService } from './groups.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('GroupsService', () => {
    let service: GroupsService;

    const mockPrismaService = {
        user: {
            findUnique: jest.fn(),
            create: jest.fn(),
            count: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        familyGroup: {
            create: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            delete: jest.fn().mockImplementation(() => Promise.resolve({})),
        },
        invite: {
            deleteMany: jest.fn().mockImplementation(() => Promise.resolve({ count: 0 })),
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
        },
        category: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            updateMany: jest.fn(),
        },
        wallet: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            updateMany: jest.fn(),
        },
        budget: {
            updateMany: jest.fn(),
        },
        transaction: {
            findMany: jest.fn(),
            updateMany: jest.fn(),
        },
        $transaction: jest.fn().mockImplementation(async (arg) => {
            if (typeof arg === 'function') {
                return await arg(mockPrismaService);
            }
            return arg;
        }),
    };

    const mockAnalyticsClient = {
        emit: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GroupsService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: 'ANALYTICS_SERVICE', useValue: mockAnalyticsClient },
            ],
        }).compile();

        service = module.get<GroupsService>(GroupsService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('getGroupInfo', () => {
        it('should throw UnauthorizedException if credentials missing', async () => {
            await expect(service.getGroupInfo()).rejects.toThrow(UnauthorizedException);
        });

        it('should throw NotFoundException if family group is not found', async () => {
            mockPrismaService.user.findUnique.mockResolvedValueOnce({ id: 'u-1', familyId: 'fam-1' });
            mockPrismaService.familyGroup.findUnique.mockResolvedValueOnce(null);

            await expect(service.getGroupInfo('u-1', 'email@test.com')).rejects.toThrow(NotFoundException);
        });

        it('should return group info successfully', async () => {
            const mockUser = { id: 'u-1', email: 'email@test.com', name: 'User 1', familyId: 'fam-1' };
            const mockFamily = {
                id: 'fam-1',
                name: 'Family 1',
                users: [mockUser],
            };
            mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
            mockPrismaService.familyGroup.findUnique.mockResolvedValueOnce(mockFamily);

            const result = await service.getGroupInfo('u-1', 'email@test.com');
            expect(result).toEqual({
                familyId: 'fam-1',
                name: 'Family 1',
                members: [{
                    id: 'u-1',
                    name: 'User 1',
                    email: 'email@test.com',
                    avatarUrl: undefined,
                }],
            });
        });
    });

    describe('createInvite', () => {
        it('should throw UnauthorizedException if credentials missing', async () => {
            await expect(service.createInvite()).rejects.toThrow(UnauthorizedException);
        });

        it('should create invite and clear old ones if no valid invite exists', async () => {
            const mockUser = { id: 'u-1', email: 'email@test.com', name: 'User 1', familyId: 'fam-1' };
            const mockInvite = { code: 'ABC123', expiresAt: new Date() };

            mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
            mockPrismaService.invite.deleteMany.mockResolvedValueOnce({ count: 1 });
            mockPrismaService.invite.findFirst.mockResolvedValueOnce(null);
            mockPrismaService.invite.findUnique.mockResolvedValueOnce(null); // loop Unique check
            mockPrismaService.invite.create.mockResolvedValueOnce(mockInvite);

            const result = await service.createInvite('u-1', 'email@test.com');
            expect(result.code).toEqual('ABC123');
            expect(mockPrismaService.invite.create).toHaveBeenCalled();
        });

        it('should return existing active invite if it exists', async () => {
            const mockUser = { id: 'u-1', email: 'email@test.com', name: 'User 1', familyId: 'fam-1' };
            const mockActiveInvite = { code: 'ACTIVE', expiresAt: new Date() };

            mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
            mockPrismaService.invite.deleteMany.mockResolvedValueOnce({ count: 0 });
            mockPrismaService.invite.findFirst.mockResolvedValueOnce(mockActiveInvite);

            const result = await service.createInvite('u-1', 'email@test.com');
            expect(result.code).toEqual('ACTIVE');
            expect(mockPrismaService.invite.create).not.toHaveBeenCalled();
        });
    });

    describe('getInviteDetails', () => {
        it('should throw NotFoundException if invite does not exist', async () => {
            mockPrismaService.invite.findUnique.mockResolvedValueOnce(null);
            await expect(service.getInviteDetails('INV123')).rejects.toThrow(NotFoundException);
        });

        it('should throw BadRequestException if invite is expired', async () => {
            const expiredDate = new Date();
            expiredDate.setHours(expiredDate.getHours() - 1);
            mockPrismaService.invite.findUnique.mockResolvedValueOnce({
                code: 'EXPIRED',
                expiresAt: expiredDate,
            });

            await expect(service.getInviteDetails('EXPIRED')).rejects.toThrow(BadRequestException);
        });

        it('should return invite details successfully', async () => {
            const futureDate = new Date();
            futureDate.setHours(futureDate.getHours() + 1);
            mockPrismaService.invite.findUnique.mockResolvedValueOnce({
                code: 'CODE12',
                expiresAt: futureDate,
                family: {
                    name: 'Target Family',
                    users: [{ name: 'Creator User' }],
                },
            });

            const result = await service.getInviteDetails('CODE12');
            expect(result).toEqual({
                code: 'CODE12',
                familyName: 'Target Family',
                ownerName: 'Creator User',
                expiresAt: futureDate,
            });
        });
    });

    describe('acceptInvite', () => {
        it('should throw UnauthorizedException if credentials missing', async () => {
            await expect(service.acceptInvite('CODE')).rejects.toThrow(UnauthorizedException);
        });

        it('should throw NotFoundException if invite is invalid', async () => {
            mockPrismaService.invite.findUnique.mockResolvedValueOnce(null);
            await expect(service.acceptInvite('INVALID', 'u-1', 'test@test.com')).rejects.toThrow(NotFoundException);
        });

        it('should throw BadRequestException if invite is expired', async () => {
            const expiredDate = new Date();
            expiredDate.setHours(expiredDate.getHours() - 1);
            mockPrismaService.invite.findUnique.mockResolvedValueOnce({
                code: 'EXPIRED',
                expiresAt: expiredDate,
            });

            await expect(service.acceptInvite('EXPIRED', 'u-1', 'test@test.com')).rejects.toThrow(BadRequestException);
        });

        it('should return message if already in the target group', async () => {
            const futureDate = new Date();
            futureDate.setHours(futureDate.getHours() + 1);
            mockPrismaService.invite.findUnique.mockResolvedValueOnce({
                code: 'CODE',
                familyId: 'fam-1',
                expiresAt: futureDate,
            });
            mockPrismaService.user.findUnique.mockResolvedValueOnce({
                id: 'u-1',
                familyId: 'fam-1',
            });

            const result = await service.acceptInvite('CODE', 'u-1', 'test@test.com');
            expect(result).toEqual({
                success: true,
                message: 'Você já faz parte deste grupo familiar.',
                familyId: 'fam-1',
            });
        });

        it('should perform full batch merge if user was the only member in old family', async () => {
            const futureDate = new Date();
            futureDate.setHours(futureDate.getHours() + 1);
            mockPrismaService.invite.findUnique.mockResolvedValueOnce({
                code: 'CODE',
                familyId: 'fam-new',
                expiresAt: futureDate,
            });
            mockPrismaService.user.findUnique.mockResolvedValueOnce({
                id: 'u-1',
                familyId: 'fam-old',
            });
            mockPrismaService.user.count.mockResolvedValueOnce(0); // 0 remaining users

            const result = await service.acceptInvite('CODE', 'u-1', 'test@test.com');
            expect(result.success).toBe(true);
            expect(mockPrismaService.category.updateMany).toHaveBeenCalled();
            expect(mockPrismaService.wallet.updateMany).toHaveBeenCalled();
            expect(mockPrismaService.budget.updateMany).toHaveBeenCalled();
            expect(mockPrismaService.transaction.updateMany).toHaveBeenCalled();
            expect(mockPrismaService.familyGroup.delete).toHaveBeenCalledWith({ where: { id: 'fam-old' } });
            expect(mockAnalyticsClient.emit).toHaveBeenCalledWith('family.merged', expect.any(Object));
        });

        it('should perform selective migration if there are other members in the old family', async () => {
            const futureDate = new Date();
            futureDate.setHours(futureDate.getHours() + 1);
            mockPrismaService.invite.findUnique.mockResolvedValueOnce({
                code: 'CODE',
                familyId: 'fam-new',
                expiresAt: futureDate,
            });
            mockPrismaService.user.findUnique.mockResolvedValueOnce({
                id: 'u-1',
                familyId: 'fam-old',
            });
            mockPrismaService.user.count.mockResolvedValueOnce(2); // other members exist

            const userTransactions = [
                { id: 'tx-1', walletId: 'w-1', categoryId: 'cat-1' },
            ];
            mockPrismaService.transaction.findMany.mockResolvedValueOnce(userTransactions);
            mockPrismaService.wallet.findUnique.mockResolvedValueOnce({ id: 'w-1', name: 'Wallet 1' });
            mockPrismaService.wallet.findFirst.mockResolvedValueOnce(null); // not exists in target family, will create
            mockPrismaService.wallet.create.mockResolvedValueOnce({ id: 'w-target-1' });

            mockPrismaService.category.findUnique.mockResolvedValueOnce({ id: 'cat-1', name: 'Category 1', type: 'EXPENSE', icon: 'icon', color: 'color' });
            mockPrismaService.category.findFirst.mockResolvedValueOnce(null); // not exists, will create
            mockPrismaService.category.create.mockResolvedValueOnce({ id: 'cat-target-1' });

            mockPrismaService.category.findMany.mockResolvedValueOnce([]); // no userCreatedCategories

            const result = await service.acceptInvite('CODE', 'u-1', 'test@test.com');
            expect(result.success).toBe(true);
            expect(mockPrismaService.wallet.create).toHaveBeenCalled();
            expect(mockPrismaService.category.create).toHaveBeenCalled();
            expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith({
                where: { id: { in: ['tx-1'] } },
                data: {
                    familyId: 'fam-new',
                    walletId: 'w-target-1',
                    categoryId: 'cat-target-1',
                },
            });
            expect(mockAnalyticsClient.emit).toHaveBeenCalledWith('family.merged', expect.any(Object));
        });
    });

    describe('leaveGroup', () => {
        it('should throw UnauthorizedException if credentials missing', async () => {
            await expect(service.leaveGroup()).rejects.toThrow(UnauthorizedException);
        });

        it('should throw NotFoundException if user not found', async () => {
            mockPrismaService.user.findUnique.mockResolvedValueOnce(null);
            await expect(service.leaveGroup('u-1', 'test@test.com')).rejects.toThrow(NotFoundException);
        });

        it('should throw BadRequestException if user is already in a 1-person group', async () => {
            mockPrismaService.user.findUnique.mockResolvedValueOnce({
                id: 'u-1',
                family: {
                    users: [{ id: 'u-1' }],
                },
            });
            await expect(service.leaveGroup('u-1', 'test@test.com')).rejects.toThrow(BadRequestException);
        });

        it('should leave group and migrate transactions successfully', async () => {
            mockPrismaService.user.findUnique.mockResolvedValueOnce({
                id: 'u-1',
                name: 'User 1',
                email: 'test@test.com',
                family: {
                    id: 'fam-old',
                    users: [{ id: 'u-1' }, { id: 'u-2' }],
                },
            });

            mockPrismaService.familyGroup.create.mockResolvedValueOnce({
                id: 'fam-new',
                name: 'User 1 & Família',
            });

            const userTransactions = [
                { id: 'tx-1', walletId: 'w-1', categoryId: 'cat-1' },
            ];
            mockPrismaService.transaction.findMany.mockResolvedValueOnce(userTransactions);
            mockPrismaService.wallet.findUnique.mockResolvedValueOnce({ id: 'w-1', name: 'Wallet 1' });
            mockPrismaService.wallet.findFirst.mockResolvedValueOnce(null);
            mockPrismaService.wallet.create.mockResolvedValueOnce({ id: 'w-new-1' });

            mockPrismaService.category.findUnique.mockResolvedValueOnce({ id: 'cat-1', name: 'Category 1', type: 'EXPENSE', icon: 'icon', color: 'color' });
            mockPrismaService.category.findFirst.mockResolvedValueOnce(null);
            mockPrismaService.category.create.mockResolvedValueOnce({ id: 'cat-new-1' });

            mockPrismaService.category.findMany.mockResolvedValueOnce([]); // userCreatedCategories

            const result = await service.leaveGroup('u-1', 'test@test.com');
            expect(result.success).toBe(true);
            expect(result.familyId).toEqual('fam-new');
            expect(mockPrismaService.familyGroup.create).toHaveBeenCalled();
            expect(mockPrismaService.user.update).toHaveBeenCalled();
            expect(mockAnalyticsClient.emit).toHaveBeenCalledWith('user.left_group', expect.any(Object));
        });
    });
});