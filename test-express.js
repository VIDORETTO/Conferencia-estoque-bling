const express = require('express');
const app = express();

app.use('/api', (req, res, next) => {
  console.log('Middleware hit');
  next();
});

app.get('/api/me', (req, res) => {
  res.send('OK');
});

const request = require('supertest');
request(app)
  .get('/api/me')
  .expect(200)
  .end((err, res) => {
    if (err) throw err;
    console.log('Test passed:', res.text);
  });
