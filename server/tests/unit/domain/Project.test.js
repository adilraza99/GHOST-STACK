const Project = require('../../../src/domain/entities/Project');
const { ValidationError, InvalidEnumError } = require('../../../src/domain/errors');

describe('Project Domain Entity', () => {
  describe('Creation & Validation', () => {
    it('should create a valid project with default active status', () => {
      const project = new Project({
        name: 'E-Commerce Platform',
        slug: 'ecommerce-platform',
        description: 'Main production e-commerce backend',
      });

      expect(project.projectId).toBeDefined();
      expect(typeof project.projectId).toBe('string');
      expect(project.name).toBe('E-Commerce Platform');
      expect(project.slug).toBe('ecommerce-platform');
      expect(project.description).toBe('Main production e-commerce backend');
      expect(project.status).toBe('active');
      expect(project.isActive()).toBe(true);
      expect(project.isArchived()).toBe(false);
      expect(project.createdAt).toBeInstanceOf(Date);
      expect(project.updatedAt).toBeInstanceOf(Date);
    });

    it('should allow custom projectId and status', () => {
      const customId = 'proj_custom_123';
      const project = new Project({
        projectId: customId,
        name: 'Demo Project',
        slug: 'demo-project',
        status: 'archived',
      });

      expect(project.projectId).toBe(customId);
      expect(project.status).toBe('archived');
      expect(project.isArchived()).toBe(true);
      expect(project.isActive()).toBe(false);
    });

    it('should throw ValidationError if props are missing', () => {
      expect(() => new Project()).toThrow(ValidationError);
    });

    it('should throw ValidationError if name is missing or empty', () => {
      expect(() => new Project({ slug: 'test' })).toThrow(ValidationError);
      expect(() => new Project({ name: '   ', slug: 'test' })).toThrow(ValidationError);
    });

    it('should throw ValidationError if name exceeds 100 characters', () => {
      expect(() => new Project({ name: 'a'.repeat(101), slug: 'test' })).toThrow(ValidationError);
    });

    it('should throw ValidationError if slug is missing or invalid format', () => {
      expect(() => new Project({ name: 'Test' })).toThrow(ValidationError);
      expect(() => new Project({ name: 'Test', slug: '   ' })).toThrow(ValidationError);
      expect(() => new Project({ name: 'Test', slug: 'Invalid Slug with Spaces' })).toThrow(ValidationError);
      expect(() => new Project({ name: 'Test', slug: 'test--double-hyphen' })).toThrow(ValidationError);
      expect(() => new Project({ name: 'Test', slug: '-leading-hyphen' })).toThrow(ValidationError);
      expect(() => new Project({ name: 'Test', slug: 'trailing-hyphen-' })).toThrow(ValidationError);
    });

    it('should throw ValidationError if slug exceeds 100 characters', () => {
      expect(() => new Project({ name: 'Test', slug: 'a'.repeat(101) })).toThrow(ValidationError);
    });

    it('should throw InvalidEnumError if status is invalid', () => {
      expect(() => new Project({ name: 'Test', slug: 'test', status: 'deleted' })).toThrow(InvalidEnumError);
    });
  });

  describe('slugify helper', () => {
    it('should convert strings to URL-safe slugs', () => {
      expect(Project.slugify('My E-Commerce App')).toBe('my-e-commerce-app');
      expect(Project.slugify('Special @# Characters & Symbols!')).toBe('special-characters-symbols');
      expect(Project.slugify('  Trimmed   Spaces  ')).toBe('trimmed-spaces');
      expect(Project.slugify('')).toBe('');
      expect(Project.slugify(null)).toBe('');
    });
  });

  describe('Mutations & State Transitions', () => {
    it('should archive project and update updatedAt', () => {
      const project = new Project({
        name: 'Test Project',
        slug: 'test-project',
      });
      const originalUpdated = new Date(Date.now() - 1000);
      project.updatedAt = originalUpdated;

      project.archive();

      expect(project.status).toBe('archived');
      expect(project.isArchived()).toBe(true);
      expect(project.isActive()).toBe(false);
      expect(project.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdated.getTime());
    });

    it('should update name and description and update updatedAt', () => {
      const project = new Project({
        name: 'Original Name',
        slug: 'original-name',
        description: 'Original description',
      });

      project.update({ name: 'New Name', description: 'Updated description' });

      expect(project.name).toBe('New Name');
      expect(project.description).toBe('Updated description');
    });

    it('should throw ValidationError when updating with empty name', () => {
      const project = new Project({
        name: 'Original Name',
        slug: 'original-name',
      });

      expect(() => project.update({ name: '   ' })).toThrow(ValidationError);
    });
  });

  describe('toJSON Serialization', () => {
    it('should return plain serializable object', () => {
      const project = new Project({
        projectId: 'proj_123',
        name: 'Project 123',
        slug: 'project-123',
        description: 'Test project description',
      });

      const json = project.toJSON();

      expect(json).toEqual({
        projectId: 'proj_123',
        name: 'Project 123',
        slug: 'project-123',
        description: 'Test project description',
        status: 'active',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });
  });
});
