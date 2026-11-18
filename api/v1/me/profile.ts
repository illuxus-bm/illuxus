// GET /api/v1/me/profile, PATCH /api/v1/me/profile
import { parse, requireUser, route, HttpError } from "../../../server/http.js";
import { asCaller } from "../../../server/db/caller.js";
import { getOwnProfile, updateOwnProfile, updateProfileInput } from "../../../server/services/profile.js";

const handlers = {
  GET: async ({ caller }) => {
    const user = requireUser(caller);
    return asCaller(user, (tx) => getOwnProfile(tx, user.userId));
  },
  PATCH: async ({ req, caller }) => {
    const user = requireUser(caller);
    const body = await req.json().catch(() => {
      throw new HttpError(400, "Body must be JSON", "invalid_input");
    });
    const patch = parse(updateProfileInput, body);
    return asCaller(user, (tx) => updateOwnProfile(tx, user.userId, patch));
  },
} satisfies Parameters<typeof route>[1];

export const GET = route("me.profile", handlers);
export const PATCH = GET;
export const OPTIONS = GET;
