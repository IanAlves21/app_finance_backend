import { Injectable, Inject, UnauthorizedException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBudgetDto } from './dto/create-budget.dto';

@Injectable()
export class BudgetsService {
    constructor(
        private readonly prisma: PrismaService,
        @Inject('ANALYTICS_SERVICE') private readonly analyticsClient: ClientProxy,
    ) {}

    private async getOrCreateUser(userId: string, userEmail: string, userName?: string) {
        const decodedName = userName ? decodeURIComponent(userName) : 'Usuário';

        let user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            user = await this.prisma.user.findUnique({
                where: { email: userEmail },
            });

            if (user) return user;

            // Cria um FamilyGroup exclusivo e isolado para este novo usuário
            const family = await this.prisma.familyGroup.create({
                data: { name: `${decodedName} & Família` },
            });

            user = await this.prisma.user.create({
                data: {
                    id: userId,
                    email: userEmail,
                    name: decodedName,
                    familyId: family.id,
                },
            });
        }

        return user;
    }

    async upsert(createBudgetDto: CreateBudgetDto, userId?: string, userEmail?: string, userName?: string) {
        if (!userId || !userEmail) {
            throw new UnauthorizedException('User credentials are required');
        }

        const dbUser = await this.getOrCreateUser(userId, userEmail, userName);
        const familyId = dbUser.familyId;

        // Verify category belongs to family or is global
        const category = await this.prisma.category.findUnique({
            where: { id: createBudgetDto.categoryId },
        });

        if (!category) {
            throw new NotFoundException('Category not found');
        }

        if (category.familyId && category.familyId !== familyId) {
            throw new ForbiddenException('You do not have permission for this category');
        }

        // Upsert budget
        const budget = await this.prisma.budget.upsert({
            where: {
                categoryId_familyId_month_year: {
                    categoryId: createBudgetDto.categoryId,
                    familyId,
                    month: createBudgetDto.month,
                    year: createBudgetDto.year,
                },
            },
            update: {
                amount: createBudgetDto.amount,
            },
            create: {
                amount: createBudgetDto.amount,
                month: createBudgetDto.month,
                year: createBudgetDto.year,
                categoryId: createBudgetDto.categoryId,
                familyId,
            },
            include: {
                category: true,
                family: true,
            },
        });

        // Emit asynchronously to RabbitMQ
        this.analyticsClient.emit('budget.upserted', budget);

        return budget;
    }

    async findAll(month: number, year: number, userId?: string, userEmail?: string, userName?: string) {
        if (!userId || !userEmail) {
            throw new UnauthorizedException('User credentials are required');
        }

        const dbUser = await this.getOrCreateUser(userId, userEmail, userName);
        const familyId = dbUser.familyId;

        return this.prisma.budget.findMany({
            where: {
                familyId,
                month,
                year,
            },
            include: {
                category: true,
            },
        });
    }

    async remove(id: string, userId?: string, userEmail?: string, userName?: string) {
        if (!userId || !userEmail) {
            throw new UnauthorizedException('User credentials are required');
        }

        const dbUser = await this.getOrCreateUser(userId, userEmail, userName);
        const familyId = dbUser.familyId;

        const budget = await this.prisma.budget.findUnique({
            where: { id },
        });

        if (!budget) {
            throw new NotFoundException('Budget not found');
        }

        if (budget.familyId !== familyId) {
            throw new ForbiddenException('You do not have permission to delete this budget');
        }

        const deleted = await this.prisma.budget.delete({
            where: { id },
        });

        // Emit asynchronously to RabbitMQ
        this.analyticsClient.emit('budget.deleted', { id: deleted.id });

        return deleted;
    }
}
