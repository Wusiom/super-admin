import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type UserChange = {
  role?: 'USER' | 'ADMIN';
  status?: 'ACTIVE' | 'DISABLED';
};

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateUser(id: number, changes: UserChange) {
    return this.prisma.$transaction(
      async (transaction) => {
        const user = await transaction.user.findUnique({ where: { id } });
        if (!user) throw new NotFoundException('User not found');

        const removesLastEnabledAdmin =
          user.role === 'ADMIN' &&
          user.status === 'ACTIVE' &&
          (changes.role === 'USER' || changes.status === 'DISABLED');
        if (removesLastEnabledAdmin) {
          const enabledAdminCount = await transaction.user.count({
            where: { role: 'ADMIN', status: 'ACTIVE' },
          });
          if (enabledAdminCount <= 1) {
            throw new ConflictException(
              'At least one enabled administrator is required',
            );
          }
        }

        return transaction.user.update({ where: { id }, data: changes });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
