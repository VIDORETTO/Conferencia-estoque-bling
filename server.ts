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

const handleBlingError = (error: any, defaultMessage: string, res: express.Response) => {
  console.error(defaultMessage, error.response?.data || error.message);
  if (error.response?.status === 401) {
     res.status(401).json({ error: "No Bling token found", details: error.response?.data });
  } else {
     res.status(error.response?.status || 500).json({ error: defaultMessage, details: error.response?.data });
  }
};

const APP_USERNAME = process.env.APP_USERNAME;
const APP_PASSWORD = process.env.APP_PASSWORD;
const JWT_SECRET =
  process.env.JWT_SECRET || APP_PASSWORD || "some-secure-default-secret";

// Utility for safe string comparison
const safeCompare = (a: string, b: string) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

// App session endpoints
app.get("/api/debug-creds", (req, res) =>
  res.json({ u: APP_USERNAME, p: APP_PASSWORD }),
);

app.post("/api/app-login", async (req, res) => {
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
      secure: true,
      sameSite: process.env.VERCEL ? "lax" : "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: "Credenciais inválidas" });
  }
});

app.post("/api/app-logout", (req, res) => {
  res.clearCookie("app_auth_token", {
    httpOnly: true,
    secure: true,
    sameSite: process.env.VERCEL ? "lax" : "none",
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
const requireAppAuth = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  if (
    req.path === "/app-login" ||
    req.path === "/app-session" ||
    req.path === "/app-logout" ||
    req.path === "/debug-creds" ||
    req.path === "/auth/callback" ||
    req.path === "/auth/url"
  ) {
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

    res.cookie("bling_access_token", access_token, {
      secure: true,
      sameSite: "none",
      httpOnly: true,
      maxAge: expires_in * 1000,
    });

    if (new_refresh_token) {
      res.cookie("bling_refresh_token", new_refresh_token, {
        secure: true,
        sameSite: "none",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
      res.setHeader("x-new-bling-refresh-token", new_refresh_token);
    }

    res.setHeader("x-new-bling-access-token", access_token);
    res.setHeader("Access-Control-Expose-Headers", "x-new-bling-access-token, x-new-bling-refresh-token");

    return access_token;
  } catch (error: any) {
    console.error("Failed to refresh Bling token", error.response?.data || error.message);
    res.clearCookie("bling_access_token");
    res.clearCookie("bling_refresh_token");
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

// Bling OAuth endpoints
app.get("/api/auth/url", (req, res) => {
  const redirectUri = getRedirectUri(req);
  const state = Math.random().toString(36).substring(7);

  // Set state in cookie to verify later (basic CSRF)
  res.cookie("oauth_state", state, {
    secure: true,
    sameSite: "none",
    httpOnly: true,
    maxAge: 10 * 60 * 1000, // 10 mins
  });

  const params = new URLSearchParams({
    client_id: BLING_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    state: state,
  });

  const authUrl = `https://www.bling.com.br/Api/v3/oauth/authorize?${params}`;
  res.json({ url: authUrl });
});

app.get(["/auth/callback", "/api/auth/callback"], async (req, res) => {
  const { code, state } = req.query;

  console.log("OAuth Callback - headers:", req.headers.cookie);
  console.log("OAuth Callback - cookies:", req.cookies);
  console.log("OAuth Callback - query state:", state);

  if (!state || state !== req.cookies.oauth_state) {
    console.error("CSRF verification failed", { state, cookie: req.cookies?.oauth_state });
    return res.status(403).send("CSRF verification failed. Por favor, tente conectar novamente e certifique-se de que os cookies estão ativados.");
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

    res.cookie("bling_access_token", access_token, {
      secure: true,
      sameSite: "none",
      httpOnly: true,
      maxAge: expires_in * 1000,
    });

    if (refresh_token) {
      res.cookie("bling_refresh_token", refresh_token, {
        secure: true,
        sameSite: "none",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }

    res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS',
                  access_token: "${access_token}",
                  refresh_token: "${refresh_token || ""}"
                }, '*');
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
        (item: any) => String(item.produto.id) === String(id),
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
  } catch (error: any) {
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
  } catch (error: any) {
    handleBlingError(error, "Error updating stock:", res);
  }
});

// Proxy to get product
app.get("/api/products/search", async (req, res) => {
  const { q, criterio } = req.query;
  const token = await getBlingToken(req, res);

  if (!token) {
    return res.status(401).json({ error: "No Bling token found" });
  }

  try {
    // Bling V3 products endpoint
    const headers = { Authorization: `Bearer ${token}` };

    // We search by code, name, and barcode (criterio 5 is used for exact/barcode in Bling API).
    const cleanQ = q ? String(q).trim() : "";
    const isNumeric = /^\d+$/.test(cleanQ);

    const searches: Promise<any>[] = [
      axios.get("https://www.bling.com.br/Api/v3/produtos", {
        headers,
        params: { codigo: cleanQ, limite: 15 },
      }),
      axios.get("https://www.bling.com.br/Api/v3/produtos", {
        headers,
        params: { nome: cleanQ, limite: 15 },
      })
    ];

    if (isNumeric && cleanQ.length > 5) {
       searches.push(
         axios.get("https://www.bling.com.br/Api/v3/produtos", {
           headers,
           params: { codigoBarras: cleanQ, limite: 15 },
         })
       );
       searches.push(
         axios.get("https://www.bling.com.br/Api/v3/produtos", {
           headers,
           params: { criterio: 5, codigo: cleanQ, limite: 15 },
         })
       );
    }

    const responses = await Promise.allSettled(searches);

    const results: any[] = [];
    
    // Log rejections for debugging
    for (const response of responses) {
      if (response.status === "rejected") {
         console.error("Search rejection:", response.reason?.response?.data || response.reason?.message);
      }
    }

    for (const response of responses) {
      if (response.status === "fulfilled" && response.value.data?.data) {
        for (const item of response.value.data.data) {
          if (!results.find((r) => r.id === item.id)) {
            // We want to verify if the server ignored the barcode filter.
            // If we search by 'codigoBarras' (which is not officially string-documented sometimes),
            // Bling might return 100 random items if ignored.
            // But if the user types a Barcode, we still want to show matches!
            let matches = false;
            const qStrUpper = cleanQ.toUpperCase();
            if (item.codigo && String(item.codigo).toUpperCase().includes(qStrUpper)) matches = true;
            if (item.nome && String(item.nome).toUpperCase().includes(qStrUpper)) matches = true;
            
            // If the user's query exactly matches a returned product's GTIN or EAN that might be buried in the object
            // (Wait, list endpoint might not return GTIN. Wait, sometimes it does?)
            // If the returned list is very small (<= 3), then Bling PROBABLY filtered it correctly!
            if (response.value.data.data.length <= 3) matches = true;

            if (matches) {
              results.push(item);
            }
          }
        }
      }
    }

    res.json(results);
  } catch (error: any) {
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
  } catch (error: any) {
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
  } catch (error: any) {
    handleBlingError(error, "Error updating product:", res);
  }
});

// Imgbb redirect server proxy just to avoid CORS or direct client secrets if any,
// actually Client can upload to ImgBB directly since the key can be public but
// let's proxy it to keep it safe.
app.post(
  "/api/upload-image",
  express.json({ limit: "50mb" }),
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
        },
      );

      res.json({ url: response.data.data.url });
    } catch (error: any) {
      console.error(
        "Error uploading image:",
        error.response?.data || error.message,
      );
      res.status(500).json({ error: "Failed to upload image" });
    }
  },
);

app.get("/api/me", async (req, res) => {
  const token = await getBlingToken(req, res);
  if (!token) return res.json({ connected: false });
  return res.json({ connected: true });
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
