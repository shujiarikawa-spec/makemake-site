const challengeHeaders = {
  "cache-control": "no-store",
  "content-type": "text/plain; charset=utf-8",
  "www-authenticate": 'Basic realm="Makemake SEO Dashboard", charset="UTF-8"'
};

export function hasDashboardAccess(request, env) {
  const username = env.DASHBOARD_ACCESS_USERNAME;
  const password = env.DASHBOARD_ACCESS_PASSWORD;
  if (!username || !password) return false;
  return request.headers.get("authorization") === `Basic ${btoa(`${username}:${password}`)}`;
}

export function dashboardAuthRequired(env) {
  const state = !env.DASHBOARD_ACCESS_USERNAME ? "username-missing" : !env.DASHBOARD_ACCESS_PASSWORD ? "password-missing" : "credentials-mismatch";
  return new Response("Dashboard authentication required.", { status: 401, headers: { ...challengeHeaders, "x-dashboard-auth-state": state } });
}
