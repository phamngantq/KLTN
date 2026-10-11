import type { ParentProfile, UpdateParentProfileInput } from '../../../shared/schemas/parents';
import type { Db } from '../../db/client';
import { AppError } from '../../lib/errors';
import * as repo from './repository';

export async function getOwnProfile(db: Db, userId: string): Promise<ParentProfile> {
  const profile = await repo.findOwnProfile(db, userId);
  if (!profile) throw new AppError(404, 'PROFILE_NOT_FOUND', 'Không tìm thấy hồ sơ.');
  return profile;
}

export async function updateOwnProfile(
  db: Db,
  userId: string,
  input: UpdateParentProfileInput,
): Promise<ParentProfile> {
  await repo.updateOwnProfile(db, userId, input, new Date().toISOString());
  return getOwnProfile(db, userId);
}
