import { redis } from './redis';
import { prisma } from './prisma';

/**
 * Calculates Jaccard similarity between two arrays of tags.
 * Intersection size / Union size.
 */
export function calculateJaccardSimilarity(tagsA: string[], tagsB: string[]): number {
  if (!tagsA.length && !tagsB.length) return 0;

  const setA = new Set(tagsA.map((t) => t.trim().toLowerCase()));
  const setB = new Set(tagsB.map((t) => t.trim().toLowerCase()));

  let intersectionCount = 0;
  for (const tag of setA) {
    if (setB.has(tag)) {
      intersectionCount++;
    }
  }

  const unionCount = new Set([...setA, ...setB]).size;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

/**
 * Register user in the online match pool with their tags snapshot.
 */
export async function addToOnlinePool(identityId: string, tags: string[] = []): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.sadd('online:pool', identityId);
  pipeline.set(`online:${identityId}:tags`, JSON.stringify(tags), 'EX', 3600); // 1h auto expiry
  await pipeline.exec();
}

/**
 * Remove user from the online pool.
 */
export async function removeFromOnlinePool(identityId: string): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.srem('online:pool', identityId);
  pipeline.del(`online:${identityId}:tags`);
  await pipeline.exec();
}

/**
 * Get all blocked IDs (either reporter or blocked) for an identity.
 */
export async function getBlockedIds(identityId: string): Promise<Set<string>> {
  const blocks = await prisma.block.findMany({
    where: {
      OR: [{ reporterId: identityId }, { blockedId: identityId }],
    },
    select: {
      reporterId: true,
      blockedId: true,
    },
  });

  const blockedSet = new Set<string>();
  for (const b of blocks) {
    if (b.reporterId === identityId) blockedSet.add(b.blockedId);
    if (b.blockedId === identityId) blockedSet.add(b.reporterId);
  }
  return blockedSet;
}

/**
 * Search the online pool for a candidate match.
 */
export async function findMatchCandidate(
  identityId: string,
  mode: 'nearest' | 'random' = 'nearest'
): Promise<{ peerId: string; score: number } | null> {
  // 1. Get all members in online:pool
  const members = await redis.smembers('online:pool');
  const potentialPeers = members.filter((id) => id !== identityId);

  if (potentialPeers.length === 0) {
    return null;
  }

  // 2. Filter out any blocked peers
  const blockedIds = await getBlockedIds(identityId);
  const eligiblePeers = potentialPeers.filter((id) => !blockedIds.has(id));

  if (eligiblePeers.length === 0) {
    return null;
  }

  // 3. If mode is random or only one candidate
  if (mode === 'random') {
    const randomIndex = Math.floor(Math.random() * eligiblePeers.length);
    return { peerId: eligiblePeers[randomIndex], score: 0 };
  }

  // 4. Mode is 'nearest': calculate Jaccard similarity against all eligible peers
  const myTagsRaw = await redis.get(`online:${identityId}:tags`);
  const myTags: string[] = myTagsRaw ? JSON.parse(myTagsRaw) : [];

  let bestPeer: string | null = null;
  let bestScore = -1;

  for (const peerId of eligiblePeers) {
    const peerTagsRaw = await redis.get(`online:${peerId}:tags`);
    const peerTags: string[] = peerTagsRaw ? JSON.parse(peerTagsRaw) : [];
    const score = calculateJaccardSimilarity(myTags, peerTags);

    if (score > bestScore) {
      bestScore = score;
      bestPeer = peerId;
    }
  }

  // If score is 0 but we have candidates, fall back to random eligible peer
  if (bestPeer && bestScore >= 0) {
    return { peerId: bestPeer, score: bestScore };
  }

  const randomFallback = eligiblePeers[Math.floor(Math.random() * eligiblePeers.length)];
  return { peerId: randomFallback, score: 0 };
}
