import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { removeFromOnlinePool } from '@/lib/matching';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('anon_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifySessionToken(token);
    if (!payload?.identity_id) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const reporterId = payload.identity_id;
    const body = await req.json();
    const { target_id } = body;

    if (!target_id || typeof target_id !== 'string' || target_id === reporterId) {
      return NextResponse.json({ error: 'Invalid target identity' }, { status: 400 });
    }

    // Ensure target identity exists
    const targetExists = await prisma.identity.findUnique({
      where: { id: target_id },
    });

    if (!targetExists) {
      return NextResponse.json({ error: 'Target identity not found' }, { status: 404 });
    }

    // Insert block record (no raw message content stored)
    await prisma.block.upsert({
      where: {
        reporterId_blockedId: {
          reporterId,
          blockedId: target_id,
        },
      },
      update: {},
      create: {
        reporterId,
        blockedId: target_id,
      },
    });

    return NextResponse.json({
      success: true,
      blocked_id: target_id,
      message: 'User reported and blocked successfully. You will never be matched again.',
    });
  } catch (error) {
    console.error('Report user error:', error);
    return NextResponse.json({ error: 'Failed to report user' }, { status: 500 });
  }
}
