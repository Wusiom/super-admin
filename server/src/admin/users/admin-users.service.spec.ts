import { ConflictException } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  it('does not disable the last enabled administrator', async () => {
    const transaction = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 1, role: 'ADMIN', status: 'ACTIVE' }),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn((fn) => fn(transaction)) };
    const service = new AdminUsersService(prisma as any);

    await expect(service.updateUser(1, { status: 'DISABLED' })).rejects.toThrow(
      ConflictException,
    );
    expect(transaction.user.update).not.toHaveBeenCalled();
  });

  it('updates a non-final administrator inside the transaction', async () => {
    const transaction = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 1, role: 'ADMIN', status: 'ACTIVE' }),
        count: jest.fn().mockResolvedValue(2),
        update: jest.fn().mockResolvedValue({ id: 1, status: 'DISABLED' }),
      },
    };
    const prisma = { $transaction: jest.fn((fn) => fn(transaction)) };
    const service = new AdminUsersService(prisma as any);

    await expect(
      service.updateUser(1, { status: 'DISABLED' }),
    ).resolves.toEqual({ id: 1, status: 'DISABLED' });
    expect(transaction.user.count).toHaveBeenCalledWith({
      where: { role: 'ADMIN', status: 'ACTIVE' },
    });
  });
});
