import { platformPrisma } from '../src/config/platformPrisma.js';
import { planCatalogService } from '../src/services/planCatalogService.js';

const administrator = await platformPrisma.platformOperator.findFirst({
  where: { role: 'platform_admin', status: 'active' },
  orderBy: { createdAt: 'asc' },
});
if (!administrator)
  throw new Error('Create an active platform administrator before seeding catalog v1');
const catalog = await planCatalogService.ensureVersionOne(administrator.id);
process.stdout.write(`Published plan catalog v${catalog.version} (${catalog.id})\n`);
await platformPrisma.$disconnect();
