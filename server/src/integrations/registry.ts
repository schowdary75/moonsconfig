export interface IntegrationAdapter {
  readonly name: string;
  sync(): Promise<{ processed: number; details?: Record<string, unknown> }>;
}

const adapters = new Map<string, IntegrationAdapter>();
export const integrationRegistry = {
  register(adapter: IntegrationAdapter) {
    adapters.set(adapter.name, adapter);
  },
  list() {
    return Array.from(adapters.values());
  },
};
