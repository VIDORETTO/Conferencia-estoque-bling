const APP_USERNAME = process.env.APP_USERNAME || "admin";
const APP_PASSWORD = process.env.APP_PASSWORD || "admin";

fetch("http://127.0.0.1:3000/api/app-login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: APP_USERNAME, password: APP_PASSWORD })
})
.then(async res => {
  console.log("Login Status:", res.status);
  const cookie = res.headers.get('set-cookie');
  console.log("Cookies set:", cookie);
  const text = await res.text();
  console.log("Login Body:", text);

  if (cookie) {
    const rawCookie = cookie.split(';')[0];
    const sessionRes = await fetch("http://127.0.0.1:3000/api/app-session", {
      headers: { "Cookie": rawCookie }
    });
    console.log("Session Status:", sessionRes.status);
    console.log("Session Body:", await sessionRes.text());
  }
})
.catch(console.error);
