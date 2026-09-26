const crypto = require('crypto');
const PROD_BASE = 'https://external-api.kalshi.com/trade-api/v2';
const ORDER_PATH = '/portfolio/events/orders';

function normalizePrivateKey(value) {
  let key = String(value ?? '').trim();
  // Accommodate PEM text copied from JSON/env representations where newlines
  // arrive as literal "\\n" characters.
  key = key.replace(/\\r/g, '').replace(/\\n/g, '\n').replace(/\r/g, '').trim();
  if (key.startsWith('"') && key.endsWith('"')) {
    try { key = JSON.parse(key); } catch {}
  }
  if (!key) throw new Error('Private key is missing from saved credentials');
  if (!/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(key) || !/-----END (?:RSA )?PRIVATE KEY-----/.test(key)) {
    throw new Error('Saved private key is not a complete PEM key. Re-enter the full Kalshi private key, including BEGIN/END lines.');
  }
  return key;
}

function sign(privateKeyPem, timestampMs, method, path) {
  const pem = normalizePrivateKey(privateKeyPem);
  const signPath = ('/trade-api/v2' + path).split('?')[0];
  const msg = Buffer.from(String(timestampMs) + method.toUpperCase() + signPath, 'utf8');
  const signer = crypto.createSign('sha256');
  signer.update(msg);
  signer.end();
  // Convert once to a Node KeyObject so an undefined/malformed key fails with
  // a useful controller error instead of Node's generic "CryptoKey" message.
  const keyObject = crypto.createPrivateKey(pem);
  return signer.sign({key: keyObject, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST}).toString('base64');
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
          // Kalshi can return structured error objects. Passing an object to
          // Error() turns it into the unhelpful "[object Object]" message.
          const rawDetail = parsed?.message ?? parsed?.error ?? parsed?.code ?? parsed?.details ?? parsed?.raw;
          let detail;
          if (typeof rawDetail === 'string') detail = rawDetail;
          else if (rawDetail != null) { try { detail = JSON.stringify(rawDetail); } catch { detail = String(rawDetail); } }
          else detail = '';
          const orderDebug = body?.ticker ? ` | ORDER_DEBUG ${JSON.stringify({ticker:body.ticker,side:body.side,count:body.count,price:body.price,time_in_force:body.time_in_force,self_trade_prevention_type:body.self_trade_prevention_type,post_only:body.post_only,cancel_order_on_pause:body.cancel_order_on_pause,reduce_only:body.reduce_only,subaccount:body.subaccount,exchange_index:body.exchange_index})}` : '';
          const err = new Error((detail ? `Kalshi HTTP ${res.statusCode}: ${detail}` : `Kalshi HTTP ${res.statusCode}`) + orderDebug);
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

async function getBalance(creds, exchangeIndex) {
  if (!creds || !creds.apiKeyId) throw new Error('API key ID is missing from saved credentials');
  normalizePrivateKey(creds.privateKey ?? creds.private_key ?? creds.privateKeyPem);
  const q = Number.isInteger(exchangeIndex) ? '?exchange_index=' + exchangeIndex : '';
  return request({...creds, privateKeyPem:creds.privateKey ?? creds.private_key ?? creds.privateKeyPem, method:'GET', path:'/portfolio/balance' + q});
}

async function getPositions(creds, ticker, exchangeIndex) {
  const qs=[]; if(ticker)qs.push('ticker='+encodeURIComponent(ticker)); if(Number.isInteger(exchangeIndex))qs.push('exchange_index='+exchangeIndex);
  const q=qs.length?'?'+qs.join('&'):''; return request({...creds, method:'GET', path:'/portfolio/positions'+q});
}

async function getFills(creds, params={}) {
  const qs=[]; for(const [k,v] of Object.entries(params||{})){if(v!==undefined&&v!==null&&v!=='')qs.push(encodeURIComponent(k)+'='+encodeURIComponent(v))}
  return request({...creds, method:'GET', path:'/portfolio/fills'+(qs.length?'?'+qs.join('&'):'')});
}
async function getSettlements(creds, params={}) {
  const qs=[]; for(const [k,v] of Object.entries(params||{})){if(v!==undefined&&v!==null&&v!=='')qs.push(encodeURIComponent(k)+'='+encodeURIComponent(v))}
  return request({...creds, method:'GET', path:'/portfolio/settlements'+(qs.length?'?'+qs.join('&'):'')});
}

async function getOrder(creds, orderId) {
  return request({...creds, method:'GET', path:'/portfolio/orders/' + encodeURIComponent(orderId)});
}

function buildOrderBody({ticker,side,count,priceCents,clientOrderId,reduceOnly=false,exchangeIndex,postOnly,cancelOrderOnPause,subaccount}) {
  if(!ticker || !['bid','ask'].includes(side)) throw new Error('Invalid live order parameters');
  if(!Number.isInteger(count) || count < 1) throw new Error('Count must be a positive integer');
  if(!Number.isFinite(priceCents) || priceCents < 1 || priceCents > 99) throw new Error('Price must be 1–99 cents');

  // V9.16 diagnostic mode: send the documented V2 required fields plus
  // client_order_id. Optional flags are included only when explicitly needed.
  // This removes ambiguity from false-valued optional fields while preserving
  // exchange routing when the active market supplies a valid exchange index.
  const body = {
    ticker,
    client_order_id: clientOrderId,
    side,
    count: Number(count).toFixed(2),
    price: (priceCents / 100).toFixed(4),
    time_in_force: 'immediate_or_cancel',
    self_trade_prevention_type: 'taker_at_cross'
  };

  if (reduceOnly) body.reduce_only = true;
  if (postOnly === true) body.post_only = true;
  if (cancelOrderOnPause === true) body.cancel_order_on_pause = true;
  if (Number.isInteger(subaccount) && subaccount >= 0) body.subaccount = subaccount;
  if (Number.isInteger(exchangeIndex) && exchangeIndex >= 0) body.exchange_index = exchangeIndex;

  return body;
}
async function placeOrder(creds, args) {
  const body=buildOrderBody(args);
  return request({...creds, method:'POST', path:ORDER_PATH, body});
}
function mapOutcomeOrder({outcome,priceCents,reduceOnly=false}) {
  if(outcome==='UP') return {side:reduceOnly?'ask':'bid',priceCents:clampPrice(priceCents)};
  if(outcome==='DOWN') {
    // Entry into DOWN/NO = buy NO, represented on V2 as a YES bid at 1-NO.
    // Exit from DOWN/NO = buy YES to flatten the negative YES position.
    return {side:'bid',priceCents:reduceOnly?clampPrice(priceCents):clampPrice(100-priceCents)};
  }
  throw new Error('Invalid live order outcome');
}
async function placeIOC(creds, {ticker, outcome, count, priceCents, clientOrderId, reduceOnly=false, exchangeIndex}) {
  const mapped=mapOutcomeOrder({outcome,priceCents,reduceOnly});
  return placeOrder(creds,{ticker,side:mapped.side,count,priceCents:mapped.priceCents,clientOrderId,reduceOnly,exchangeIndex});
}
function clampPrice(v){ return Math.max(1, Math.min(99, Math.round(v))); }

module.exports = { getBalance, getPositions, getFills, getSettlements, getOrder, placeIOC, placeOrder, buildOrderBody, mapOutcomeOrder, clampPrice, request };
