/**
 * Centralized API client for GhostStack.
 * Handles base URLs, standard envelopes, and error parsing.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Core fetch wrapper
 */
async function fetchClient(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const config = {
    ...options,
    headers,
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, config);
    
    // Parse standard GhostStack envelope
    const data = await response.json().catch(() => null);

    if (!response.ok || (data && !data.success)) {
      const code = data?.error?.code || 'UNKNOWN_ERROR';
      const message = data?.error?.message || `HTTP ${response.status} Error`;
      throw new ApiError(message, code, response.status);
    }

    return data.data; // Return the inner payload
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    // Network or parsing errors
    throw new ApiError(err.message || 'Network Error', 'NETWORK_ERROR', 0);
  }
}

export const api = {
  get: (endpoint) => fetchClient(endpoint, { method: 'GET' }),
  post: (endpoint, body) => fetchClient(endpoint, { method: 'POST', body }),
  put: (endpoint, body) => fetchClient(endpoint, { method: 'PUT', body }),
  delete: (endpoint) => fetchClient(endpoint, { method: 'DELETE' }),
};
