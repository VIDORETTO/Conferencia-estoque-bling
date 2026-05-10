fetch("http://127.0.0.1:3000/api/debug-creds")
.then(r => r.json())
.then(creds => {
  console.log("Creds:", creds);
  return fetch("http://127.0.0.1:3000/api/app-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({username: creds.u, password: creds.p})
  });
})
.then(async res => {
  const isOk = res.ok;
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
