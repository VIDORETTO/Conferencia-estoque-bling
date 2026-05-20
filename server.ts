import express from "express";
import cookieParser from "cookie-parser";
import axios from "axios";
import path from "path";
import "dotenv/config";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());

const BLING_CLIENT_ID = process.env.BLING_CLIENT_ID;
const BLING_CLIENT_SECRET = process.env.BLING_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

axios.defaults.timeout = 15000;

const handleBlingError = (error: unknown, defaultMessage: string, res: express.Response) => {
  const err = error as { response?: { data?: unknown; status?: number }; message?: string };
  console.error(defaultMessage, err.response?.data || err.message);
  const statusCode = err.response?.status || 500;
  if (!res.headersSent) {
    if (statusCode === 401) {
      res.status(401).json({ error: "No Bling token found", details: err.response?.data });
    } else {
      res.status(statusCode).json({ error: defaultMessage, details: err.response?.data });
    }
  }
};

const APP_USERNAME = process.env.APP_USERNAME;
const APP_PASSWORD = process.env.APP_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("[FATAL] JWT_SECRET não definido. Defina JWT_SECRET nas variáveis de ambiente.");
  // Não chamamos process.exit() em serverless — a função continuará mas retornará erros nas rotas que precisam de JWT.
}

// Utility for safe string comparison
const safeCompare = (a: string, b: string) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

// App session endpoints
app.post("/api/app-login", async (req, res) => {
  try {
    // Artificial delay to mitigate brute-force attacks
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const { username, password } = req.body;

    if (!APP_USERNAME || !APP_PASSWORD) {
      return res.status(500).json({
        error: "As credenciais do app não estão configuradas no servidor.",
      });
    }

    const isUserValid = safeCompare(username || "", APP_USERNAME);
    const isPassValid = safeCompare(password || "", APP_PASSWORD);

    if (isUserValid && isPassValid) {
      const token = jwt.sign({ user: username }, JWT_SECRET, {
        expiresIn: "7d",
      });
      res.cookie("app_auth_token", token, {
        httpOnly: true,
        secure: !!process.env.VERCEL,
        sameSite: process.env.VERCEL ? "lax" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.json({ success: true, token });
    } else {
      res.status(401).json({ error: "Credenciais inválidas" });
    }
  } catch (error) {
    console.error("[LOGIN_ERROR]", error);
    res.status(500).json({ error: "Erro interno do servidor ao processar login." });
  }
});

app.post("/api/app-logout", (req, res) => {
  res.clearCookie("app_auth_token", {
    httpOnly: true,
    secure: !!process.env.VERCEL,
    sameSite: "lax",
  });
  res.json({ success: true });
});

app.get("/api/app-session", (req, res) => {
  let token = req.cookies.app_auth_token;
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) return res.json({ authenticated: false });
  try {
    jwt.verify(token, JWT_SECRET);
    res.json({ authenticated: true });
  } catch (e) {
    res.json({ authenticated: false });
  }
});

// Middleware to protect internal API calls
const PUBLIC_API_PATHS = [
  "/app-login",
  "/app-session",
  "/app-logout",
  "/me",
];

const requireAppAuth = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  if (PUBLIC_API_PATHS.includes(req.path)) {
    return next();
  }
  let token = req.cookies.app_auth_token;
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: "Unauthorized - Invalid token" });
  }
};

interface RefreshTokenResult {
  access_token: string;
  new_refresh_token: string;
  expires_in: number;
}

interface BlingProduct {
  id: number;
  nome: string;
  codigo: string;
  codigoBarras?: string;
  gtin?: string;
  preco: number;
  tipo: string;
  situacao: string;
  formato: string;
  descricaoCurta?: string;
  midia?: {
    imagens?: {
      imagensURL?: Array<{ link: string }>;
      externas?: Array<{ link: string }>;
      internas?: Array<{ link: string }>;
    };
  };
}

interface BlingStockItem {
  produto: { id: number };
  saldoFisicoTotal: number;
  saldoVirtualTotal: number;
  depositos?: Array<{ id: number }>;
}

