import { IsEnum, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TransactionType } from '@prisma/client';

export class CreateTransactionDto {
    @IsString()
    @IsNotEmpty({ message: 'A descrição é obrigatória' })
    description!: string;

    @IsNumber({}, { message: 'O valor deve ser um número' })
    @Min(0.01, { message: 'O valor deve ser maior que zero' })
    amount!: number;

    @IsEnum(TransactionType, { message: 'O tipo da transação deve ser INCOME ou EXPENSE' })
    type!: TransactionType;

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
