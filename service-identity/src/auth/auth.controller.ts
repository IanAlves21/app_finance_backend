import { Body, Controller, Post } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';

@Controller('auth')
export class AuthController {
    constructor(
        private authService: AuthService,
        private usersService: UsersService,
    ) {}

    @Post('register')
    async register(@Body() registerDto: RegisterDto) {
        return this.usersService.create(registerDto);
    }

    @Post('login')
    async login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto.email, loginDto.password);
    }

    @Post('google')
    async googleLogin(@Body() googleLoginDto: GoogleLoginDto) {
        return this.authService.loginGoogle(googleLoginDto.idToken);
    }
}
