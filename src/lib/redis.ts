import Redis from 'ioredis';

const globalForRedis = global as unknown as { redis: Redis };

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis =
  globalForRedis.redis ||
  new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;
