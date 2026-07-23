import * as databaseOperations from '../legacy/api/db.functions.server.js';
import * as adsOperations from '../operations/advertisingOperations.js';
import * as mayaOperations from '../operations/mayaOperations.js';
import * as identityOperations from '../operations/identityOperations.js';
import * as careerOperations from '../operations/careerOperations.js';
import * as siteCompatibilityOperations from '../operations/siteCompatibilityOperations.js';
import * as journeyOperations from '../operations/journeyOperations.js';
import * as securityOperations from '../operations/securityOperations.js';
import type { OperationHandler, OperationMethod } from '../operations/defineOperation.js';
import * as marketingOperations from '../operations/marketingOperations.js';
import * as crmOperations from '../operations/crmOperations.js';
import * as aiOperations from '../operations/aiOperations.js';
import * as catalogOperations from '../operations/catalogOperations.js';
import * as vendorOperations from '../operations/vendorOperations.js';
import * as supportOperations from '../operations/supportOperations.js';
import * as emailTemplateOperations from '../operations/emailTemplateOperations.js';
import * as missionControlOperations from '../operations/missionControlOperations.js';
import * as protectedScreenOperations from '../operations/protectedScreenOperations.js';
import * as mayaOpsOperations from '../operations/mayaOpsOperations.js';
import * as travelOperations from '../operations/travelOperations.js';

export interface RegisteredOperation {
  name: string;
  method: OperationMethod;
  handler: OperationHandler;
  domain: 'database' | 'identity' | 'maya' | 'advertising' | 'careers';
}

function collect(
  source: Record<string, unknown>,
  domain: RegisteredOperation['domain'],
): RegisteredOperation[] {
  return Object.entries(source)
    .filter(([, value]) => {
      const candidate = value as Partial<OperationHandler>;
      return (
        typeof value === 'function' && ['GET', 'POST'].includes(String(candidate.operationMethod))
      );
    })
    .map(([name, value]) => {
      const handler = value as OperationHandler;
      return { name, handler, method: handler.operationMethod, domain };
    });
}

const operations = [
  ...collect(databaseOperations, 'database'),
  ...collect(identityOperations, 'identity'),
  ...collect(mayaOperations, 'maya'),
  ...collect(adsOperations, 'advertising'),
  ...collect(careerOperations, 'careers'),
  ...collect(siteCompatibilityOperations, 'database'),
  ...collect(journeyOperations, 'database'),
  ...collect(securityOperations, 'database'),
  ...collect(marketingOperations, 'database'),
  ...collect(crmOperations, 'database'),
  ...collect(aiOperations, 'database'),
  ...collect(catalogOperations, 'database'),
  ...collect(vendorOperations, 'database'),
  ...collect(supportOperations, 'database'),
  ...collect(emailTemplateOperations, 'database'),
  ...collect(missionControlOperations, 'database'),
  ...collect(protectedScreenOperations, 'database'),
  ...collect(mayaOpsOperations, 'maya'),
  ...collect(travelOperations, 'database'),
];

const byName = new Map(operations.map((operation) => [operation.name, operation]));

export const operationRepository = {
  list: () => [...operations],
  findByName: (name: string) => byName.get(name),
};
