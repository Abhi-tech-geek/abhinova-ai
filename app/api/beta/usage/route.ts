import { getAuthenticatedUser, UnauthorizedError, unauthorizedResponse } from "@/lib/auth";
import { BETA_LIMITS, isOpenBeta } from "@/lib/beta/config";
import { getBetaUsage } from "@/lib/beta/quota";

// GET → the caller's own beta usage + limits (for the banner). Read-only; the
// counters themselves are only ever written by consume_beta_quota().
export async function GET(): Promise<Response> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
  if (!isOpenBeta()) return Response.json({ beta: false });

  const usage = await getBetaUsage(user);
  return Response.json(
    { beta: true, usage, limits: BETA_LIMITS },
    { headers: { "Cache-Control": "no-store" } }
  );
}
