import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString() @IsNotEmpty() email: string;
  @IsString() @IsNotEmpty() password: string;
}

export class ResetPasswordDto {
  @IsString() @IsNotEmpty() token: string;
  @IsString() @MinLength(12) password: string;
}
