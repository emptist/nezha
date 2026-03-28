import { EventEmitter } from 'events';

export interface ServiceInstance {
  id: string;
  name: string;
  host: string;
  port: number;
  healthCheck: string;
  metadata?: Record<string, string>;
}

export class ServiceRegistry extends EventEmitter {
  private services: Map<string, ServiceInstance[]> = new Map();
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();

  async register(instance: ServiceInstance): Promise<void> {
    const services = this.services.get(instance.name) || [];
    services.push(instance);
    this.services.set(instance.name, services);

    this.startHeartbeat(instance);
    this.emit('registered', instance);
    console.log(`Service registered: ${instance.name} at ${instance.host}:${instance.port}`);
  }

  async deregister(instanceId: string): Promise<void> {
    for (const [name, instances] of this.services.entries()) {
      const filtered = instances.filter(i => i.id !== instanceId);
      if (filtered.length !== instances.length) {
        this.services.set(name, filtered);
        this.emit('deregistered', instanceId);
        return;
      }
    }
  }

  async getService(name: string): Promise<string | null> {
    const instances = this.services.get(name);
    if (!instances || instances.length === 0) return null;

    const healthy = instances[Math.floor(Math.random() * instances.length)];
    return `http://${healthy.host}:${healthy.port}`;
  }

  async getAllServices(): Promise<Map<string, ServiceInstance[]>> {
    return this.services;
  }

  private startHeartbeat(instance: ServiceInstance): void {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(
          `http://${instance.host}:${instance.port}${instance.healthCheck}`
        );
        if (!response.ok) {
          await this.deregister(instance.id);
        }
      } catch {
        await this.deregister(instance.id);
      }
    }, 30000);

    this.heartbeatIntervals.set(instance.id, interval);
  }
}

export class ServiceDiscovery {
  private registry: ServiceRegistry;

  constructor(registry: ServiceRegistry) {
    this.registry = registry;
  }

  async discover(serviceName: string): Promise<ServiceInstance[]> {
    return this.registry.getAllServices().then(s => s.get(serviceName) || []);
  }
}
