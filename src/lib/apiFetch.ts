export const apiFetch = async (...args: Parameters<typeof fetch>) => {
  let [resource, config] = args;
  const token = localStorage.getItem("app_auth_token");
  const blingToken = localStorage.getItem("bling_access_token");
  if (token || blingToken) {
    config = config || {};
    config.headers = {
      ...config.headers,
    };
    if (token) (config.headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    if (blingToken) (config.headers as Record<string, string>)["x-bling-token"] = blingToken;
  }
  const response = await fetch(resource, config);
  
  if (response.status === 401 && typeof window !== "undefined") {
    // Only dispatch for unexpected 401s, not during login checks
    if (resource !== "/api/app-session" && resource !== "/api/app-login" && resource !== "/api/me") {
       window.dispatchEvent(new Event("auth_error"));
    }
  }
  
  return response;
};
