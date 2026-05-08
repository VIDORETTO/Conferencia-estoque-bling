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
    res.json({ success: true });
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
  const token = req.cookies.app_auth_token;
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
    req.path === "/app-logout"
  ) {
    return next();
  }
  const token = req.cookies.app_auth_token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: "Unauthorized - Invalid token" });
  }
};

// Protect all /api routes
app.use("/api", requireAppAuth);

// Get Redirect URI (handle both dev/prod URL)
const getRedirectUri = () => {
  return `${APP_URL}/auth/callback`;
};

// Bling OAuth endpoints
app.get("/api/auth/url", (req, res) => {
  const redirectUri = getRedirectUri();
  const state = Math.random().toString(36).substring(7);

  // Set state in cookie to verify later (basic CSRF)
  res.cookie("oauth_state", state, {
    secure: true,
    sameSite: process.env.VERCEL ? "lax" : "none",
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

  if (!state || state !== req.cookies.oauth_state) {
    return res.status(403).send("CSRF verification failed");
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
      sameSite: process.env.VERCEL ? "lax" : "none",
      httpOnly: true,
      maxAge: expires_in * 1000,
    });

    if (refresh_token) {
      res.cookie("bling_refresh_token", refresh_token, {
        secure: true,
        sameSite: process.env.VERCEL ? "lax" : "none",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }

    res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
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
  const token = req.cookies.bling_access_token;

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
          "idsProdutos[]": id,
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
        });
      }
    }

    res.json({ saldoFisicoTotal: 0, saldoVirtualTotal: 0 });
  } catch (error: any) {
    console.error(
      "Error fetching stock:",
      error.response?.data || error.message,
    );
    res.status(error.response?.status || 500).json({
      error: "Failed to fetch stock",
      details: error.response?.data,
    });
  }
});

// Proxy to get product
app.get("/api/products/search", async (req, res) => {
  const { q, criterio } = req.query;
  const token = req.cookies.bling_access_token;

  if (!token) {
    return res.status(401).json({ error: "No Bling token found" });
  }

  try {
    // Bling V3 products endpoint
    // We can search by name, or code depending on the params
    let params: Record<string, any> = {};

    // If the query is an EAN/GTIN usually it's just code
    // According to Bling API v3, /produtos allows filtering by id, codigo, etc.
    // criterion 1 = Name, criterion 2 = code, criterion 5 = EAN.
    // Let's pass 'criterio' param to know if it's name, sku etc.
    if (criterio === "codigo") {
      params.codigo = q;
    } else if (criterio === "nome") {
      params.nome = q;
    } else {
      params.nome = q; // generic fallback
    }

    // Include all params?
    params = { ...params, limite: 10 };

    const response = await axios.get(
      "https://www.bling.com.br/Api/v3/produtos",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params,
      },
    );

    res.json(response.data.data);
  } catch (error: any) {
    console.error(
      "Error fetching products:",
      error.response?.data || error.message,
    );
    res.status(error.response?.status || 500).json({
      error: "Failed to fetch products",
      details: error.response?.data,
    });
  }
});

// Get full product details
app.get("/api/products/:id", async (req, res) => {
  const id = req.params.id;
  const token = req.cookies.bling_access_token;

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
    console.error(
      "Error fetching product details:",
      error.response?.data || error.message,
    );
    res.status(error.response?.status || 500).json({
      error: "Failed to fetch product details",
      details: error.response?.data,
    });
  }
});

// Save product details
app.put("/api/products/:id", async (req, res) => {
  const id = req.params.id;
  const token = req.cookies.bling_access_token;

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
    console.error(
      "Error updating product:",
      error.response?.data || error.message,
    );
    res.status(error.response?.status || 500).json({
      error: "Failed to update product",
      details: error.response?.data,
    });
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
  const token = req.cookies.bling_access_token;
  if (!token) return res.json({ connected: false });
  return res.json({ connected: true });
});

// Vite middleware for development
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

if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
