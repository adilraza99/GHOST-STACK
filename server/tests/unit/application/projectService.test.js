const ProjectService = require('../../../src/application/ProjectService');
const { FakeProjectRepository } = require('../../helpers/fakes');
const {
  ValidationError,
  EntityNotFoundError,
  InvalidStateError,
  ConflictError,
} = require('../../../src/domain/errors');

describe('ProjectService', () => {
  let projectRepository;
  let projectService;

  beforeEach(() => {
    projectRepository = new FakeProjectRepository();
    projectService = new ProjectService({ projectRepository });
  });

  describe('createProject', () => {
    it('should create a project with generated slug and active status', async () => {
      const project = await projectService.createProject({
        name: 'My Store Backend',
        description: 'Store services',
      });

      expect(project.projectId).toBeDefined();
      expect(project.name).toBe('My Store Backend');
      expect(project.slug).toBe('my-store-backend');
      expect(project.description).toBe('Store services');
      expect(project.status).toBe('active');

      const saved = await projectRepository.findById(project.projectId);
      expect(saved).not.toBeNull();
      expect(saved.slug).toBe('my-store-backend');
    });

    it('should allow custom slug when provided', async () => {
      const project = await projectService.createProject({
        name: 'Custom Service',
        slug: 'custom-svc-v1',
      });

      expect(project.slug).toBe('custom-svc-v1');
    });

    it('should throw ValidationError if name is missing or empty', async () => {
      await expect(projectService.createProject({})).rejects.toThrow(ValidationError);
      await expect(projectService.createProject({ name: '   ' })).rejects.toThrow(ValidationError);
    });

    it('should throw ConflictError if project with slug already exists', async () => {
      await projectService.createProject({ name: 'Alpha Service', slug: 'alpha-service' });

      await expect(
        projectService.createProject({ name: 'Another Alpha', slug: 'alpha-service' })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('getProject & getProjectBySlug', () => {
    it('should retrieve project by ID', async () => {
      const created = await projectService.createProject({ name: 'Alpha' });
      const found = await projectService.getProject(created.projectId);

      expect(found.projectId).toBe(created.projectId);
      expect(found.name).toBe('Alpha');
    });

    it('should throw EntityNotFoundError when project ID does not exist', async () => {
      await expect(projectService.getProject('nonexistent-id')).rejects.toThrow(EntityNotFoundError);
    });

    it('should retrieve project by slug', async () => {
      const created = await projectService.createProject({ name: 'Beta Service', slug: 'beta-service' });
      const found = await projectService.getProjectBySlug('beta-service');

      expect(found.projectId).toBe(created.projectId);
    });

    it('should throw EntityNotFoundError when slug does not exist', async () => {
      await expect(projectService.getProjectBySlug('missing-slug')).rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('listProjects', () => {
    it('should list all projects and support status filter', async () => {
      const p1 = await projectService.createProject({ name: 'P1' });
      const p2 = await projectService.createProject({ name: 'P2' });
      await projectService.archiveProject(p2.projectId);

      const all = await projectService.listProjects();
      expect(all).toHaveLength(2);

      const activeOnly = await projectService.listProjects({ status: 'active' });
      expect(activeOnly).toHaveLength(1);
      expect(activeOnly[0].projectId).toBe(p1.projectId);

      const archivedOnly = await projectService.listProjects({ status: 'archived' });
      expect(archivedOnly).toHaveLength(1);
      expect(archivedOnly[0].projectId).toBe(p2.projectId);
    });
  });

  describe('archiveProject', () => {
    it('should transition project to archived status', async () => {
      const created = await projectService.createProject({ name: 'To Archive' });
      const archived = await projectService.archiveProject(created.projectId);

      expect(archived.status).toBe('archived');
      expect(archived.isArchived()).toBe(true);

      const fromRepo = await projectRepository.findById(created.projectId);
      expect(fromRepo.isArchived()).toBe(true);
    });

    it('should throw EntityNotFoundError if project does not exist', async () => {
      await expect(projectService.archiveProject('missing-id')).rejects.toThrow(EntityNotFoundError);
    });

    it('should throw InvalidStateError if project is already archived', async () => {
      const created = await projectService.createProject({ name: 'Double Archive' });
      await projectService.archiveProject(created.projectId);

      await expect(projectService.archiveProject(created.projectId)).rejects.toThrow(InvalidStateError);
    });
  });
});