let pendingRefresh: Promise<RefreshTokenResult | null> | null = null;

const getBlingToken = async (req: express.Request, res: express.Response): Promise<string | null> => {
  let token = req.cookies.bling_access_token;
  if (!token && req.headers["x-bling-token"]) {
    token = req.headers["x-bling-token"] as string;
  }
  if (token) return token;

  let refreshToken = req.cookies.bling_refresh_token;
  if (!refreshToken && req.headers["x-bling-refresh-token"]) {
    refreshToken = req.headers["x-bling-refresh-token"] as string;
  }
  if (!refreshToken) return null;

  if (!pendingRefresh) {
    pendingRefresh = doRefreshToken(refreshToken).finally(() => {
      pendingRefresh = null;
    });
  }

  return pendingRefresh.then((result) => {
    if (!result) return null;

    const { access_token, new_refresh_token, expires_in } = result;
    const isSecure = !!process.env.VERCEL;

    res.cookie("bling_access_token", access_token, {
      secure: isSecure,
      sameSite: isSecure ? "none" : "lax",
      httpOnly: true,
      maxAge: expires_in * 1000,
    });

    if (new_refresh_token) {
      res.cookie("bling_refresh_token", new_refresh_token, {
        secure: isSecure,
        sameSite: isSecure ? "none" : "lax",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
      res.setHeader("x-new-bling-refresh-token", new_refresh_token);
    }

    res.setHeader("x-new-bling-access-token", access_token);
    res.setHeader("Access-Control-Expose-Headers", "x-new-bling-access-token, x-new-bling-refresh-token");

    return access_token;
  });
};

const doRefreshToken = async (refreshToken: string) => {
  try {
    const credentials = Buffer.from(
      `${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`,
    ).toString("base64");
    
    const response = await axios.post(
      "https://www.bling.com.br/Api/v3/oauth/token",
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "1.0",
        },
      },
    );

    const { access_token, refresh_token: new_refresh_token, expires_in } = response.data;
    return { access_token, new_refresh_token, expires_in };
  } catch (error) {
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error("Failed to refresh Bling token", err.response?.data || err.message);
    return null;
  }
};

// Protect all /api routes
app.use("/api", requireAppAuth);

// Get Redirect URI (handle both dev/prod URL)
const getRedirectUri = (req: express.Request) => {
  if (process.env.REDIRECT_URI) {
    return process.env.REDIRECT_URI;
  }
  
  if (process.env.APP_URL) {
    return `${process.env.APP_URL}/api/auth/callback`;
  }

  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");

  return `${protocol}://${host}/api/auth/callback`;
};

const getAppOrigin = (req: express.Request): string => {
  try {
    return new URL(getRedirectUri(req)).origin;
  } catch {
    return "*";
  }
};

// Generate an OAuth state parameter as a self-contained JWT.
// No cookies, no in-memory storage, no special characters in the state.
// The JWT contains a nonce and an expiration, and is signed with JWT_SECRET.
// It's encoded as base64url (safe for URL query parameters, no dots or special chars).
const generateOAuthState = (): string => {
  const nonce = crypto.randomBytes(16).toString("hex");
  // Create a JWT-like token: base64url(header).base64url(payload).base64url(signature)
  // But base64url still has dots in JWT format! Instead, encode the WHOLE payload + signature
  // as a single base64url string (no dots at all).
  const payload = JSON.stringify({ nonce, iat: Date.now() });
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(payload).digest("base64url");
  // Combine: base64url(payload) + "." + base64url(signature) - but NO dots!
  // Use URL-safe concatenation: base64url(payload) + "~" + base64url(signature)
  const payloadB64 = Buffer.from(payload).toString("base64url");
  return `${payloadB64}~${signature}`;
};

const verifyOAuthState = (stateStr: string): boolean => {
  try {
    const tildeIndex = stateStr.indexOf("~");
    if (tildeIndex === -1) return false;
    const payloadB64 = stateStr.substring(0, tildeIndex);
    const signature = stateStr.substring(tildeIndex + 1);
    
    // Verify signature
    const payload = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(payload).digest("base64url");
    
    if (expectedSig.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature));
  } catch {
    return false;
  }
};

