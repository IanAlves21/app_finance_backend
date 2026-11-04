import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';

describe('ChatService', () => {
    let service: ChatService;
    let configService: ConfigService;

    const mockPrismaService = {
        user: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
        familyGroup: {
            create: jest.fn(),
        },
        category: {
            findMany: jest.fn(),
        },
    };

    const mockConfigService = {
        get: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ChatService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: ConfigService, useValue: mockConfigService },
            ],
        }).compile();

        service = module.get<ChatService>(ChatService);
        configService = module.get<ConfigService>(ConfigService);
        jest.clearAllMocks();

        // Garante implementação limpa para cada teste
        mockConfigService.get.mockImplementation((key: string) => {
            if (key === 'GEMINI_API_KEY') return 'MOCK_GEMINI_KEY';
            if (key === 'GEMINI_MODEL') return 'gemini-3.1-flash-lite';
            return null;
        });
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('processMessage', () => {
        it('should throw UnauthorizedException if credentials missing', async () => {
            await expect(service.processMessage('hello')).rejects.toThrow(UnauthorizedException);
        });

        it('should return warning message if GEMINI_API_KEY is not defined', async () => {
            mockConfigService.get.mockImplementation((key: string) => {
                if (key === 'GEMINI_API_KEY') return '';
                return null;
            });

            mockPrismaService.user.findUnique.mockResolvedValueOnce({
                id: 'u-1',
                name: 'User 1',
                email: 'test@test.com',
            });

            mockPrismaService.category.findMany.mockResolvedValueOnce([]);

            const result = await service.processMessage('Gastei 50 reais', 'u-1', 'test@test.com');
            expect(result.isTransaction).toBe(false);
            expect(result.reply).toContain('não foi configurada');
        });

        it('should successfully contact Gemini API and return a parsed response', async () => {
            const mockUser = { id: 'u-1', name: 'User 1', email: 'test@test.com', familyId: 'fam-1' };
            mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
            mockPrismaService.category.findMany.mockResolvedValueOnce([
                { id: 'cat-1', name: 'Alimentação', type: 'EXPENSE' },
            ]);

            const mockGeminiJson = {
                isTransaction: true,
                amount: 45.0,
                description: 'Almoço',
                type: 'EXPENSE',
                categoryName: 'Alimentação',
                categoryId: 'cat-1',
                reply: 'Entendi! Registrei um gasto de R$ 45,00 em Alimentação.',
            };

            const mockFetchResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    candidates: [
                        {
                            content: {
                                parts: [
                                    { text: JSON.stringify(mockGeminiJson) },
                                ],
                            },
                        },
                    ],
                }),
            };

            const originalFetch = global.fetch;
            const mockFetch = jest.fn().mockResolvedValue(mockFetchResponse);
            global.fetch = mockFetch;

            try {
                const result = await service.processMessage('Gastei 45 reais com almoço', 'u-1', 'test@test.com', 'User%201');

                expect(mockFetch).toHaveBeenCalled();
                expect(result).toEqual(mockGeminiJson);
            } finally {
                global.fetch = originalFetch;
            }
        });

        it('should return fallback message if Gemini API response is not ok', async () => {
            const mockUser = { id: 'u-1', name: 'User 1', email: 'test@test.com', familyId: 'fam-1' };
            mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
            mockPrismaService.category.findMany.mockResolvedValueOnce([]);

            const mockFetchResponse = {
                ok: false,
                status: 500,
                text: jest.fn().mockResolvedValue('Internal Server Error'),
            };

            const originalFetch = global.fetch;
            const mockFetch = jest.fn().mockResolvedValue(mockFetchResponse);
            global.fetch = mockFetch;

            try {
                const result = await service.processMessage('Gastei 45', 'u-1', 'test@test.com');
                expect(result.isTransaction).toBe(false);
                expect(result.reply).toContain('erro ao processar sua mensagem');
            } finally {
                global.fetch = originalFetch;
            }
        });

        it('should create new user and family group if user does not exist in DB', async () => {
            mockPrismaService.user.findUnique.mockResolvedValueOnce(null); // by id
            mockPrismaService.user.findUnique.mockResolvedValueOnce(null); // by email

            const mockFamily = { id: 'fam-created', name: 'User 1 & Família' };
            mockPrismaService.familyGroup.create.mockResolvedValueOnce(mockFamily);

            const mockCreatedUser = { id: 'u-created', name: 'User 1', email: 'test@test.com', familyId: 'fam-created' };
            mockPrismaService.user.create.mockResolvedValueOnce(mockCreatedUser);

            mockPrismaService.category.findMany.mockResolvedValueOnce([]);

            const mockGeminiJson = {
                isTransaction: false,
                reply: 'Olá! Como posso ajudar?',
            };

            const mockFetchResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    candidates: [
                        {
                            content: {
                                parts: [
                                    { text: JSON.stringify(mockGeminiJson) },
                                ],
                            },
                        },
                    ],
                }),
            };

            const originalFetch = global.fetch;
            const mockFetch = jest.fn().mockResolvedValue(mockFetchResponse);
            global.fetch = mockFetch;

            try {
                const result = await service.processMessage('Oi', 'u-created', 'test@test.com', 'User%201');
                expect(mockPrismaService.familyGroup.create).toHaveBeenCalled();
                expect(mockPrismaService.user.create).toHaveBeenCalled();
                expect(result).toEqual(mockGeminiJson);
            } finally {
                global.fetch = originalFetch;
            }
        });
    });
});