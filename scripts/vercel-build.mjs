// Vercel build: migrate + seed only for production deploys, so preview builds of other
// branches never change the live database. Then build the UI.
import { execSync } from 'node:child_process'

const run = (cmd) => execSync(cmd, { stdio: 'inherit' })
const env = process.env.VERCEL_ENV ?? 'local'
if (env === 'production' || env === 'local') {
  run('npm run db:migrate')
  run('npm run db:seed')
} else {
  console.log(`VERCEL_ENV=${env}: skipping db:migrate and db:seed (production only)`)
}
run('vite build')
