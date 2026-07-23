import { platformPrisma } from '../config/platformPrisma.js';

export const healthRepository = {
  async ping() {
    await platformPrisma.$connect();
  },
};
