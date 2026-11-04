import { Controller, Get, Post, Body, Param, Delete, Headers, Query } from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto } from './dto/create-budget.dto';

@Controller('budgets')
export class BudgetsController {
    constructor(private readonly budgetsService: BudgetsService) {}

    @Post()
    upsert(@Body() createBudgetDto: CreateBudgetDto, @Headers() headers: Record<string, string>) {
        const userId = headers['x-user-id'];
        const userEmail = headers['x-user-email'];
        const userName = headers['x-user-name'];
        return this.budgetsService.upsert(createBudgetDto, userId, userEmail, userName);
    }

    @Get()
    findAll(@Query('month') month: string, @Query('year') year: string, @Headers() headers: Record<string, string>) {
        const userId = headers['x-user-id'];
        const userEmail = headers['x-user-email'];
        const userName = headers['x-user-name'];
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        return this.budgetsService.findAll(m, y, userId, userEmail, userName);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Headers() headers: Record<string, string>) {
        const userId = headers['x-user-id'];
        const userEmail = headers['x-user-email'];
        const userName = headers['x-user-name'];
        return this.budgetsService.remove(id, userId, userEmail, userName);
    }
}
