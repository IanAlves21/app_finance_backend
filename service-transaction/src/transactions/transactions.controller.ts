import { Body, Controller, Delete, Get, Param, Patch, Post, Headers, Query } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
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
    findAll(@Headers() headers: Record<string, string>, @Query('page') page?: string, @Query('limit') limit?: string) {
        const userId = headers['x-user-id'];
        const userEmail = headers['x-user-email'];
        const userName = headers['x-user-name'];
        const pageNumber = page ? parseInt(page, 10) : undefined;
        const limitNumber = limit ? parseInt(limit, 10) : undefined;
        return this.transactionsService.findAll(userId, userEmail, userName, pageNumber, limitNumber);
    }
    @Get(':id')
    findOne(@Param('id') id: string) {
        // Removemos o "+" porque nosso ID é uma String (UUID)
        return this.transactionsService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string) {
        return this.transactionsService.update(id);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.transactionsService.remove(id);
    }
}
