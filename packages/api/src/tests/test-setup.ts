// DB-backed tests must provide an explicit target; never default to shared 6767.
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.BETTER_AUTH_SECRET ??= "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
process.env.BETTER_AUTH_URL ??= "http://localhost:3001";
process.env.CORS_ORIGIN ??= "http://localhost:3000";
process.env.PAYMENT_WEBHOOK_SECRET ??= "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
