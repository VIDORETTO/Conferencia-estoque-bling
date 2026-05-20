fetch("http://127.0.0.1:3000/api/me")
.then(res => res.text())
.then(console.log)
.catch(console.error);
