import type { CrmUserRole } from '@prisma/client';
import { AppError } from '../errors/AppError.js';
import { authRepository } from '../repositories/authRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { hashPassword } from '../utils/password.js';

const present = (user: Awaited<ReturnType<typeof userRepository.findById>> & {}) =>
  user && {
    id: user.id,
    email: user.email,
    name: user.name,
    mobile: user.mobile,
    role: user.role,
    roles: Array.from(new Set([user.role, ...user.roles.map((item) => item.role)])),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

export const userService = {
  async list() {
    return (await userRepository.list()).map((user) => present(user));
  },
  async create(input: {
    email: string;
    password: string;
    name: string;
    mobile?: string;
    role: CrmUserRole;
  }) {
    if (await userRepository.findByEmail(input.email.toLowerCase()))
      throw new AppError(409, 'Email already exists', 'EMAIL_CONFLICT');
    return present(
      await userRepository.create({
        email: input.email.toLowerCase(),
        passwordHash: await hashPassword(input.password),
        name: input.name,
        mobile: input.mobile || null,
        role: input.role,
      }),
    );
  },
  async update(
    id: number,
    input: {
      email?: string;
      password?: string;
      name?: string;
      mobile?: string;
      role?: CrmUserRole;
    },
  ) {
    if (!(await userRepository.findById(id)))
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    const { password, ...data } = input;
    return present(
      await userRepository.update(id, {
        ...data,
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      }),
    );
  },
  async remove(id: number, actorId: number) {
    if (id === actorId)
      throw new AppError(409, 'You cannot delete your own account', 'SELF_DELETE_BLOCKED');
    await authRepository.revokeUser('crm_user', id);
    try {
      await userRepository.delete(id);
    } catch {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }
  },
};
