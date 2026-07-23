export interface IntegrationAdapter {
  readonly name: string;
  sync(): Promise<{ processed: number; details?: Record<string, unknown> }>;
}

export interface IntegrationRegistry {
  register(adapter: IntegrationAdapter): void;
  list(): IntegrationAdapter[];
}

export function createIntegrationRegistry(): IntegrationRegistry {
  const adapters = new Map<string, IntegrationAdapter>();

  return {
    register(adapter) {
      adapters.set(adapter.name, adapter);
    },
    list() {
      return Array.from(adapters.values());
    },
  };
}

export const integrationRegistry = createIntegrationRegistry();
