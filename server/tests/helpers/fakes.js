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
      .filter((e) => {
        if (e.timestamp < start || e.timestamp > end) return false;
        if (options.projectId !== undefined && (e.projectId || 'project-default') !== options.projectId) return false;
        if (options.environment !== undefined && (e.environment || 'production') !== options.environment) return false;
        if (options.sourceService !== undefined && e.sourceService !== options.sourceService) return false;
        return true;
      })
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
  async findById(arg1, arg2) {
    if (arg2 !== undefined) {
      const projectId = arg1;
      const incidentId = arg2;
      return this._store.find((i) =>
        i.incidentId === incidentId &&
        (i.projectId || i.metadata?.projectId || 'project-default') === projectId
      ) || null;
    }
    return this._store.find((i) => i.incidentId === arg1) || null;
  }
  async findAll(filter = {}) {
    return [...this._store]
      .filter((i) => {
        if (filter.projectId && (i.projectId || i.metadata?.projectId || 'project-default') !== filter.projectId) return false;
        if (filter.environment && (i.environment || i.metadata?.environment || 'production') !== filter.environment) return false;
        if (filter.status && i.status !== filter.status) return false;
        return true;
      })
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }
  async findByStatus(status, options = {}) {
    return this._store.filter((i) => {
      if (i.status !== status) return false;
      if (options.projectId && (i.projectId || i.metadata?.projectId || 'project-default') !== options.projectId) return false;
      if (options.environment && (i.environment || i.metadata?.environment || 'production') !== options.environment) return false;
      return true;
    });
  }
  async findActiveByService(projectId, environment, serviceIdOrName) {
    const proj = projectId || 'project-default';
    const env = environment || 'production';
    return this._store.find((i) => {
      const iProj = i.projectId || i.metadata?.projectId || 'project-default';
      const iEnv = i.environment || i.metadata?.environment || 'production';
      if (iProj !== proj || iEnv !== env) return false;
      if (i.status !== 'detected' && i.status !== 'investigating') return false;
      const affected = i.affectedServices || [];
      const trgName = i.trigger?.serviceName;
      const trgId = i.trigger?.serviceId;
      return affected.includes(serviceIdOrName) || trgName === serviceIdOrName || trgId === serviceIdOrName;
    }) || null;
  }
  async findActive(projectId, environment) {
    return this._store
      .filter((i) => {
        if (i.status !== 'detected' && i.status !== 'investigating') return false;
        if (projectId && (i.projectId || i.metadata?.projectId || 'project-default') !== projectId) return false;
        if (environment && (i.environment || i.metadata?.environment || 'production') !== environment) return false;
        return true;
      })
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }
  async findByProject(projectId, filters = {}) {
    return this._store
      .filter((i) => {
        const proj = i.projectId || i.metadata?.projectId || 'project-default';
        if (proj !== projectId) return false;
        if (filters.environment && (i.environment || i.metadata?.environment || 'production') !== filters.environment) return false;
        if (filters.status && i.status !== filters.status) return false;
        if (filters.severity && i.severity !== filters.severity) return false;
        if (filters.startTime && i.startedAt < new Date(filters.startTime)) return false;
        if (filters.endTime && i.startedAt > new Date(filters.endTime)) return false;
        return true;
      })
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, filters.limit || undefined);
  }
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
  async findByIncidentId(arg1, arg2) {
    if (arg2 !== undefined) {
      const projectId = arg1;
      const incidentId = arg2;
      return this._store
        .filter((e) =>
          e.incidentId === incidentId &&
          (e.projectId || e.metadata?.projectId || 'project-default') === projectId
        )
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }
    return this._store
      .filter((e) => e.incidentId === arg1)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
  async findByTelemetryEventId(incidentId, telemetryEventId) {
    return this._store.find((e) =>
      e.incidentId === incidentId &&
      e.metadata?.telemetryEventId === telemetryEventId
    ) || null;
  }
  async findByServiceId(serviceId, options = {}) {
    return this._store.filter((e) => {
      if (e.serviceId !== serviceId) return false;
      if (options.projectId && (e.projectId || e.metadata?.projectId || 'project-default') !== options.projectId) return false;
      return true;
    });
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
  async findById(arg1, arg2) {
    if (arg2 !== undefined) {
      const projectId = arg1;
      const deploymentId = arg2;
      return this._store.find((d) =>
        d.deploymentId === deploymentId &&
        (d.projectId || d.metadata?.projectId || 'project-default') === projectId
      ) || null;
    }
    return this._store.find((d) => d.deploymentId === arg1) || null;
  }
  async findByProject(projectId, filters = {}) {
    return this._store
      .filter((d) => {
        const proj = d.projectId || d.metadata?.projectId || 'project-default';
        if (proj !== projectId) return false;
        if (filters.serviceId && d.serviceId !== filters.serviceId) return false;
        if (filters.environment && d.environment !== filters.environment) return false;
        if (filters.startTime && d.deployedAt < new Date(filters.startTime)) return false;
        if (filters.endTime && d.deployedAt > new Date(filters.endTime)) return false;
        return true;
      })
      .sort((a, b) => b.deployedAt.getTime() - a.deployedAt.getTime())
      .slice(0, filters.limit || undefined);
  }
  async findByService(arg1, arg2, arg3) {
    if (arg2 !== undefined && typeof arg2 === 'string') {
      const projectId = arg1;
      const serviceId = arg2;
      const filters = arg3 || {};
      return this._store
        .filter((d) => {
          const proj = d.projectId || d.metadata?.projectId || 'project-default';
          if (proj !== projectId) return false;
          if (d.serviceId !== serviceId) return false;
          if (filters.environment && d.environment !== filters.environment) return false;
          if (filters.startTime && d.deployedAt < new Date(filters.startTime)) return false;
          if (filters.endTime && d.deployedAt > new Date(filters.endTime)) return false;
          return true;
        })
        .sort((a, b) => b.deployedAt.getTime() - a.deployedAt.getTime())
        .slice(0, filters.limit || undefined);
    }
    return this._store
      .filter((d) => d.serviceId === arg1)
      .sort((a, b) => b.deployedAt.getTime() - a.deployedAt.getTime());
  }
  async findRecent(projectId, options = {}) {
    return this.findByProject(projectId, { limit: options.limit || 10, ...options });
  }
  async findBetween(projectId, startTime, endTime, filters = {}) {
    return this.findByProject(projectId, {
      ...filters,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
    });
  }
  async findAll(filter = {}) {
    return this._store
      .filter((d) => {
        if (filter.projectId) {
          const proj = d.projectId || d.metadata?.projectId || 'project-default';
          if (proj !== filter.projectId) return false;
        }
        if (filter.serviceId && d.serviceId !== filter.serviceId) return false;
        if (filter.environment && d.environment !== filter.environment) return false;
        return true;
      })
      .sort((a, b) => b.deployedAt.getTime() - a.deployedAt.getTime());
  }
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
