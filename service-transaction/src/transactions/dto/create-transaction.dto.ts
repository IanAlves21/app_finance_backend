import { IsEnum, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TransactionType, PaymentMethod } from '@prisma/client';

export class CreateTransactionDto {
    @IsString()
    @IsNotEmpty({ message: 'A descrição é obrigatória' })
    description!: string;

    @IsNumber({}, { message: 'O valor deve ser um número' })
    @Min(0.01, { message: 'O valor deve ser maior que zero' })
    amount!: number;

    @IsEnum(TransactionType, { message: 'O tipo da transação deve ser INCOME ou EXPENSE' })
    type!: TransactionType;

    @IsEnum(PaymentMethod, { message: 'O método de pagamento deve ser CREDIT, DEBIT, PIX ou CASH' })
    @IsOptional()
    paymentMethod?: PaymentMethod;

    @IsNumber({}, { message: 'A quantidade de parcelas deve ser um número' })
    @Min(1, { message: 'A quantidade de parcelas deve ser pelo menos 1' })
    @IsOptional()
    installments?: number;

    @IsISO8601({}, { message: 'A data deve estar no formato ISO 8601' })
    date!: string;

    @IsString()
    @IsOptional()
    categoryId?: string;

    @IsString()
    @IsOptional()
    walletId?: string;

    @IsString()
    @IsOptional()
    paidById?: string;

    @IsString()
    @IsOptional()
    familyId?: string;
}
