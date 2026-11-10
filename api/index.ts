/**
 * Vercel entry point. Vercel turns every file in api/ into a serverless function;
 * vercel.json sends every /api/* request here, and Express routes it.
 * The app itself lives in server/app.ts so it can also run locally (server/dev.ts).
 */
import { createApp } from '../server/app.js';

export default createApp();
