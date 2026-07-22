import { db } from '@/server/db/prisma'
import {
  createOrReuseTrackingShare,
  getPublicTrackingByToken,
  revokeTrackingShare,
  type TrackingActor,
} from '@/server/tracking/tracking-share'

export function getPublicTracking(token: string) {
  return getPublicTrackingByToken(db, token)
}

export function createTrackingShare(serviceId: string, actor: TrackingActor) {
  return createOrReuseTrackingShare(db, serviceId, actor)
}

export function revokePublicTrackingShare(serviceId: string, actor: TrackingActor) {
  return revokeTrackingShare(db, serviceId, actor)
}
