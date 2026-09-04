import { Controller, Get, Post, Headers, Param, UnauthorizedException } from '@nestjs/common';
import { GroupsService } from './groups.service';

@Controller('groups')
export class GroupsController {
    constructor(private readonly groupsService: GroupsService) {}

    private validateAuthHeaders(headers: Record<string, string>) {
        const userId = headers['x-user-id'];
        const userEmail = headers['x-user-email'];
        if (!userId || !userEmail) {
            throw new UnauthorizedException('Credenciais de usuário ausentes ou inválidas.');
        }
        return { userId, userEmail, userName: headers['x-user-name'] };
    }

    @Get('info')
    getGroupInfo(@Headers() headers: Record<string, string>) {
        const { userId, userEmail, userName } = this.validateAuthHeaders(headers);
        return this.groupsService.getGroupInfo(userId, userEmail, userName);
    }

    @Post('invite')
    createInvite(@Headers() headers: Record<string, string>) {
        const { userId, userEmail, userName } = this.validateAuthHeaders(headers);
        return this.groupsService.createInvite(userId, userEmail, userName);
    }

    @Get('invite/:code')
    getInviteDetails(@Param('code') code: string, @Headers() headers: Record<string, string>) {
        // Valida se o usuário está logado antes de permitir visualizar detalhes do grupo parceiro
        this.validateAuthHeaders(headers);
        return this.groupsService.getInviteDetails(code);
    }

    @Post('invite/:code/accept')
    acceptInvite(@Param('code') code: string, @Headers() headers: Record<string, string>) {
        const { userId, userEmail, userName } = this.validateAuthHeaders(headers);
        return this.groupsService.acceptInvite(code, userId, userEmail, userName);
    }

    @Post('leave')
    leaveGroup(@Headers() headers: Record<string, string>) {
        const { userId, userEmail, userName } = this.validateAuthHeaders(headers);
        return this.groupsService.leaveGroup(userId, userEmail, userName);
    }
}
