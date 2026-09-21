const crypto = require('crypto');
const fs = require('fs');

const PROD_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const ORDER_PATH = '/portfolio/events/orders';

function sign(privateKeyPem, timestampMs, method, path) {
  const msg = Buffer.from(String(timestampMs) + method.toUpperCase() + path, 'utf8');
  const signer = crypto.createSign('sha256');
  signer.update(msg);
  signer.end();
  return signer.sign({key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST}).toString('base64');
}

function authHeaders(apiKeyId, privateKeyPem, method, path) {
  const timestamp = Date.now();
  return {
    'KALSHI-ACCESS-KEY': apiKeyId,
    'KALSHI-ACCESS-TIMESTAMP': String(timestamp),
    'KALSHI-ACCESS-SIGNATURE': sign(privateKeyPem, timestamp, method, path),
    'Content-Type': 'application/json'
  };
}

function request({apiKeyId, privateKeyPem, method, path, body, timeoutMs=8000}) {
  return new Promise((resolve,reject)=>{
    const url = new URL(PROD_BASE + path);
    const https = require('https');
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = https.request(url, {
      method,
      headers: {...authHeaders(apiKeyId, privateKeyPem, method, path), ...(payload ? {'Content-Length': payload.length} : {})},
      timeout: timeoutMs
    }, res=>{
      let data='';
      res.on('data', c=>data+=c);
      res.on('end', ()=>{
        let parsed;
        try { parsed = data ? JSON.parse(data) : {}; } catch { parsed = {raw:data}; }
        if(res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(parsed?.message || parsed?.error || ('Kalshi HTTP '+res.statusCode));
          err.statusCode=res.statusCode; err.body=parsed; return reject(err);
        }
        resolve(parsed);
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Kalshi request timed out')));
    req.on('error',reject);
    if(payload) req.write(payload);
    req.end();
  });
}

async function getBalance(creds) {
  return request({...creds, method:'GET', path:'/portfolio/balance'});
}

async function getPositions(creds, ticker) {
  const q = ticker ? '?ticker=' + encodeURIComponent(ticker) : '';
  return request({...creds, method:'GET', path:'/portfolio/positions' + q});
}

async function getOrder(creds, orderId) {
  return request({...creds, method:'GET', path:'/portfolio/orders/' + encodeURIComponent(orderId)});
}

async function placeIOC(creds, {ticker, outcome, count, priceCents, clientOrderId}) {
  if(!ticker || !['UP','DOWN'].includes(outcome)) throw new Error('Invalid live order parameters');
  if(!Number.isInteger(count) || count < 1) throw new Error('Count must be a positive integer');
  if(!Number.isFinite(priceCents) || priceCents < 1 || priceCents > 99) throw new Error('Price must be 1–99 cents');

  // V2 quotes the YES leg: bid = buy YES (UP), ask = sell YES / economically buy NO (DOWN).
  const side = outcome === 'UP' ? 'bid' : 'ask';
  const body = {
    ticker,
    client_order_id: clientOrderId,
    side,
    count: String(count),
    price: (priceCents / 100).toFixed(4),
    time_in_force: 'immediate_or_cancel',
    self_trade_prevention_type: 'taker_at_cross',
    cancel_order_on_pause: true,
    reduce_only: false
  };
  return request({...creds, method:'POST', path:ORDER_PATH, body});
}

module.exports = { getBalance, getPositions, getOrder, placeIOC };
