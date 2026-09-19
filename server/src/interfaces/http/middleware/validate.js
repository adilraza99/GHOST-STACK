/**
 * Express middleware factory for Zod schema validation.
 *
 * Validates req.body against the provided schema.
 * Passes ZodError to the error handler on failure.
 *
 * @param {import('zod').ZodSchema} schema
 * @returns {Function} Express middleware
 */
function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const err = result.error;
      err.name = 'ZodError';
      return next(err);
    }
    // Replace body with parsed/coerced data
    req.body = result.data;
    next();
  };
}

/**
 * Validates query parameters.
 * @param {import('zod').ZodSchema} schema
 */
function validateQuery(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const err = result.error;
      err.name = 'ZodError';
      return next(err);
    }
    req.query = result.data;
    next();
  };
}

module.exports = { validate, validateQuery };
