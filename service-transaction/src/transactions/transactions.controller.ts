import { Body, Controller, Delete, Get, Param, Patch, Post, Headers, Query } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
    constructor(private readonly transactionsService: TransactionsService) {}

    @Post()
    create(@Body() createTransactionDto: CreateTransactionDto, @Headers() headers: Record<string, string>) {
        const userId = headers['x-user-id'];
        const userEmail = headers['x-user-email'];
        const userName = headers['x-user-name'];
        return this.transactionsService.create(createTransactionDto, userId, userEmail, userName);
    }

    @Get()
    findAll(
        @Headers() headers: Record<string, string>,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        const userId = headers['x-user-id'];
        const userEmail = headers['x-user-email'];
        const userName = headers['x-user-name'];
        const pageNumber = page ? parseInt(page, 10) : undefined;
        const limitNumber = limit ? parseInt(limit, 10) : undefined;
        return this.transactionsService.findAll(
            userId,
            userEmail,
            userName,
            pageNumber,
            limitNumber,
            startDate,
            endDate,
        );
    }

    @Get('summary')
    getSummary(
        @Headers() headers: Record<string, string>,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        const userId = headers['x-user-id'];
        const userEmail = headers['x-user-email'];
        const userName = headers['x-user-name'];
        return this.transactionsService.getSummary(userId, userEmail, userName, startDate, endDate);
    }

    @Get('categories')
    findAllCategories(@Headers() headers: Record<string, string>) {
        const userId = headers['x-user-id'];
        const userEmail = headers['x-user-email'];
        const userName = headers['x-user-name'];
        return this.transactionsService.findAllCategories(userId, userEmail, userName);
    }

    @Post('categories')
    createCategory(
        @Body() body: { name: string; type: 'INCOME' | 'EXPENSE'; icon?: string; color?: string },
        @Headers() headers: Record<string, string>,
    ) {
        const userId = headers['x-user-id'];
        const userEmail = headers['x-user-email'];
        const userName = headers['x-user-name'];
        return this.transactionsService.createCategory(body, userId, userEmail, userName);
    }

    @Patch('categories/:id')
    updateCategory(
        @Param('id') id: string,
        @Body() body: { name?: string; type?: 'INCOME' | 'EXPENSE'; icon?: string; color?: string },
        @Headers() headers: Record<string, string>,
    ) {
        const userId = headers['x-user-id'];
        const userEmail = headers['x-user-email'];
        const userName = headers['x-user-name'];
        return this.transactionsService.updateCategory(id, body, userId, userEmail, userName);
    }

    @Delete('categories/:id')
    deleteCategory(@Param('id') id: string, @Headers() headers: Record<string, string>) {
        const userId = headers['x-user-id'];
        const userEmail = headers['x-user-email'];
        const userName = headers['x-user-name'];
        return this.transactionsService.deleteCategory(id, userId, userEmail, userName);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        // Removemos o "+" porque nosso ID é uma String (UUID)
        return this.transactionsService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateTransactionDto: UpdateTransactionDto) {
        return this.transactionsService.update(id, updateTransactionDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Headers() headers: Record<string, string>) {
        const userId = headers['x-user-id'];
        const userEmail = headers['x-user-email'];
        const userName = headers['x-user-name'];
        return this.transactionsService.remove(id, userId, userEmail, userName);
    }
}
