import { Test, TestingModule } from '@nestjs/testing';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { UnauthorizedException } from '@nestjs/common';

describe('GroupsController', () => {
    let controller: GroupsController;
    let service: GroupsService;

    const mockGroupsService = {
        getGroupInfo: jest.fn(),
        createInvite: jest.fn(),
        getInviteDetails: jest.fn(),
        acceptInvite: jest.fn(),
        leaveGroup: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [GroupsController],
            providers: [
                { provide: GroupsService, useValue: mockGroupsService },
            ],
        }).compile();

        controller = module.get<GroupsController>(GroupsController);
        service = module.get<GroupsService>(GroupsService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('validateAuthHeaders', () => {
        it('should throw UnauthorizedException if headers are missing', async () => {
            const headers = {};
            expect(() => controller.getGroupInfo(headers)).toThrow(UnauthorizedException);
        });
    });

    describe('getGroupInfo', () => {
        it('should call groupsService.getGroupInfo if headers are present', async () => {
            const headers = { 'x-user-id': 'u-1', 'x-user-email': 'test@test.com', 'x-user-name': 'User 1' };
            mockGroupsService.getGroupInfo.mockResolvedValueOnce({ familyId: 'fam-1' });

            const result = await controller.getGroupInfo(headers);
            expect(service.getGroupInfo).toHaveBeenCalledWith('u-1', 'test@test.com', 'User 1');
            expect(result).toEqual({ familyId: 'fam-1' });
        });
    });

    describe('createInvite', () => {
        it('should call groupsService.createInvite', async () => {
            const headers = { 'x-user-id': 'u-1', 'x-user-email': 'test@test.com', 'x-user-name': 'User 1' };
            mockGroupsService.createInvite.mockResolvedValueOnce({ code: 'CODE12' });

            const result = await controller.createInvite(headers);
            expect(service.createInvite).toHaveBeenCalledWith('u-1', 'test@test.com', 'User 1');
            expect(result).toEqual({ code: 'CODE12' });
        });
    });

    describe('getInviteDetails', () => {
        it('should call groupsService.getInviteDetails', async () => {
            const headers = { 'x-user-id': 'u-1', 'x-user-email': 'test@test.com', 'x-user-name': 'User 1' };
            mockGroupsService.getInviteDetails.mockResolvedValueOnce({ familyName: 'Fam' });

            const result = await controller.getInviteDetails('CODE12', headers);
            expect(service.getInviteDetails).toHaveBeenCalledWith('CODE12');
            expect(result).toEqual({ familyName: 'Fam' });
        });
    });

    describe('acceptInvite', () => {
        it('should call groupsService.acceptInvite', async () => {
            const headers = { 'x-user-id': 'u-1', 'x-user-email': 'test@test.com', 'x-user-name': 'User 1' };
            mockGroupsService.acceptInvite.mockResolvedValueOnce({ success: true });

            const result = await controller.acceptInvite('CODE12', headers);
            expect(service.acceptInvite).toHaveBeenCalledWith('CODE12', 'u-1', 'test@test.com', 'User 1');
            expect(result).toEqual({ success: true });
        });
    });

    describe('leaveGroup', () => {
        it('should call groupsService.leaveGroup', async () => {
            const headers = { 'x-user-id': 'u-1', 'x-user-email': 'test@test.com', 'x-user-name': 'User 1' };
            mockGroupsService.leaveGroup.mockResolvedValueOnce({ success: true });

            const result = await controller.leaveGroup(headers);
            expect(service.leaveGroup).toHaveBeenCalledWith('u-1', 'test@test.com', 'User 1');
            expect(result).toEqual({ success: true });
        });
    });
});