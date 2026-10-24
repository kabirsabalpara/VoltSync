// VoltSync API configuration
// Automatically handles local dev, preview, Vercel edge rewrites, and Render production backend.

const resolveApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;
  if (envUrl && envUrl.trim()) {
    let cleaned = envUrl.trim().replace(/\/+$/, '');
    // Ensure /api suffix is present even if environment variable contains only domain
    if (!cleaned.endsWith('/api')) {
      cleaned = `${cleaned}/api`;
    }
    return cleaned;
  }

  // In local development mode without explicit env var, connect to local Express server
  if (import.meta.env.DEV) {
    return 'http://localhost:5000/api';
  }

  // In production / preview on Vercel:
  // Direct to Render production backend /api by default
  return 'https://voltsync.onrender.com/api';
};

export const API_BASE_URL = resolveApiBaseUrl();


