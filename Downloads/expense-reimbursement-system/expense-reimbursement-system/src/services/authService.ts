import { createUser, findUserByEmail, findUserById, toPublicUser } from '../repositories/userRepository';
import { hashPassword, verifyPassword } from '../utils/password';
import { signToken } from '../utils/jwt';
import { ConflictError, UnauthorizedError, BadRequestError } from '../utils/errors';
import { writeAuditLog } from '../repositories/auditRepository';

export async function register(input: {
  name: string;
  email: string;
  password: string;
  role: 'EMPLOYEE' | 'MANAGER';
  department: string;
  currency: string;
  managerId?: string;
}) {
  const existing = findUserByEmail(input.email);
  if (existing) throw new ConflictError('An account with this email already exists');

  if (input.managerId) {
    const manager = findUserById(input.managerId);
    if (!manager) throw new BadRequestError('managerId does not reference an existing user');
    if (manager.role !== 'MANAGER') throw new BadRequestError('managerId must reference a user with role MANAGER');
  } else if (input.role === 'EMPLOYEE') {
    throw new BadRequestError('managerId is required when registering an EMPLOYEE');
  }

  const passwordHash = await hashPassword(input.password);
  const user = createUser({ ...input, passwordHash });

  writeAuditLog({
    entityType: 'User',
    entityId: user.id,
    action: 'CREATE',
    performedBy: user.id,
    newState: toPublicUser(user),
  });

  const token = signToken({ sub: user.id, role: user.role, email: user.email });
  return { user: toPublicUser(user), token };
}

export async function login(email: string, password: string) {
  const user = findUserByEmail(email);
  if (!user) throw new UnauthorizedError('Invalid email or password');

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) throw new UnauthorizedError('Invalid email or password');

  const token = signToken({ sub: user.id, role: user.role, email: user.email });
  return { user: toPublicUser(user), token };
}

export function getProfile(userId: string) {
  const user = findUserById(userId);
  if (!user) throw new UnauthorizedError('User no longer exists');
  return toPublicUser(user);
}
