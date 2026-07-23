import {
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { env } from '../config/env.js';
import { decryptTenantCredential, encryptTenantCredential } from '../utils/tenantCredentials.js';

const client = new SecretsManagerClient({ region: env.aws.region });

function secretName(tenantId: string, provider: string) {
  const safeProvider = provider
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 50);
  return `moonsconfig/tenants/${tenantId}/providers/${safeProvider}`;
}

export const secretStore = {
  async put(tenantId: string, provider: string, value: Record<string, string>) {
    const payload = JSON.stringify(value);
    if (env.secretsBackend === 'local') return `local:${encryptTenantCredential(payload)}`;
    const name = secretName(tenantId, provider);
    try {
      const created = await client.send(
        new CreateSecretCommand({
          Name: name,
          SecretString: payload,
          Tags: [{ Key: 'tenantId', Value: tenantId }],
        }),
      );
      if (!created.ARN) throw new Error('Secrets Manager did not return an ARN');
      return created.ARN;
    } catch (error) {
      if ((error as { name?: string }).name !== 'ResourceExistsException') throw error;
      const updated = await client.send(
        new PutSecretValueCommand({ SecretId: name, SecretString: payload }),
      );
      return updated.ARN || name;
    }
  },

  async get(reference: string) {
    if (reference.startsWith('local:')) {
      return JSON.parse(decryptTenantCredential(reference.slice('local:'.length))) as Record<
        string,
        string
      >;
    }
    const response = await client.send(new GetSecretValueCommand({ SecretId: reference }));
    if (!response.SecretString) throw new Error('Secret has no string value');
    return JSON.parse(response.SecretString) as Record<string, string>;
  },

  async remove(reference: string) {
    if (reference.startsWith('local:')) return;
    await client.send(new DeleteSecretCommand({ SecretId: reference, RecoveryWindowInDays: 7 }));
  },
};
