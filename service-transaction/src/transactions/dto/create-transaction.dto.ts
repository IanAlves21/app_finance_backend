import { TransactionType } from '@prisma/client';

export class CreateTransactionDto {
    description!: string;
    amount!: number;
    type!: TransactionType;
    date!: string;
    categoryId?: string;
    walletId?: string;
    paidById?: string;
    familyId?: string;
}
