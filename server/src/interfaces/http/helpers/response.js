/**
 * Standard response helpers.
 * Enforces consistent response envelope across all endpoints.
 */

/**
 * Success response.
 * @param {import('express').Response} res
 * @param {*} data
 * @param {number} [statusCode=200]
 */
function success(res, data, statusCode = 200) {
  res.status(statusCode).json({
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Error response.
 * @param {import('express').Response} res
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode=500]
 */
function error(res, code, message, statusCode = 500) {
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
}

module.exports = { success, error };
