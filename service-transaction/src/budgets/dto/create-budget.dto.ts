import { IsNotEmpty, IsNumber, IsUUID, Max, Min } from 'class-validator';

export class CreateBudgetDto {
    @IsNotEmpty()
    @IsNumber()
    @Min(0.01)
    amount: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(1)
    @Max(12)
    month: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(2000)
    @Max(2100)
    year: number;

    @IsNotEmpty()
    @IsUUID()
    categoryId: string;
}
