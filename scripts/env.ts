// Loads .env when present (local runs). On Vercel the env vars are already set.
try {
  process.loadEnvFile('.env')
} catch {}
