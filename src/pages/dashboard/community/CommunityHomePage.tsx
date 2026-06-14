import { Navigate, useParams } from "react-router-dom";

/**
 * Bare entry — redirects /dashboard/community/:slug to its feed page.
 * Kept as its own component so the route tree stays uniform.
 */
export default function CommunityHomePage() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <Navigate to="/community" replace />;
  return <Navigate to={`/community/${slug}/feed`} replace />;
}
