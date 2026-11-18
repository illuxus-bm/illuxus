/** The signed-in person's own profile. Row security limits it to their row. */
import { z } from "zod";
import type { Tx } from "../db/caller.js";
import { HttpError } from "../http.js";

export async function getOwnProfile(tx: Tx, userId: string) {
  const profile = await tx.profiles.findUnique({ where: { user_id: userId } });
  if (!profile) throw new HttpError(404, "Profile not found", "not_found");
  return profile;
}

/** Fields a person may change on their own profile through this endpoint. */
export const updateProfileInput = z
  .object({
    display_name: z.string().trim().max(120).nullable(),
    headline: z.string().trim().max(160).nullable(),
    bio: z.string().trim().max(2000).nullable(),
    first_name: z.string().trim().max(80).nullable(),
    last_name: z.string().trim().max(80).nullable(),
    designation: z.string().trim().max(120).nullable(),
    company: z.string().trim().max(160).nullable(),
    linkedin_url: z.string().trim().url().max(255).nullable(),
    company_website: z.string().trim().url().max(255).nullable(),
  })
  .partial()
  .strict();

export async function updateOwnProfile(tx: Tx, userId: string, patch: z.infer<typeof updateProfileInput>) {
  if (Object.keys(patch).length === 0) throw new HttpError(400, "Nothing to update", "invalid_input");
  // updateMany + the user_id filter: row security still has the final word,
  // and a missing row is a 404 rather than an exception.
  const { count } = await tx.profiles.updateMany({ where: { user_id: userId }, data: { ...patch, updated_at: new Date() } });
  if (count === 0) throw new HttpError(404, "Profile not found", "not_found");
  return getOwnProfile(tx, userId);
}
