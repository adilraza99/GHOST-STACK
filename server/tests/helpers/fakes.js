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
const ApiKey = require('../../src/domain/entities/ApiKey');
const Project = require('../../src/domain/entities/Project');

class FakeServiceRepository {
  constructor() { this._store = []; }
  async findById(serviceId) {
    return this._store.find((s) => s.serviceId === serviceId) || null;
  }
  async findByName(name, environment, projectId) {
    return this._store.find((s) =>
      s.name === name &&
      (environment === undefined || s.environment === environment) &&
      (projectId === undefined || (s.projectId || 'project-default') === projectId)
    ) || null;
  }
  async findAll(filter = {}) {
    return this._store.filter((s) => {
      if (filter.projectId !== undefined && (s.projectId || 'project-default') !== filter.projectId) return false;
      if (filter.environment !== undefined && s.environment !== filter.environment) return false;
      return true;
    });
  }
  async save(service) {
    this._store.push(service);
    return service;
  }
  async upsert(service) {
    const proj = service.projectId || 'project-default';
    const existing = this._store.find((s) =>
      s.name === service.name &&
      s.environment === service.environment &&
      (s.projectId || 'project-default') === proj
    );
    if (existing) {
      existing.version = service.version;
      existing.metadata = { ...service.metadata };
      return existing;
    }
    this._store.push(service);
    return service;
  }
  async deleteAll(projectId) {
    if (projectId) {
      this._store = this._store.filter((s) => (s.projectId || 'project-default') !== projectId);
    } else {
      this._store = [];
    }
  }
}

class FakeDependencyRepository {
  constructor() { this._store = []; }
  async findById(id) {
    return this._store.find((d) => d.dependencyId === id) || null;
  }
  async findBySource(sourceId, projectId) {
    return this._store.filter((d) =>
      d.sourceServiceId === sourceId &&
      (projectId === undefined || (d.projectId || 'project-default') === projectId)
    );
  }
  async findByTarget(targetId, projectId) {
    return this._store.filter((d) =>
      d.targetServiceId === targetId &&
      (projectId === undefined || (d.projectId || 'project-default') === projectId)
    );
  }
  async findAll(filter = {}) {
    return this._store.filter((d) => {
      if (filter.projectId !== undefined && (d.projectId || 'project-default') !== filter.projectId) return false;
      return true;
    });
  }
  async save(dep) {
    this._store.push(dep);
    return dep;
  }
  async upsert(dep, counters = {}) {
    const key = dep.getCompositeKey ? dep.getCompositeKey() : `${dep.projectId || 'project-default'}:${dep.sourceServiceId}:${dep.targetServiceId}:${dep.dependencyType}`;
    const existing = this._store.find((d) => (d.getCompositeKey ? d.getCompositeKey() : `${d.projectId || 'project-default'}:${d.sourceServiceId}:${d.targetServiceId}:${d.dependencyType}`) === key);
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
  async deleteAll(projectId) {
    if (projectId) {
      this._store = this._store.filter((d) => (d.projectId || 'project-default') !== projectId);
    } else {
      this._store = [];
    }
  }
}

class FakeTelemetryRepository {
  constructor() { this._store = []; }
  async save(event) {
    this._store.push(event);
    return event;
  }
  async findByTimeRange(start, end, options = {}) {
    return this._store
      .filter((e) =>
        e.timestamp >= start &&
        e.timestamp <= end &&
        (options.projectId === undefined || (e.projectId || 'project-default') === options.projectId)
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
  async findByService(name, opts = {}) {
    const { role = 'any', limit = 100, projectId } = opts;
    let results;
    if (role === 'source') results = this._store.filter((e) => e.sourceService === name);
    else if (role === 'target') results = this._store.filter((e) => e.targetService === name);
    else results = this._store.filter((e) => e.sourceService === name || e.targetService === name);

    if (projectId !== undefined) {
      results = results.filter((e) => (e.projectId || 'project-default') === projectId);
    }

    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit);
  }
  async findByTraceId(traceId) {
    return this._store.filter((e) => e.traceId === traceId).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
  async deleteAll(projectId) {
    if (projectId) {
      this._store = this._store.filter((e) => (e.projectId || 'project-default') !== projectId);
    } else {
      this._store = [];
    }
  }
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
  async deleteAll(projectId) {
    if (projectId) {
      this._store = this._store.filter((i) => (i.projectId || i.metadata?.projectId || 'project-default') !== projectId);
    } else {
      this._store = [];
    }
  }
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
  async deleteAll(projectId) {
    if (projectId) {
      this._store = this._store.filter((e) => (e.projectId || e.metadata?.projectId || 'project-default') !== projectId);
    } else {
      this._store = [];
    }
  }
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
  async deleteAll(projectId) {
    if (projectId) {
      this._store = this._store.filter((d) => (d.projectId || d.metadata?.projectId || 'project-default') !== projectId);
    } else {
      this._store = [];
    }
  }
}

class FakeApiKeyRepository {
  constructor() { this._store = []; }
  async findByHashedKey(hashedKey) {
    return this._store.find((k) => k.hashedKey === hashedKey) || null;
  }
  async findById(keyId) {
    return this._store.find((k) => k.keyId === keyId) || null;
  }
  async findByProjectId(projectId) {
    return this._store.filter((k) => k.projectId === projectId);
  }
  async save(apiKey) {
    this._store.push(apiKey);
    return apiKey;
  }
  async update(apiKey) {
    const idx = this._store.findIndex((k) => k.keyId === apiKey.keyId);
    if (idx >= 0) this._store[idx] = apiKey;
    return apiKey;
  }
  async recordUsage(keyId, timestamp = new Date()) {
    const key = this._store.find((k) => k.keyId === keyId);
    if (key) key.recordUsage(timestamp);
  }
  async deleteAll(projectId) {
    if (projectId) {
      this._store = this._store.filter((k) => k.projectId !== projectId);
    } else {
      this._store = [];
    }
  }
}

class FakeProjectRepository {
  constructor() { this._store = []; }
  async findById(projectId) {
    return this._store.find((p) => p.projectId === projectId) || null;
  }
  async findBySlug(slug) {
    return this._store.find((p) => p.slug === slug) || null;
  }
  async findAll(filter = {}) {
    return this._store.filter((p) => {
      if (filter.status && p.status !== filter.status) return false;
      return true;
    });
  }
  async save(project) {
    this._store.push(project);
    return project;
  }
  async update(project) {
    const idx = this._store.findIndex((p) => p.projectId === project.projectId);
    if (idx >= 0) this._store[idx] = project;
    return project;
  }
  async deleteAll() {
    this._store = [];
  }
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
  FakeApiKeyRepository,
  FakeProjectRepository,
  FakeEventBus,
};