// Bling OAuth endpoints
app.get("/api/auth/url", (req, res) => {
  const redirectUri = getRedirectUri(req);
  const state = generateOAuthState();

  // Also set a cookie as best-effort fallback for browsers that support it
  res.cookie("oauth_state", state, {
    secure: !!process.env.VERCEL, // false for local HTTP, true for production HTTPS
    sameSite: process.env.VERCEL ? "lax" : "lax",
    path: "/",
    httpOnly: true,
    maxAge: 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    client_id: BLING_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    state: state,
  });

  const authUrl = `https://www.bling.com.br/Api/v3/oauth/authorize?${params}`;
  res.json({ url: authUrl, state });
});

app.get(["/auth/callback", "/api/auth/callback"], async (req, res) => {
  const { code, state } = req.query;
  const stateStr = state as string;

  console.log("OAuth Callback - callback hit, state length:", stateStr?.length);

  // Verify state parameter via JWT-like signature (works everywhere, no cookie dependency)
  const isValidState = stateStr ? verifyOAuthState(stateStr) : false;

  if (!isValidState) {
    console.error("CSRF verification failed - state param invalid", {
      stateLength: stateStr?.length,
      hasTilde: stateStr?.includes("~"),
    });
    return res.status(403).send("Falha na verificação CSRF. Tente novamente.");
  }

  // Exchange code for token
  try {
    const credentials = Buffer.from(
      `${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`,
    ).toString("base64");
    const response = await axios.post(
      "https://www.bling.com.br/Api/v3/oauth/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code: code as string,
        redirect_uri: getRedirectUri(req),
      }),
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "1.0",
        },
      },
    );

    const { access_token, refresh_token, expires_in } = response.data;

    const isSecure = !!process.env.VERCEL;

    res.cookie("bling_access_token", access_token, {
      secure: isSecure,
      sameSite: isSecure ? "none" : "lax",
      httpOnly: true,
      maxAge: expires_in * 1000,
    });

    if (refresh_token) {
      res.cookie("bling_refresh_token", refresh_token, {
        secure: isSecure,
        sameSite: isSecure ? "none" : "lax",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }

    const appOrigin = getAppOrigin(req);
    res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS'
                }, ${JSON.stringify(appOrigin)});
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. You can close this window.</p>
          </body>
        </html>
      `);
  } catch (error) {
    console.error("Bling OAuth Error:", error);
    res.status(500).send("OAuth exchange failed");
  }
});

app.get("/api/products/stock/:id", async (req, res) => {
  const { id } = req.params;
  const token = await getBlingToken(req, res);

  if (!token) {
    return res.status(401).json({ error: "No Bling token found" });
  }

  try {
    const response = await axios.get(
      "https://www.bling.com.br/Api/v3/estoques/saldos",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          idsProdutos: [Number(id)],
        },
      },
    );

    const data = response.data.data;
    if (data && data.length > 0) {
      // Find the record for this product ID
      const productStock = data.find(
        (item: BlingStockItem) => String(item.produto.id) === String(id),
      );
      if (productStock) {
        return res.json({
          saldoFisicoTotal: productStock.saldoFisicoTotal,
          saldoVirtualTotal: productStock.saldoVirtualTotal,
          depositoId: productStock.depositos?.[0]?.id,
        });
      }
    }

    res.json({ saldoFisicoTotal: 0, saldoVirtualTotal: 0, depositoId: null });
  } catch (error) {
    handleBlingError(error, "Error fetching stock:", res);
  }
});

// Post stock balance operation
app.post("/api/products/stock/:id", async (req, res) => {
  const { id } = req.params;
  const { quantidade, depositoId } = req.body;
  const token = await getBlingToken(req, res);

  if (!token) {
    return res.status(401).json({ error: "No Bling token found" });
  }

  try {
    // If we don't have a specific deposit, try to fetch the default one
    let targetDeposito = depositoId;
    if (!targetDeposito) {
      const depRes = await axios.get(
        "https://www.bling.com.br/Api/v3/depositos",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (depRes.data?.data?.length > 0) {
        targetDeposito = depRes.data.data[0].id;
      }
    }

    if (!targetDeposito) {
      return res.status(400).json({ error: "Nenhum depósito encontrado para realizar o balanço de estoque." });
    }

    const payload = {
      produto: { id: Number(id) },
      deposito: { id: Number(targetDeposito) },
      operacao: "B",
      preco: 0,
      custo: 0,
      quantidade: Number(quantidade),
      observacoes: "Balanço via aplicativo",
    };

    const response = await axios.post(
      "https://www.bling.com.br/Api/v3/estoques",
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    res.json(response.data);
  } catch (error) {
    handleBlingError(error, "Error updating stock:", res);
  }
});

// Product search with prioritized queries (code > barcode > name)
// Uses Bling API v3 /produtos endpoint with specific filters.
// Falls back through different search strategies automatically.
app.get("/api/products/search", async (req, res) => {
  const { q } = req.query;
  const token = await getBlingToken(req, res);

  if (!token) {
    return res.status(401).json({ error: "No Bling token found" });
  }

  try {
    const headers = { Authorization: `Bearer ${token}` };
    const cleanQ = q ? String(q).trim() : "";
    
    if (!cleanQ) {
      return res.json([]);
    }

    const isNumeric = /^\d+$/.test(cleanQ);
    const results: BlingProduct[] = [];
    const seenIds = new Set<number>();

    // Helper to add unique results
    const addUniqueResults = (items: BlingProduct[]) => {
      for (const item of items) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          results.push(item);
        }
      }
    };

    // Strategy 1: Search by EXACT code (most specific)
    try {
      const byCode = await axios.get("https://www.bling.com.br/Api/v3/produtos", {
        headers,
        params: { codigo: cleanQ, limite: 5 },
      });
      if (byCode.data?.data) {
        addUniqueResults(byCode.data.data);
      }
    } catch (e) {
      const err = e as { response?: { data?: unknown }; message?: string };
      console.error("Code search failed:", err.response?.data || err.message);
    }

    // Strategy 2: If numeric and > 5 chars, try barcode (codigoBarras)
    if (isNumeric && cleanQ.length > 5) {
      try {
        const byBarcode = await axios.get("https://www.bling.com.br/Api/v3/produtos", {
          headers,
          params: { codigoBarras: cleanQ, limite: 5 },
        });
        if (byBarcode.data?.data) {
          // IMPORTANT: Bling API v3 often IGNORES the codigoBarras filter
          // and returns ALL products (up to limite). If we got exactly 0 or 1 result,
          // the filter worked. If more than 1, the filter was likely ignored.
          const barcodeResults = byBarcode.data.data;
          if (barcodeResults.length <= 2) {
            // Filter worked correctly - these ARE barcode matches
            addUniqueResults(barcodeResults);
          } else {
            // Filter was ignored - only include items where codigoBarras matches EXACTLY
            for (const item of barcodeResults) {
              const itemBarcode = item.codigoBarras || item.gtin || "";
              if (String(itemBarcode) === cleanQ && !seenIds.has(item.id)) {
                seenIds.add(item.id);
                results.push(item);
              }
            }
          }
        }
      } catch (e) {
        const err = e as { response?: { data?: unknown }; message?: string };
        console.error("Barcode search failed:", err.response?.data || err.message);
      }
    }

    // Strategy 3: Search by name (least specific, but catches everything)
    // Only if we have fewer than 3 results so far (avoid too many results)
    if (results.length < 3) {
      try {
        const byName = await axios.get("https://www.bling.com.br/Api/v3/produtos", {
          headers,
          params: { nome: cleanQ, limite: 15 },
        });
        if (byName.data?.data) {
          addUniqueResults(byName.data.data);
        }
      } catch (e) {
        const err = e as { response?: { data?: unknown }; message?: string };
        console.error("Name search failed:", err.response?.data || err.message);
      }
    }

    // Strategy 4: If still no results and numeric, try partial code match
    // Some products may have codes that contain the search term
    if (results.length === 0 && isNumeric) {
      try {
        // Try with blank codigo to get ALL products, then filter (last resort)
        const allProducts = await axios.get("https://www.bling.com.br/Api/v3/produtos", {
          headers,
          params: { situacao: "A", limite: 20 },
        });
        if (allProducts.data?.data) {
          for (const item of allProducts.data.data) {
            const itemCode = String(item.codigo || "");
            if (itemCode.includes(cleanQ) && !seenIds.has(item.id)) {
              seenIds.add(item.id);
              results.push(item);
            }
          }
        }
      } catch (e) {
        const err = e as { response?: { data?: unknown }; message?: string };
        console.error("Fallback search failed:", err.response?.data || err.message);
      }
    }

    // Map image URLs for the frontend
    const mappedResults = results.map((item: BlingProduct) => ({
      ...item,
      // Ensure imagemURL is set properly (frontend also does this, but be safe)
      imagemURL:
        item.midia?.imagens?.imagensURL?.[0]?.link ||
        item.midia?.imagens?.externas?.[0]?.link ||
        item.midia?.imagens?.internas?.[0]?.link ||
        "",
    }));

    res.json(mappedResults);
  } catch (error) {
    handleBlingError(error, "Error fetching products:", res);
  }
});

// Get full product details
app.get("/api/products/:id", async (req, res) => {
  const id = req.params.id;
  const token = await getBlingToken(req, res);

  if (!token) return res.status(401).json({ error: "No Bling token found" });

  try {
    const response = await axios.get(
      `https://www.bling.com.br/Api/v3/produtos/${id}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    res.json(response.data.data);
  } catch (error) {
    handleBlingError(error, "Error fetching product details:", res);
  }
});

