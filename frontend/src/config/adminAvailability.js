// The admin panel is available only when running locally with the Vite dev server (npm run dev).
// Vite replaces import.meta.env.DEV with the constant false in production builds, so admin code is
// dropped from the deployed site entirely.
export const ADMIN_ENABLED = import.meta.env.DEV;
