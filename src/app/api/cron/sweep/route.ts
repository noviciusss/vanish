import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

/**
 * Tier 3: Automated Ephemeral Maintenance Sweeper.
 * Prunes expired anonymous identities (>24h) and clears stale Redis match pools.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Optional secret check if configured
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    // 1. Delete non-fixed identities older than 24 hours
    const deletedIdentities = await prisma.identity.deleteMany({
      where: {
        isFixed: false,
        createdAt: { lt: cutoffDate },
      },
    });

    // 2. Clear orphaned Redis online pool keys
    const onlineMembers = await redis.smembers('online:pool');
    let prunedRedisCount = 0;

    for (const id of onlineMembers) {
      const existsInDb = await prisma.identity.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existsInDb) {
        await redis.srem('online:pool', id);
        await redis.del(`online:${id}:info`);
        await redis.del(`online:${id}:tags`);
        prunedRedisCount++;
      }
    }

    return NextResponse.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      prunedIdentities: deletedIdentities.count,
      prunedRedisStaleMembers: prunedRedisCount,
    });
  } catch (err: any) {
    console.error('Sweep cron error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
