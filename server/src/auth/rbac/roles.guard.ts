import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthPrincipal } from '../sessions/auth-principal';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<
      Array<AuthPrincipal['role']>
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    const principal = context
      .switchToHttp()
      .getRequest<{ user?: AuthPrincipal }>().user;
    if (!principal || !roles.includes(principal.role))
      throw new ForbiddenException();
    return true;
  }
}
