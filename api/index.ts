import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import "dotenv/config";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET || "";
const APP_USERNAME = process.env.APP_USERNAME;
const APP_PASSWORD = process.env.APP_PASSWORD;

const safeCompare = (a: string, b: string) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

app.post("/api/app-login", async (req, res) => {
  try {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const { username, password } = req.body;
    if (!JWT_SECRET) {
      return res.status(500).json({ error: "JWT_SECRET não configurado no servidor." });
    }
    if (!APP_USERNAME || !APP_PASSWORD) {
      return res.status(500).json({ error: "Credenciais do app não configuradas no servidor." });
    }
    const isUserValid = safeCompare(username || "", APP_USERNAME);
    const isPassValid = safeCompare(password || "", APP_PASSWORD);
    if (isUserValid && isPassValid) {
      const token = jwt.sign({ user: username }, JWT_SECRET, { expiresIn: "7d" });
      res.cookie("app_auth_token", token, {
        httpOnly: true,
        secure: !!process.env.VERCEL,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      return res.json({ success: true, token });
    }
    return res.status(401).json({ error: "Credenciais inválidas" });
  } catch (error) {
    console.error("[LOGIN_ERROR]", error);
    return res.status(500).json({ error: "Erro interno do servidor ao processar login." });
  }
});

app.post("/api/app-logout", (_req, res) => {
  res.clearCookie("app_auth_token", { httpOnly: true, secure: !!process.env.VERCEL, sameSite: "lax" });
  res.json({ success: true });
});

app.get("/api/app-session", (req, res) => {
  let token: string | undefined = req.cookies?.app_auth_token;
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2) token = parts[1];
  }
  if (!token) return res.json({ authenticated: false });
  try {
    jwt.verify(token, JWT_SECRET);
    return res.json({ authenticated: true });
  } catch {
    return res.json({ authenticated: false });
  }
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[UNHANDLED_ERROR]", err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

export default app;
