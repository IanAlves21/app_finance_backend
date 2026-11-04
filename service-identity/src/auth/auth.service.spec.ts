import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
    compare: jest.fn(),
}));

const mockVerifyIdToken = jest.fn();

jest.mock('google-auth-library', () => {
    return {
        OAuth2Client: jest.fn().mockImplementation(() => {
            return {
                verifyIdToken: mockVerifyIdToken,
            };
        }),
    };
});

describe('AuthService', () => {
    let service: AuthService;

    const mockUsersService = {
        findByEmail: jest.fn(),
        createFromGoogle: jest.fn(),
    };

    const mockJwtService = {
        signAsync: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: UsersService, useValue: mockUsersService },
                { provide: JwtService, useValue: mockJwtService },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
        jest.clearAllMocks();
        mockVerifyIdToken.mockReset();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('login', () => {
        it('should throw UnauthorizedException if user not found', async () => {
            mockUsersService.findByEmail.mockResolvedValue(null);

            await expect(service.login('test@example.com', 'password')).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException if password does not match', async () => {
            const mockUser = { id: 'u-1', email: 'test@example.com', password: 'hashed_password' };
            mockUsersService.findByEmail.mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            await expect(service.login('test@example.com', 'wrong_password')).rejects.toThrow(UnauthorizedException);
        });

        it('should sign JWT and return token and user profile if login successful', async () => {
            const mockUser = { id: 'u-1', email: 'test@example.com', name: 'User One', password: 'hashed_password' };
            mockUsersService.findByEmail.mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            mockJwtService.signAsync.mockResolvedValue('mock_token');

            const result = await service.login('test@example.com', 'password123');

            expect(mockUsersService.findByEmail).toHaveBeenCalledWith('test@example.com');
            expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashed_password');
            expect(mockJwtService.signAsync).toHaveBeenCalledWith({ sub: 'u-1', email: 'test@example.com', name: 'User One' });
            expect(result).toEqual({
                access_token: 'mock_token',
                user: { id: 'u-1', name: 'User One', email: 'test@example.com' },
            });
        });
    });

    describe('loginGoogle', () => {
        it('should throw UnauthorizedException if idToken verification fails', async () => {
            mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

            await expect(service.loginGoogle('invalid_token')).rejects.toThrow('Token do Google inválido ou expirado');
        });

        it('should throw UnauthorizedException if no payload returned or missing email', async () => {
            mockVerifyIdToken.mockResolvedValue({
                getPayload: jest.fn().mockReturnValue(null),
            });

            await expect(service.loginGoogle('token')).rejects.toThrow('Dados de e-mail ausentes no token do Google');
        });

        it('should login and sign JWT for existing user from Google', async () => {
            const googlePayload = { email: 'google@test.com', name: 'Google User' };
            const mockUser = { id: 'u-google', email: 'google@test.com', name: 'Google User' };

            mockVerifyIdToken.mockResolvedValue({
                getPayload: jest.fn().mockReturnValue(googlePayload),
            });
            mockUsersService.findByEmail.mockResolvedValue(mockUser);
            mockJwtService.signAsync.mockResolvedValue('jwt_google_token');

            const result = await service.loginGoogle('google_id_token');

            expect(mockVerifyIdToken).toHaveBeenCalledWith({ idToken: 'google_id_token' });
            expect(mockUsersService.findByEmail).toHaveBeenCalledWith('google@test.com');
            expect(mockJwtService.signAsync).toHaveBeenCalledWith({ sub: 'u-google', email: 'google@test.com', name: 'Google User' });
            expect(result).toEqual({
                access_token: 'jwt_google_token',
                user: { id: 'u-google', name: 'Google User', email: 'google@test.com' },
            });
        });

        it('should automatically register and sign JWT for new Google user', async () => {
            const googlePayload = { email: 'google-new@test.com', name: 'New Google User' };
            const mockUser = { id: 'u-google-new', email: 'google-new@test.com', name: 'New Google User' };

            mockVerifyIdToken.mockResolvedValue({
                getPayload: jest.fn().mockReturnValue(googlePayload),
            });
            mockUsersService.findByEmail.mockResolvedValue(null);
            mockUsersService.createFromGoogle.mockResolvedValue(mockUser);
            mockJwtService.signAsync.mockResolvedValue('jwt_new_google_token');

            const result = await service.loginGoogle('google_id_token_new');

            expect(mockUsersService.findByEmail).toHaveBeenCalledWith('google-new@test.com');
            expect(mockUsersService.createFromGoogle).toHaveBeenCalledWith('New Google User', 'google-new@test.com');
            expect(result).toEqual({
                access_token: 'jwt_new_google_token',
                user: { id: 'u-google-new', name: 'New Google User', email: 'google-new@test.com' },
            });
        });
    });
});
