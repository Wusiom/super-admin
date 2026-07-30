import { Transform, TransformFnParams } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(12)
  password: string;
}

export class EmailDto {
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail()
  email: string;
}

export class TokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