// Save product details
app.put("/api/products/:id", async (req, res) => {
  const id = req.params.id;
  const token = await getBlingToken(req, res);

  if (!token) return res.status(401).json({ error: "No Bling token found" });

  try {
    // Since Bling API requires specific formats, we should map the body properly.
    // Here we acts as a proxy for the PUT product. The client sends valid Bling format.
    const response = await axios.put(
      `https://www.bling.com.br/Api/v3/produtos/${id}`,
      req.body,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    res.json(response.data);
  } catch (error) {
    handleBlingError(error, "Error updating product:", res);
  }
});

// Imgbb redirect server proxy just to avoid CORS or direct client secrets if any,
// actually Client can upload to ImgBB directly since the key can be public but
// let's proxy it to keep it safe.
app.post(
  "/api/upload-image",
  async (req, res) => {
    const { imageBase64 } = req.body; // base64 without data:image...
    const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

    if (!IMGBB_API_KEY) {
      return res.status(500).json({ error: "Missing ImgBB API key" });
    }

    try {
      const formData = new URLSearchParams();
      formData.append("key", IMGBB_API_KEY);
      formData.append("image", imageBase64);

      const response = await axios.post(
        "https://api.imgbb.com/1/upload",
        formData.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          timeout: 30000,
        },
      );

      res.json({ url: response.data.data.url });
    } catch (error) {
      const err = error as { response?: { data?: unknown }; message?: string };
      console.error(
        "Error uploading image:",
        err.response?.data || err.message,
      );
      res.status(500).json({ error: "Failed to upload image" });
    }
  },
);

app.get("/api/me", async (req, res) => {
  try {
    const token = await getBlingToken(req, res);
    if (!token) return res.json({ connected: false });
    return res.json({ connected: true });
  } catch (error) {
    console.error("[ME_ERROR]", error);
    res.json({ connected: false });
  }
});

// Export the app for Vercel
export default app;

// Setup static serving or Vite middleware only in local development
async function startLocalServer() {
  if (process.env.NODE_ENV !== "production") {
    // Dynamic import to avoid crash in Vercel production
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startLocalServer();
}
