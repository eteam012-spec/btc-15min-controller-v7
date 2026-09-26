const assert = require('assert');
const { buildOrderBody, mapOutcomeOrder, clampPrice } = require('./live-client');

function eq(actual, expected, label){ assert.deepStrictEqual(actual, expected, label); }

eq(mapOutcomeOrder({outcome:'UP',priceCents:55,reduceOnly:false}),{side:'bid',priceCents:55},'UP entry');
eq(mapOutcomeOrder({outcome:'DOWN',priceCents:45,reduceOnly:false}),{side:'bid',priceCents:55},'DOWN entry');
eq(mapOutcomeOrder({outcome:'UP',priceCents:62,reduceOnly:true}),{side:'ask',priceCents:62},'UP exit');
eq(mapOutcomeOrder({outcome:'DOWN',priceCents:62,reduceOnly:true}),{side:'bid',priceCents:62},'DOWN exit');

const body=buildOrderBody({ticker:'TEST-TICKER',side:'bid',count:1,priceCents:55,clientOrderId:'controller-self-test',reduceOnly:false,exchangeIndex:0});
assert.strictEqual(body.count,'1.00');
assert.strictEqual(body.price,'0.5500');
assert.strictEqual(body.time_in_force,'immediate_or_cancel');
assert.strictEqual(body.self_trade_prevention_type,'taker_at_cross');
assert.strictEqual(body.post_only,false);
assert.strictEqual(body.cancel_order_on_pause,false);
assert.strictEqual(body.subaccount,0);
assert.strictEqual(body.exchange_index,0);

assert.strictEqual(clampPrice(0),1);
assert.strictEqual(clampPrice(100),99);
assert.strictEqual(clampPrice(55.4),55);

console.log('LIVE EXECUTION SELF-TEST: PASS');
console.log('UP entry: bid @ 55¢');
console.log('DOWN entry: bid YES @ 55¢ for a 45¢ NO price');
console.log('UP exit: ask @ 62¢');
console.log('DOWN exit: bid YES @ 62¢');
console.log('V2 body formatting: PASS');
