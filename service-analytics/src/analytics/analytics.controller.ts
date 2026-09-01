import { Controller, Get, Headers, Query, Res } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import type { Category, Budget } from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import type { RichTransactionEvent } from './analytics.service';
import * as express from 'express';

@Controller('analytics')
export class AnalyticsController {
    constructor(private readonly analyticsService: AnalyticsService) {}

    @Get('monthly-spending')
    getMonthlySpending(
        @Headers() headers: Record<string, string>,
        @Query('limit') limit?: string,
        @Query('timeframe') timeframe?: string,
    ) {
        const userId = headers['x-user-id'];
        const userEmail = headers['x-user-email'];
        const userName = headers['x-user-name'];
        const limitNumber = limit ? parseInt(limit, 10) : 6;
        return this.analyticsService.getMonthlySpending(
            userId,
            userEmail,
            userName,
            limitNumber,
            timeframe || 'MONTHLY',
        );
    }

    @Get('report/pdf')
    async getReportPdf(
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
        @Headers() headers: Record<string, string>,
        @Res() res: express.Response,
    ) {
        const userId = headers['x-user-id'];
        const userEmail = headers['x-user-email'];
        const userName = headers['x-user-name'];
        const acceptLanguage = headers['accept-language'];

        try {
            const pdfBuffer = await this.analyticsService.generateReportPdf(
                startDate,
                endDate,
                userId,
                userEmail,
                userName,
                acceptLanguage,
            );

            res.set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="Relatorio_Financeiro_${startDate}_${endDate}.pdf"`,
                'Content-Length': pdfBuffer.length,
            });

            res.end(pdfBuffer);
        } catch (error) {
            console.error('Erro ao gerar relatório PDF:', error);
            res.status(500).json({
                statusCode: 500,
                message: 'Erro interno ao gerar relatório PDF.',
            });
        }
    }

    // -------------------------------------------------------------------------
    // RABBITMQ EVENT CONSUMERS (MENSAGERIA)
    // -------------------------------------------------------------------------

    @EventPattern('transaction.created')
    async handleTransactionCreated(@Payload() data: RichTransactionEvent) {
        console.log(`[Analytics Message Consumer] 📥 Recebeu: transaction.created para id: ${data.id}`);
        await this.analyticsService.handleTransactionCreatedOrUpdated(data);
    }

    @EventPattern('transaction.updated')
    async handleTransactionUpdated(@Payload() data: RichTransactionEvent) {
        console.log(`[Analytics Message Consumer] 📥 Recebeu: transaction.updated para id: ${data.id}`);
        await this.analyticsService.handleTransactionCreatedOrUpdated(data);
    }

    @EventPattern('transaction.deleted')
    async handleTransactionDeleted(@Payload() data: { id: string }) {
        console.log(`[Analytics Message Consumer] 📥 Recebeu: transaction.deleted para id: ${data.id}`);
        await this.analyticsService.handleTransactionDeleted(data.id);
    }

    @EventPattern('category.created')
    async handleCategoryCreated(@Payload() data: Category) {
        console.log(`[Analytics Message Consumer] 📥 Recebeu: category.created para id: ${data.id}`);
        await this.analyticsService.syncCategory(data);
    }

    @EventPattern('category.updated')
    async handleCategoryUpdated(@Payload() data: Category) {
        console.log(`[Analytics Message Consumer] 📥 Recebeu: category.updated para id: ${data.id}`);
        await this.analyticsService.syncCategory(data);
    }

    @EventPattern('category.deleted')
    async handleCategoryDeleted(@Payload() data: { id: string }) {
        console.log(`[Analytics Message Consumer] 📥 Recebeu: category.deleted para id: ${data.id}`);
        await this.analyticsService.deleteCategoryLocal(data.id);
    }

    @EventPattern('budget.upserted')
    async handleBudgetUpserted(@Payload() data: Budget) {
        console.log(`[Analytics Message Consumer] 📥 Recebeu: budget.upserted para id: ${data.id}`);
        await this.analyticsService.syncBudget(data);
    }

    @EventPattern('budget.deleted')
    async handleBudgetDeleted(@Payload() data: { id: string }) {
        console.log(`[Analytics Message Consumer] 📥 Recebeu: budget.deleted para id: ${data.id}`);
        await this.analyticsService.deleteBudgetLocal(data.id);
    }
}
