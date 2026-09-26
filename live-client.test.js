const assert = require('assert');
const { buildOrderBody, mapOutcomeOrder, clampPrice } = require('./live-client');

function eq(actual, expected, label){ assert.deepStrictEqual(actual, expected, label); }

eq(mapOutcomeOrder({outcome:'UP',priceCents:55,reduceOnly:false}),{side:'bid',priceCents:55},'UP entry');
eq(mapOutcomeOrder({outcome:'DOWN',priceCents:45,reduceOnly:false}),{side:'bid',priceCents:55},'DOWN entry');
eq(mapOutcomeOrder({outcome:'UP',priceCents:62,reduceOnly:true}),{side:'ask',priceCents:62},'UP exit');
eq(mapOutcomeOrder({outcome:'DOWN',priceCents:62,reduceOnly:true}),{side:'bid',priceCents:62},'DOWN exit');

const body=buildOrderBody({ticker:'TEST-TICKER',side:'bid',count:1,priceCents:55,clientOrderId:'controller-self-test',reduceOnly:false});
assert.strictEqual(body.count,'1.00');
assert.strictEqual(body.price,'0.5500');
assert.strictEqual(body.time_in_force,'immediate_or_cancel');
assert.strictEqual(body.self_trade_prevention_type,'taker_at_cross');
assert.strictEqual(Object.prototype.hasOwnProperty.call(body,'post_only'),false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(body,'cancel_order_on_pause'),false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(body,'subaccount'),false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(body,'exchange_index'),false);

const routed=buildOrderBody({ticker:'TEST-TICKER',side:'bid',count:1,priceCents:55,clientOrderId:'controller-routed-test',reduceOnly:false,exchangeIndex:2});
assert.strictEqual(routed.exchange_index,2);
assert.strictEqual(Object.prototype.hasOwnProperty.call(routed,'post_only'),false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(routed,'reduce_only'),false);

const exit=buildOrderBody({ticker:'TEST-TICKER',side:'ask',count:1,priceCents:62,clientOrderId:'controller-exit-test',reduceOnly:true,exchangeIndex:2});
assert.strictEqual(exit.reduce_only,true);
assert.strictEqual(exit.exchange_index,2);

assert.strictEqual(clampPrice(0),1);
assert.strictEqual(clampPrice(100),99);
assert.strictEqual(clampPrice(55.4),55);

console.log('LIVE EXECUTION SELF-TEST: PASS');
console.log('UP entry: bid @ 55¢');
console.log('DOWN entry: bid YES @ 55¢ for a 45¢ NO price');
console.log('UP exit: ask @ 62¢');
console.log('DOWN exit: bid YES @ 62¢');
console.log('V2 minimal body formatting: PASS');
console.log('Optional routing/reduce-only fields: PASS');
