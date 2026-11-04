import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { UnauthorizedException } from '@nestjs/common';

describe('ChatController', () => {
    let controller: ChatController;
    let service: ChatService;

    const mockChatService = {
        processMessage: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [ChatController],
            providers: [
                { provide: ChatService, useValue: mockChatService },
            ],
        }).compile();

        controller = module.get<ChatController>(ChatController);
        service = module.get<ChatService>(ChatService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('processMessage', () => {
        it('should throw UnauthorizedException if headers are missing', async () => {
            const body = { message: 'Gastei 50 reais' };
            const headers = {};

            await expect(controller.processMessage(body, headers)).rejects.toThrow(UnauthorizedException);
        });

        it('should process message and return response if headers are present', async () => {
            const body = { message: 'Gastei 50 reais' };
            const headers = { 'x-user-id': 'u-1', 'x-user-email': 'test@test.com', 'x-user-name': 'User 1' };
            const mockReply = { isTransaction: true, reply: 'Registrado!' };
            mockChatService.processMessage.mockResolvedValueOnce(mockReply);

            const result = await controller.processMessage(body, headers);
            expect(service.processMessage).toHaveBeenCalledWith('Gastei 50 reais', 'u-1', 'test@test.com', 'User 1');
            expect(result).toEqual(mockReply);
        });
    });
});