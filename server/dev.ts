/**
 * Local development server: `npm run dev:api`.
 * Runs the same Express app as Vercel, on http://localhost:3001.
 * While `npm run dev` is also running, the web app's /api requests are forwarded here (see vite.config.ts).
 */
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);

createApp().listen(port, () => {
  console.log(`Get Heard API running at http://localhost:${port}/api/health`);
});
