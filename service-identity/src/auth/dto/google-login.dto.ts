import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
    @IsString()
    @IsNotEmpty({ message: 'O idToken do Google é obrigatório' })
    idToken!: string;
}
