jest.mock('puppeteer', () => {
    return {
        launch: jest.fn().mockResolvedValue({
            newPage: jest.fn().mockResolvedValue({
                setContent: jest.fn().mockResolvedValue(undefined),
                pdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
                close: jest.fn().mockResolvedValue(undefined),
            }),
            close: jest.fn().mockResolvedValue(undefined),
        }),
    };
});

import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import * as express from 'express';

describe('AnalyticsController', () => {
    let controller: AnalyticsController;
    let service: AnalyticsService;

    const mockAnalyticsService = {
        getMonthlySpending: jest.fn(),
        generateReportPdf: jest.fn(),
        handleTransactionCreatedOrUpdated: jest.fn(),
        handleTransactionDeleted: jest.fn(),
        syncCategory: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [AnalyticsController],
            providers: [
                { provide: AnalyticsService, useValue: mockAnalyticsService },
            ],
        }).compile();

        controller = module.get<AnalyticsController>(AnalyticsController);
        service = module.get<AnalyticsService>(AnalyticsService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('getMonthlySpending', () => {
        it('should call service with header parameters', async () => {
            const headers = {
                'x-user-id': 'user-1',
                'x-user-email': 'test@example.com',
                'x-user-name': 'User%20One',
            };

            await controller.getMonthlySpending(headers, '12', 'YEARLY');

            expect(mockAnalyticsService.getMonthlySpending).toHaveBeenCalledWith(
                'user-1',
                'test@example.com',
                'User%20One',
                12,
                'YEARLY',
            );
        });
    });

    describe('getReportPdf', () => {
        it('should call generateReportPdf and stream it to express.Response', async () => {
            const headers = {
                'x-user-id': 'user-1',
                'x-user-email': 'test@example.com',
                'x-user-name': 'User One',
                'accept-language': 'pt',
            };

            const mockRes = {
                set: jest.fn(),
                end: jest.fn(),
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
            } as unknown as express.Response;

            mockAnalyticsService.generateReportPdf.mockResolvedValue(Buffer.from('mock-pdf'));

            await controller.getReportPdf('2026-07-01', '2026-07-31', headers, mockRes);

            expect(mockAnalyticsService.generateReportPdf).toHaveBeenCalledWith(
                '2026-07-01',
                '2026-07-31',
                'user-1',
                'test@example.com',
                'User One',
                'pt',
            );
            expect(mockRes.set).toHaveBeenCalled();
            expect(mockRes.end).toHaveBeenCalled();
        });

        it('should return 500 error if PDF generation fails', async () => {
            const headers = {
                'x-user-id': 'user-1',
                'x-user-email': 'test@example.com',
                'x-user-name': 'User One',
                'accept-language': 'pt',
            };

            const mockRes = {
                set: jest.fn(),
                end: jest.fn(),
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
            } as unknown as express.Response;

            mockAnalyticsService.generateReportPdf.mockRejectedValue(new Error('Puppeteer error'));

            await controller.getReportPdf('2026-07-01', '2026-07-31', headers, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalled();
        });
    });

    describe('RabbitMQ Consumers', () => {
        it('handleTransactionCreated should call service', async () => {
            const data: any = { id: 'tx-1' };
            await controller.handleTransactionCreated(data);
            expect(mockAnalyticsService.handleTransactionCreatedOrUpdated).toHaveBeenCalledWith(data);
        });

        it('handleTransactionUpdated should call service', async () => {
            const data: any = { id: 'tx-1' };
            await controller.handleTransactionUpdated(data);
            expect(mockAnalyticsService.handleTransactionCreatedOrUpdated).toHaveBeenCalledWith(data);
        });

        it('handleTransactionDeleted should call service', async () => {
            const data = { id: 'tx-1' };
            await controller.handleTransactionDeleted(data);
            expect(mockAnalyticsService.handleTransactionDeleted).toHaveBeenCalledWith('tx-1');
        });

        it('handleCategoryCreated should call service', async () => {
            const data: any = { id: 'cat-1' };
            await controller.handleCategoryCreated(data);
            expect(mockAnalyticsService.syncCategory).toHaveBeenCalledWith(data);
        });

        it('handleCategoryUpdated should call service', async () => {
            const data: any = { id: 'cat-1' };
            await controller.handleCategoryUpdated(data);
            expect(mockAnalyticsService.syncCategory).toHaveBeenCalledWith(data);
        });
    });
});
