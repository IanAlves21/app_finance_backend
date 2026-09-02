import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
    hash: jest.fn().mockResolvedValue('hashed_password'),
}));

describe('UsersService', () => {
    let service: UsersService;

    const mockPrismaService = {
        user: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UsersService,
                { provide: PrismaService, useValue: mockPrismaService },
            ],
        }).compile();

        service = module.get<UsersService>(UsersService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('create', () => {
        it('should throw ConflictException if email is already in use', async () => {
            const dto = { name: 'Test', email: 'test@example.com', password: 'password123' };
            mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-1', email: dto.email });

            await expect(service.create(dto)).rejects.toThrow(ConflictException);
        });

        it('should hash password and create user successfully', async () => {
            const dto = { name: 'Test', email: 'test@example.com', password: 'password123' };
            const mockCreatedUser = {
                id: 'user-1',
                name: dto.name,
                email: dto.email,
                password: 'hashed_password',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrismaService.user.findUnique.mockResolvedValue(null);
            mockPrismaService.user.create.mockResolvedValue(mockCreatedUser);

            const result = await service.create(dto);

            expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({ where: { email: dto.email } });
            expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 10);
            expect(mockPrismaService.user.create).toHaveBeenCalledWith({
                data: {
                    name: dto.name,
                    email: dto.email,
                    password: 'hashed_password',
                },
            });
            expect(result).toEqual({
                id: mockCreatedUser.id,
                name: mockCreatedUser.name,
                email: mockCreatedUser.email,
                createdAt: mockCreatedUser.createdAt,
                updatedAt: mockCreatedUser.updatedAt,
            });
        });
    });

    describe('findByEmail', () => {
        it('should return user from prisma findUnique', async () => {
            const mockUser = { id: 'user-1', email: 'test@example.com' };
            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

            const result = await service.findByEmail('test@example.com');

            expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
            expect(result).toEqual(mockUser);
        });
    });

    describe('createFromGoogle', () => {
        it('should create user with a random hashed password', async () => {
            const mockCreatedUser = { id: 'user-1', name: 'Google User', email: 'google@test.com' };
            mockPrismaService.user.create.mockResolvedValue(mockCreatedUser);

            const result = await service.createFromGoogle('Google User', 'google@test.com');

            expect(mockPrismaService.user.create).toHaveBeenCalledWith({
                data: {
                    name: 'Google User',
                    email: 'google@test.com',
                    password: 'hashed_password',
                },
            });
            expect(result).toEqual(mockCreatedUser);
        });
    });
});
