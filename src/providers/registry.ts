import type { Provider } from "./provider.js";

export class ProviderRegistry {
  private readonly providers = new Map<string, Provider>();

  register(provider: Provider): void {
    if (this.providers.has(provider.descriptor.id)) {
      throw new Error(`Provider already registered: ${provider.descriptor.id}`);
    }
    this.providers.set(provider.descriptor.id, provider);
  }

  get(id: string): Provider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Unknown provider: ${id}`);
    return provider;
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  list(): Provider[] {
    return [...this.providers.values()];
  }

  cheapestWith(capability: import("./provider.js").ProviderCapability, vendor?: string): Provider | undefined {
    return this.list()
      .filter((provider) => provider.descriptor.capabilities.includes(capability))
      .filter((provider) => vendor === undefined || provider.descriptor.vendor === vendor)
      .sort((a, b) => a.descriptor.relativeCost - b.descriptor.relativeCost)[0];
  }
}
