import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';

describe('RolesGuard', () => {
  const context = (user?: { role: 'USER' | 'ADMIN' }) =>
    ({
      getHandler: () => 'handler',
      getClass: () => 'class',
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as any;

  it('allows a principal whose role is required by the route', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['ADMIN']),
    } as unknown as Reflector;

    expect(
      new RolesGuard(reflector).canActivate(context({ role: 'ADMIN' })),
    ).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      'handler',
      'class',
    ]);
  });

  it('rejects a principal whose role is not required by the route', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['ADMIN']),
    } as unknown as Reflector;

    expect(() =>
      new RolesGuard(reflector).canActivate(context({ role: 'USER' })),
    ).toThrow(ForbiddenException);
  });
});
