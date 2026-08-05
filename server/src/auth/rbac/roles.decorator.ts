import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const PUBLIC_KEY = 'public';

export const Roles = (...roles: Array<'USER' | 'ADMIN'>) =>
  SetMetadata(ROLES_KEY, roles);

export const Public = () => SetMetadata(PUBLIC_KEY, true);
