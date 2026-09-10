import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
    constructor(private readonly chatService: ChatService) {}

    private validateAuthHeaders(headers: Record<string, string>) {
        const userId = headers['x-user-id'];
        const userEmail = headers['x-user-email'];
        if (!userId || !userEmail) {
            throw new UnauthorizedException('Credenciais de usuário ausentes ou inválidas.');
        }
        return { userId, userEmail, userName: headers['x-user-name'] };
    }

    @Post('message')
    async processMessage(
        @Body() body: { message: string },
        @Headers() headers: Record<string, string>,
    ) {
        const { userId, userEmail, userName } = this.validateAuthHeaders(headers);
        const userMessage = body?.message || '';
        return this.chatService.processMessage(userMessage, userId, userEmail, userName);
    }
}
