const ProjectRepository = require('./ProjectRepository');
const ProjectModel = require('../database/models/ProjectModel');
const Project = require('../../domain/entities/Project');

/**
 * MongoDB implementation of ProjectRepository.
 * Maps between Mongoose documents and domain Project entities.
 */
class MongoProjectRepository extends ProjectRepository {
  /**
   * Converts a Mongoose lean document to a domain Project entity.
   * @param {object} doc
   * @returns {Project|null}
   */
  _toDomain(doc) {
    if (!doc) return null;
    return new Project({
      projectId: doc.projectId,
      name: doc.name,
      slug: doc.slug,
      description: doc.description,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }

  async findById(projectId) {
    const doc = await ProjectModel.findOne({ projectId }).lean();
    return this._toDomain(doc);
  }

  async findBySlug(slug) {
    const doc = await ProjectModel.findOne({ slug }).lean();
    return this._toDomain(doc);
  }

  async findAll(filter = {}) {
    const query = {};
    if (filter.status) {
      query.status = filter.status;
    }
    const docs = await ProjectModel.find(query).sort({ createdAt: -1 }).lean();
    return docs.map((doc) => this._toDomain(doc));
  }

  async save(project) {
    const doc = await ProjectModel.create({
      projectId: project.projectId,
      name: project.name,
      slug: project.slug,
      description: project.description,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
    return this._toDomain(doc);
  }

  async update(project) {
    const doc = await ProjectModel.findOneAndUpdate(
      { projectId: project.projectId },
      {
        $set: {
          name: project.name,
          slug: project.slug,
          description: project.description,
          status: project.status,
          updatedAt: project.updatedAt,
        },
      },
      { returnDocument: 'after', lean: true }
    );
    return this._toDomain(doc);
  }

  async deleteAll() {
    await ProjectModel.deleteMany({});
  }
}

module.exports = MongoProjectRepository;
