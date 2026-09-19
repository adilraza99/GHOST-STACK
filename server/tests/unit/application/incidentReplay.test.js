const IncidentReplayService = require('../../../src/application/IncidentReplayService');
const Incident = require('../../../src/domain/entities/Incident');
const IncidentEvent = require('../../../src/domain/entities/IncidentEvent');
const { EntityNotFoundError } = require('../../../src/domain/errors');
const { FakeIncidentRepository, FakeIncidentEventRepository } = require('../../helpers/fakes');

describe('IncidentReplayService', () => {
  let replayService, incidentRepo, eventRepo;

  beforeEach(() => {
    incidentRepo = new FakeIncidentRepository();
    eventRepo = new FakeIncidentEventRepository();
    replayService = new IncidentReplayService({
      incidentRepository: incidentRepo,
      incidentEventRepository: eventRepo,
    });
  });

  describe('missing incident', () => {
    it('should throw EntityNotFoundError', async () => {
      await expect(replayService.replay('nonexistent'))
        .rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('empty timeline', () => {
    it('should return empty timeline for incident with no events', async () => {
      const incident = new Incident({ title: 'Test', severity: 'medium' });
      await incidentRepo.save(incident);

      const result = await replayService.replay(incident.incidentId);
      expect(result.timeline).toEqual([]);
      expect(result.incident.incidentId).toBe(incident.incidentId);
    });
  });

  describe('chronological ordering', () => {
    it('should return events in chronological order', async () => {
      const startTime = new Date('2026-01-15T10:00:00Z');
      const incident = new Incident({
        title: 'Test',
        severity: 'high',
        startedAt: startTime,
      });
      await incidentRepo.save(incident);

      // Add events out of order
      await eventRepo.save(new IncidentEvent({
        incidentId: incident.incidentId,
        timestamp: new Date('2026-01-15T10:00:07Z'),
        serviceId: 'svc-b',
        type: 'error',
        message: 'Third event',
      }));
      await eventRepo.save(new IncidentEvent({
        incidentId: incident.incidentId,
        timestamp: new Date('2026-01-15T10:00:02Z'),
        serviceId: 'svc-a',
        type: 'latency_spike',
        message: 'First event',
      }));
      await eventRepo.save(new IncidentEvent({
        incidentId: incident.incidentId,
        timestamp: new Date('2026-01-15T10:00:05Z'),
        serviceId: 'svc-a',
        type: 'error',
        message: 'Second event',
      }));

      const result = await replayService.replay(incident.incidentId);
      expect(result.timeline).toHaveLength(3);
      expect(result.timeline[0].message).toBe('First event');
      expect(result.timeline[1].message).toBe('Second event');
      expect(result.timeline[2].message).toBe('Third event');
    });
  });

  describe('relativeTimeMs calculation', () => {
    it('should calculate relativeTimeMs from incident start', async () => {
      const startTime = new Date('2026-01-15T10:00:00Z');
      const incident = new Incident({
        title: 'Test',
        severity: 'medium',
        startedAt: startTime,
      });
      await incidentRepo.save(incident);

      await eventRepo.save(new IncidentEvent({
        incidentId: incident.incidentId,
        timestamp: new Date('2026-01-15T10:00:02Z'), // +2s
        serviceId: 'svc',
        type: 'error',
        message: 'Event at +2s',
      }));
      await eventRepo.save(new IncidentEvent({
        incidentId: incident.incidentId,
        timestamp: new Date('2026-01-15T10:00:07Z'), // +7s
        serviceId: 'svc',
        type: 'error',
        message: 'Event at +7s',
      }));

      const result = await replayService.replay(incident.incidentId);
      expect(result.timeline[0].relativeTimeMs).toBe(2000);
      expect(result.timeline[1].relativeTimeMs).toBe(7000);
    });
  });

  describe('equal timestamps', () => {
    it('should handle events with identical timestamps', async () => {
      const startTime = new Date('2026-01-15T10:00:00Z');
      const incident = new Incident({
        title: 'Test',
        severity: 'low',
        startedAt: startTime,
      });
      await incidentRepo.save(incident);

      const sameTime = new Date('2026-01-15T10:00:03Z');
      await eventRepo.save(new IncidentEvent({
        incidentId: incident.incidentId,
        timestamp: sameTime,
        serviceId: 'svc-a',
        type: 'error',
        message: 'Event A',
      }));
      await eventRepo.save(new IncidentEvent({
        incidentId: incident.incidentId,
        timestamp: sameTime,
        serviceId: 'svc-b',
        type: 'error',
        message: 'Event B',
      }));

      const result = await replayService.replay(incident.incidentId);
      expect(result.timeline).toHaveLength(2);
      expect(result.timeline[0].relativeTimeMs).toBe(3000);
      expect(result.timeline[1].relativeTimeMs).toBe(3000);
    });
  });
});
