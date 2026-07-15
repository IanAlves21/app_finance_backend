import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
    @IsString()
    @IsNotEmpty({ message: 'O nome é obrigatório' })
    name!: string;

    @IsEmail({}, { message: 'Por favor, insira um e-mail válido' })
    @IsNotEmpty({ message: 'O e-mail é obrigatório' })
    email!: string;

    @IsString()
    @IsNotEmpty({ message: 'A senha é obrigatória' })
    @MinLength(6, { message: 'A senha deve ter pelo menos 6 caracteres' })
    password!: string;
}
