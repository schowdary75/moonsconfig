import { prismaQueryRepository } from '../repositories/prismaQueryRepository.js';
import { sqlRepository } from '../repositories/sqlRepository.js';

export function getDbPool(): any {
  return sqlRepository;
}

export function getDb(): any {
  return prismaQueryRepository;
}
