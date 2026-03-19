import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentSystem, AGENT_EVENTS, type AgentSystemConfig } from '../core/AgentSystem.js';
import { EventBus } from '../core/EventBus.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('AgentSystem', () => {
  let agentSystem: AgentSystem;

  beforeEach(() => {
    agentSystem = new AgentSystem();
  });

  afterEach(async () => {
    await agentSystem.stop();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      expect(agentSystem).toBeDefined();
    });

    it('should create with custom config', () => {
      const config: AgentSystemConfig = {
        maxAgents: 5,
        heartbeatIntervalMs: 10000,
        defaultMode: 'cli',
      };
      const system = new AgentSystem(config);
      expect(system).toBeDefined();
    });

    it('should accept custom event bus', () => {
      const eventBus = new EventBus();
      const system = new AgentSystem({}, eventBus);
      expect(system).toBeDefined();
    });
  });

  describe('start/stop', () => {
    it('should start successfully', async () => {
      await agentSystem.start();
      expect(agentSystem.isActive()).toBe(true);
    });

    it('should not start twice', async () => {
      await agentSystem.start();
      await agentSystem.start();
      expect(agentSystem.isActive()).toBe(true);
    });

    it('should stop successfully', async () => {
      await agentSystem.start();
      await agentSystem.stop();
      expect(agentSystem.isActive()).toBe(false);
    });

    it('should not stop twice', async () => {
      await agentSystem.start();
      await agentSystem.stop();
      await agentSystem.stop();
      expect(agentSystem.isActive()).toBe(false);
    });

    it('should stop when not running', async () => {
      await agentSystem.stop();
      expect(agentSystem.isActive()).toBe(false);
    });
  });

  describe('agent registration', () => {
    it('should register an agent', async () => {
      await agentSystem.start();
      agentSystem.registerAgent('test-agent');
      expect(agentSystem.getAgentCount()).toBe(1);
    });

    it('should reject registration when at capacity', async () => {
      const config: AgentSystemConfig = { maxAgents: 1 };
      const system = new AgentSystem(config);
      await system.start();

      system.registerAgent('agent-1');

      expect(() => system.registerAgent('agent-2')).toThrow('Maximum number of agents');

      await system.stop();
    });

    it('should throw when registering duplicate agent', async () => {
      await agentSystem.start();
      agentSystem.registerAgent('test-agent');

      expect(() => agentSystem.registerAgent('test-agent')).toThrow('already registered');
    });

    it('should unregister an agent', async () => {
      await agentSystem.start();
      agentSystem.registerAgent('test-agent');
      agentSystem.unregisterAgent('test-agent');
      expect(agentSystem.getAgentCount()).toBe(0);
    });

    it('should throw when unregistering non-existent agent', async () => {
      await agentSystem.start();
      expect(() => agentSystem.unregisterAgent('non-existent')).toThrow('not found');
    });
  });

  describe('agent info', () => {
    it('should get agent info', async () => {
      await agentSystem.start();
      agentSystem.registerAgent('test-agent');

      const info = agentSystem.getAgentInfo('test-agent');
      expect(info).toBeDefined();
      expect(info?.id).toBe('test-agent');
    });

    it('should return undefined for non-existent agent', () => {
      const info = agentSystem.getAgentInfo('non-existent');
      expect(info).toBeUndefined();
    });

    it('should list all agents', async () => {
      await agentSystem.start();
      agentSystem.registerAgent('agent-1');
      agentSystem.registerAgent('agent-2');

      const agents = agentSystem.getAllAgents();
      expect(agents).toHaveLength(2);
    });

    it('should get agent by id', async () => {
      await agentSystem.start();
      agentSystem.registerAgent('test-agent');

      const agent = agentSystem.getAgent('test-agent');
      expect(agent).toBeDefined();
    });
  });

  describe('events', () => {
    it('should publish system started event', async () => {
      const eventBus = new EventBus();
      const system = new AgentSystem({}, eventBus);

      const eventSpy = vi.fn();
      eventBus.subscribe(AGENT_EVENTS.SYSTEM_STARTED, eventSpy);

      await system.start();

      expect(eventSpy).toHaveBeenCalled();
      await system.stop();
    });

    it('should publish system stopped event', async () => {
      const eventBus = new EventBus();
      const system = new AgentSystem({}, eventBus);

      const eventSpy = vi.fn();
      eventBus.subscribe(AGENT_EVENTS.SYSTEM_STOPPED, eventSpy);

      await system.start();
      await system.stop();

      expect(eventSpy).toHaveBeenCalled();
    });

    it('should publish agent registered event', async () => {
      const eventBus = new EventBus();
      const system = new AgentSystem({}, eventBus);

      const eventSpy = vi.fn();
      eventBus.subscribe(AGENT_EVENTS.AGENT_REGISTERED, eventSpy);

      await system.start();
      system.registerAgent('test-agent');

      expect(eventSpy).toHaveBeenCalled();
      await system.stop();
    });

    it('should get event bus', () => {
      const system = new AgentSystem();
      const eventBus = system.getEventBus();
      expect(eventBus).toBeDefined();
    });
  });

  describe('statistics', () => {
    it('should return system stats', async () => {
      await agentSystem.start();
      const stats = agentSystem.getStats();

      expect(stats).toHaveProperty('totalAgents');
      expect(stats).toHaveProperty('idleAgents');
      expect(stats).toHaveProperty('busyAgents');
      expect(stats).toHaveProperty('errorAgents');
      expect(stats).toHaveProperty('totalTasksExecuted');
      expect(stats).toHaveProperty('agentsByMode');
    });

    it('should track registered agents in stats', async () => {
      await agentSystem.start();
      agentSystem.registerAgent('agent-1');
      agentSystem.registerAgent('agent-2');

      const stats = agentSystem.getStats();
      expect(stats.totalAgents).toBe(2);
      expect(stats.idleAgents).toBe(2);
    });
  });

  describe('default mode', () => {
    it('should return default mode', () => {
      const system = new AgentSystem();
      const mode = system.getDefaultMode();
      expect(mode).toBe('http');
    });

    it('should use custom default mode', () => {
      const config: AgentSystemConfig = { defaultMode: 'cli' };
      const system = new AgentSystem(config);
      const mode = system.getDefaultMode();
      expect(mode).toBe('cli');
    });
  });

  describe('CLI agent', () => {
    it('should register CLI mode agent', async () => {
      await agentSystem.start();
      agentSystem.registerCliAgent('cli-agent');

      const info = agentSystem.getAgentInfo('cli-agent');
      expect(info?.mode).toBe('cli');
    });
  });
});
