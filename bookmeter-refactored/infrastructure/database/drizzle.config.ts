import type { Config } from 'drizzle-kit';

export default {
  schema: './schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: '../../data/books.sqlite'
  },
  verbose: true,
  strict: true
} satisfies Config;
