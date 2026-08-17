import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { checkRateLimit, RATE_LIMITS } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  try {
    const token = req.cookies.get('anon_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifySessionToken(token);
    if (!payload?.identity_id) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const identityId = payload.identity_id;

    // Rate limiting: max 10 profile edits per hour
    const rateLimit = await checkRateLimit(
      identityId,
      'profile_edit',
      RATE_LIMITS.PROFILE_EDIT.max,
      RATE_LIMITS.PROFILE_EDIT.window
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded. You can edit tags again in ${rateLimit.resetInSeconds} seconds.`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { tags } = body;

    if (!Array.isArray(tags)) {
      return NextResponse.json({ error: 'Tags must be an array of strings' }, { status: 400 });
    }

    // Spec enforcement: max 10 tags
    if (tags.length > 10) {
      return NextResponse.json(
        { error: 'Maximum 10 tags allowed' },
        { status: 400 }
      );
    }

    // Sanitize tags
    const sanitizedTags: string[] = Array.from(
      new Set(
        tags
          .filter((t): t is string => typeof t === 'string')
          .map((t) => t.trim().toLowerCase().slice(0, 30))
          .filter((t) => t.length > 0)
      )
    );

    if (sanitizedTags.length > 10) {
      return NextResponse.json(
        { error: 'Maximum 10 unique tags allowed' },
        { status: 400 }
      );
    }

    // Upsert into Postgres
    const updatedProfile = await prisma.profile.upsert({
      where: { identityId },
      update: { tags: sanitizedTags },
      create: { identityId, tags: sanitizedTags },
    });

    // Update Redis snapshot if user has an online tags key
    const isOnline = await redis.exists(`online:${identityId}:tags`);
    if (isOnline) {
      await redis.set(`online:${identityId}:tags`, JSON.stringify(sanitizedTags), 'EX', 3600);
    }

    return NextResponse.json({
      identity_id: identityId,
      tags: updatedProfile.tags,
      remaining_edits: rateLimit.remaining,
    });
  } catch (error) {
    console.error('Update tags failed:', error);
    return NextResponse.json({ error: 'Failed to update tags' }, { status: 500 });
  }
}
