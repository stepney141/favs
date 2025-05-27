import type { Config } from 'drizzle-kit';

export default {
  schema: './infrastructure/database/schema.ts',
  out: './infrastructure/database/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/books.sqlite'
  },
  verbose: true,
  strict: true
} satisfies Config;
