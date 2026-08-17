import { redis } from './redis';

/**
 * Token bucket rate limiter using Redis atomic ops.
 * @param identityId - The user identity ID
 * @param action - Action name (e.g., 'message', 'chat_request', 'profile_edit')
 * @param maxRequests - Maximum requests allowed in the time window
 * @param windowSeconds - Time window in seconds
 */
export async function checkRateLimit(
  identityId: string,
  action: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
  const key = `ratelimit:${identityId}:${action}`;

  // Increment counter in Redis
  const count = await redis.incr(key);

  if (count === 1) {
    // Set expiry on first hit
    await redis.expire(key, windowSeconds);
  }

  const ttl = await redis.ttl(key);

  if (count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  }

  return {
    allowed: true,
    remaining: maxRequests - count,
    resetInSeconds: ttl > 0 ? ttl : windowSeconds,
  };
}

// Pre-defined limits per spec:
export const RATE_LIMITS = {
  SEND_MESSAGE: { max: 30, window: 60 }, // 30 messages per minute
  CHAT_REQUEST: { max: 10, window: 3600 }, // 10 requests per hour
  PROFILE_EDIT: { max: 10, window: 3600 }, // 10 edits per hour
};
