import { ConnectionState, createConnectionStore, type ConnectionStore } from './connection';
import { KairoClient } from './client';
import { ResilientTransportAdapter } from './resilient-transport';
import type { KairoSession } from './session';

export interface ComputerProfile {
  id: string;
  name: string;
  url: string;
  relayUrl?: string;
  color: string;
}

export interface ComputerInstance {
  profile: ComputerProfile;
  client: KairoClient;
  transport: ResilientTransportAdapter;
  store: {
    getState: () => ConnectionStore;
    subscribe: (listener: (state: ConnectionStore) => void) => () => void;
  };
  session: KairoSession | null;
}

export class ComputerManager {
  private instances = new Map<string, ComputerInstance>();
  private activeId: string;
  private listeners = new Set<() => void>();

  constructor(initialProfiles: ComputerProfile[]) {
    const profiles =
      initialProfiles.length > 0
        ? initialProfiles
        : [
            {
              id: 'primary',
              name: 'Primary Dev VPS',
              url: 'ws://127.0.0.1:9600',
              color: '#6366f1',
            },
          ];

    this.activeId = profiles[0].id;
    for (const p of profiles) {
      this.createInstance(p);
    }
  }

  private createInstance(profile: ComputerProfile): ComputerInstance {
    const store = createConnectionStore();
    const transport = new ResilientTransportAdapter({
      primaryUrl: profile.url,
      fallbackUrls: profile.relayUrl ? [profile.relayUrl] : [],
      connectionStore: store,
      onReconnected: async () => {
        try {
          const session = await client.connect(profile.url);
          instance.session = session;
          this.notify();
        } catch {}
      },
    });
    const client = new KairoClient({
      transport,
      connectionStore: store,
      clientId: `kairo-host-${profile.id}`,
    });

    const instance: ComputerInstance = {
      profile,
      client,
      transport,
      store,
      session: null,
    };

    store.subscribe((curr) => {
      if (curr.state === ConnectionState.Disconnected) {
        instance.session = null;
      }
      this.notify();
    });

    this.instances.set(profile.id, instance);
    return instance;
  }

  getProfiles(): ComputerProfile[] {
    return Array.from(this.instances.values()).map((inst) => inst.profile);
  }

  getInstance(id: string): ComputerInstance | undefined {
    return this.instances.get(id);
  }

  getActiveInstance(): ComputerInstance {
    const inst = this.instances.get(this.activeId);
    if (inst) return inst;
    const first = Array.from(this.instances.values())[0];
    if (first) {
      this.activeId = first.profile.id;
      return first;
    }
    return this.addComputer({
      id: 'default',
      name: 'Primary Dev VPS',
      url: 'ws://127.0.0.1:9600',
      color: '#6366f1',
    });
  }

  getActiveId(): string {
    return this.activeId;
  }

  setActiveId(id: string): void {
    if (this.instances.has(id)) {
      this.activeId = id;
      this.notify();
    }
  }

  addComputer(profile: ComputerProfile): ComputerInstance {
    if (this.instances.has(profile.id)) {
      return this.instances.get(profile.id)!;
    }
    const inst = this.createInstance(profile);
    this.notify();
    return inst;
  }

  removeComputer(id: string): void {
    const inst = this.instances.get(id);
    if (!inst) return;
    inst.client.disconnect().catch(() => {});
    this.instances.delete(id);
    if (this.activeId === id) {
      const remaining = Array.from(this.instances.keys());
      if (remaining.length > 0) {
        this.activeId = remaining[0];
      }
    }
    this.notify();
  }

  async connect(id: string): Promise<KairoSession> {
    const inst = this.instances.get(id);
    if (!inst) {
      throw new Error(`Computer with id "${id}" not found`);
    }
    const session = await inst.client.connect(inst.profile.url);
    inst.session = session;
    this.notify();
    return session;
  }

  async disconnect(id: string): Promise<void> {
    const inst = this.instances.get(id);
    if (!inst) return;
    await inst.client.disconnect();
    inst.session = null;
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) {
      l();
    }
  }
}
