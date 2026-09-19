/**
 * In-memory fake repositories for deterministic unit testing.
 * These implement the same interface as the real repositories
 * but store data in memory arrays.
 */

const Service = require('../../src/domain/entities/Service');
const Dependency = require('../../src/domain/entities/Dependency');
const TelemetryEvent = require('../../src/domain/entities/TelemetryEvent');
const Incident = require('../../src/domain/entities/Incident');
const IncidentEvent = require('../../src/domain/entities/IncidentEvent');
const Deployment = require('../../src/domain/entities/Deployment');

class FakeServiceRepository {
  constructor() { this._store = []; }
  async findById(serviceId) {
    return this._store.find((s) => s.serviceId === serviceId) || null;
  }
  async findByName(name, environment) {
    return this._store.find((s) => s.name === name && (environment === undefined || s.environment === environment)) || null;
  }
  async findAll() { return [...this._store]; }
  async save(service) {
    this._store.push(service);
    return service;
  }
  async upsert(service) {
    const existing = this._store.find((s) => s.name === service.name && s.environment === service.environment);
    if (existing) {
      existing.version = service.version;
      return existing;
    }
    this._store.push(service);
    return service;
  }
  async deleteAll() { this._store = []; }
}

class FakeDependencyRepository {
  constructor() { this._store = []; }
  async findById(id) {
    return this._store.find((d) => d.dependencyId === id) || null;
  }
  async findBySource(sourceId) {
    return this._store.filter((d) => d.sourceServiceId === sourceId);
  }
  async findByTarget(targetId) {
    return this._store.filter((d) => d.targetServiceId === targetId);
  }
  async findAll() { return [...this._store]; }
  async save(dep) {
    this._store.push(dep);
    return dep;
  }
  async upsert(dep, counters = {}) {
    const key = `${dep.sourceServiceId}:${dep.targetServiceId}:${dep.dependencyType}`;
    const existing = this._store.find((d) => d.getCompositeKey() === key);
    if (existing) {
      existing.requestCount += 1;
      if (counters.failed) existing.failureCount += 1;
      existing.lastSeenAt = new Date();
      return existing;
    }
    dep.requestCount = 1;
    if (counters.failed) dep.failureCount = 1;
    this._store.push(dep);
    return dep;
  }
  async deleteAll() { this._store = []; }
}

class FakeTelemetryRepository {
  constructor() { this._store = []; }
  async save(event) {
    this._store.push(event);
    return event;
  }
  async findByTimeRange(start, end) {
    return this._store
      .filter((e) => e.timestamp >= start && e.timestamp <= end)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
  async findByService(name, opts = {}) {
    const { role = 'any', limit = 100 } = opts;
    let results;
    if (role === 'source') results = this._store.filter((e) => e.sourceService === name);
    else if (role === 'target') results = this._store.filter((e) => e.targetService === name);
    else results = this._store.filter((e) => e.sourceService === name || e.targetService === name);
    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit);
  }
  async findByTraceId(traceId) {
    return this._store.filter((e) => e.traceId === traceId).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
  async deleteAll() { this._store = []; }
}

class FakeIncidentRepository {
  constructor() { this._store = []; }
  async findById(id) { return this._store.find((i) => i.incidentId === id) || null; }
  async findAll() { return [...this._store].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()); }
  async findByStatus(status) { return this._store.filter((i) => i.status === status); }
  async save(incident) {
    this._store.push(incident);
    return incident;
  }
  async update(incident) {
    const idx = this._store.findIndex((i) => i.incidentId === incident.incidentId);
    if (idx >= 0) this._store[idx] = incident;
    return incident;
  }
  async deleteAll() { this._store = []; }
}

class FakeIncidentEventRepository {
  constructor() { this._store = []; }
  async save(event) {
    this._store.push(event);
    return event;
  }
  async findByIncidentId(incidentId) {
    return this._store
      .filter((e) => e.incidentId === incidentId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
  async findByServiceId(serviceId) {
    return this._store.filter((e) => e.serviceId === serviceId);
  }
  async deleteAll() { this._store = []; }
}

class FakeDeploymentRepository {
  constructor() { this._store = []; }
  async findById(id) { return this._store.find((d) => d.deploymentId === id) || null; }
  async findByService(serviceId) {
    return this._store
      .filter((d) => d.serviceId === serviceId)
      .sort((a, b) => b.deployedAt.getTime() - a.deployedAt.getTime());
  }
  async findAll() { return [...this._store]; }
  async save(dep) {
    this._store.push(dep);
    return dep;
  }
  async deleteAll() { this._store = []; }
}

class FakeEventBus {
  constructor() { this.published = []; this._handlers = new Map(); }
  subscribe(type, handler) {
    if (!this._handlers.has(type)) this._handlers.set(type, []);
    this._handlers.get(type).push(handler);
  }
  async publish(type, payload) {
    this.published.push({ type, payload });
    const handlers = this._handlers.get(type) || [];
    for (const h of handlers) { await h(payload); }
  }
  clear() { this.published = []; this._handlers.clear(); }
}

module.exports = {
  FakeServiceRepository,
  FakeDependencyRepository,
  FakeTelemetryRepository,
  FakeIncidentRepository,
  FakeIncidentEventRepository,
  FakeDeploymentRepository,
  FakeEventBus,
};
