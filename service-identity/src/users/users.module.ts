import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersService } from './users.service';

@Module({
    imports: [PrismaModule],
    providers: [UsersService],
    exports: [UsersService], // <-- ESSENCIAL: Permite que o AuthModule use este serviço!
})
export class UsersModule {}
