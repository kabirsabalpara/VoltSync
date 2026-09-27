// VoltSync API configuration
// In development, defaults to local Node server on port 5000.
// In production (Vercel), point VITE_API_BASE_URL to your Render backend URL (e.g. https://voltsync-api.onrender.com/api).

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');
