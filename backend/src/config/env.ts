import { z } from 'zod';

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // PostgreSQL
  DATABASE_URL: z.string().url().startsWith('postgres'),
  DB_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_SSL: z.coerce.boolean().default(false),

  // Firebase Admin
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),

  // Webhooks — Wompi
  WOMPI_EVENTS_SECRET: z.string().min(1).optional(),
  WOMPI_INTEGRITY_SECRET: z.string().min(1).optional(),

  // App
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().default('*'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const env: Env = loadEnv();
