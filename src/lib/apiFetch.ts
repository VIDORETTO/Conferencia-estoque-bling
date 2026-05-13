export const apiFetch = async (...args: Parameters<typeof fetch>) => {
  let [resource, config] = args;
  const token = localStorage.getItem("app_auth_token");
  const blingToken = localStorage.getItem("bling_access_token");
  const blingRefreshToken = localStorage.getItem("bling_refresh_token");
  const oauthState = localStorage.getItem("oauth_state");
  
  config = config || {};
  if (!config.headers) config.headers = {};
  const headers = config.headers as Record<string, string>;

  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (blingToken) headers["x-bling-token"] = blingToken;
  if (blingRefreshToken) headers["x-bling-refresh-token"] = blingRefreshToken;
  // Pass the OAuth state as a fallback header for CSRF verification
  if (oauthState) headers["x-oauth-state"] = oauthState;

  const response = await fetch(resource, config);
  
  if (response.headers.has("x-new-bling-access-token")) {
    const newAccess = response.headers.get("x-new-bling-access-token");
    if (newAccess) localStorage.setItem("bling_access_token", newAccess);
  }
  if (response.headers.has("x-new-bling-refresh-token")) {
    const newRefresh = response.headers.get("x-new-bling-refresh-token");
    if (newRefresh) localStorage.setItem("bling_refresh_token", newRefresh);
  }
  
  if (response.status === 401 && typeof window !== "undefined") {
    // Only dispatch for unexpected 401s, not during login checks
    const urlStr = typeof resource === "string" ? resource : (resource instanceof Request ? resource.url : "");
    if (urlStr !== "/api/app-session" && urlStr !== "/api/app-login" && urlStr !== "/api/me") {
      // Check if it's a bling token error by reading the response without consuming it completely
      let isBlingError = false;
      try {
        const cloned = response.clone();
        const body = await cloned.json();
        if (body?.error === "No Bling token found") {
           isBlingError = true;
           window.dispatchEvent(new Event("bling_auth_error"));
        }
      } catch (e) {}

      if (!isBlingError) {
         window.dispatchEvent(new Event("auth_error"));
      }
    }
  }
  
  return response;
};
