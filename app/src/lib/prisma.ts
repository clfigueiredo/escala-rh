import { PrismaClient } from '@prisma/client';

/** Client Prisma único do processo (API ou worker). */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export type { Prisma } from '@prisma/client';
