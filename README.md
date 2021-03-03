# horizon-data

[![npm version](https://badge.fury.io/js/synthetix-data.svg)](https://badge.fury.io/js/synthetix-data)
[![Discord](https://img.shields.io/discord/413890591840272394.svg?color=768AD4&label=discord&logo=https%3A%2F%2Fdiscordapp.com%2Fassets%2F8c9701b98ad4372b58f13fd9f65f966e.svg)](https://discordapp.com/channels/413890591840272394/)
[![Twitter Follow](https://img.shields.io/twitter/follow/synthetix_io.svg?label=synthetix_io&style=social)](https://twitter.com/synthetix_io)

This is a collection of utilities to query Horizon data from Ethereum. This data has been indexed by The Graph via the various subgraphs the Horizon team maintains ([the subgraph code repo](https://github.com/Horizon-Protocol/horizon-subgraph)).

## Supported queries

The below all return a Promise that resolves with the requested results.

1. `depot.userActions({ user })` Get all depot deposit (`zUSD`) actions for the given user - `deposit`, `withdrawl`, `unaccepted`, `removed`.
2. `depot.clearedDeposits({ fromAddress, toAddress })` Get all cleared zasset deposits (payments of `ETH` for `zUSD`) either from a given `fromAddress` or (and as well as) to a given `toAddress`
3. `depot.exchanges({ from })` Get all depot exchanges (buying zUSD with ETH) for a given `from` address.
4. `exchanges.total()` Get the total exchange volume, total fees and total number of unique exchange addresses.
5. `exchanges.rebates({ minTimestamp = 1 day ago })` Get the last `N` exchange rebates since the given `minTimestamp` in seconds. Ordered in reverse chronological order.
6. `exchanges.reclaims({ minTimestamp = 1 day ago })` Get the last `N` exchange reclaims since the given `minTimestamp` in seconds. Ordered in reverse chronological order.
7. `exchanges.since({ minTimestamp = 1 day ago })` Get the last `N` exchanges since the given `minTimestamp` (in seconds, so one hour ago is `3600`). These are ordered in reverse chronological order.
8. `rate.updates` Get all rate updates for zassets in reverse chronological order
9. `zassets.issuers` Get all wallets that have invoked `Issue` on `zUSD` (other zassets to come)
10. `zassets.transfers` Get zasset transfers in reverse chronological order
11. `zassets.holders` Get all potential zasset holders
12. `hzn.holders` Get the list of wallets that have ever sent or received `HZN`.
13. `hzn.rewards` Get the list of reward escrow holders and their latest balance at vesting entry add or vest.
14. `hzn.total` Get the total count of unique `issuers` and `hznHolders`
15. `hzn.transfers` Get HZN transfers in reverse chronological order
16. `hzn.issued` Get the `Issued` events in reverse chronological order.
17. `hzn.burned` Get the `Burned` events in reverse chronological order.
18. `hzn.feesClaimed` Get the `FeesClaimed` events in reverse chronological order, showing fees in zUSD and rewards in hzn.
19. `hzn.debtSnapshot` Get the historical debt balance for any wallet address.
20. `binaryOptions.markets` Get all the binary options markets created.
21. `binaryOptions.optionTransactions` Get all the Bid and Refund transactions made to the binary options markets.
22. `binaryOptions.historicalOptionPrice` Get historical records of every option price for every market.
23. `etherCollateral.loans` Get the list of all EtherCollateral loans opened.
24. `exchanger.exchangeEntriesSettled({ max, from })` Get the list of all settled exchanges.
25. `exchanges.aggregate({ max, timeSeries })` Get the total amount of exchanges aggregated across various time series.
26. `rate.hznAggregate({ max, timeSeries })` Get the price of hzn aggregated across various time series.
27. `hzn.aggregateActiveStakers({ max, timeSeries })` Get the number of active stakers across various time series.
28. `hzn.totalActiveStakers()` Get the current number of active stakers.
29. `rate.dailyRateChange({ zassets })` get the rate change over the past 24 hours for any zasset. Can pass in a list to retrieve multiple zassets.
30. `hzn.accountsRemovedFromLiquidation({ maxTime, minTime, account, max })` finds all the accounts that have fixed their c-ratio to avoid being at risk of liquidation after being flagged.
31. `hzn.accountsFlaggedForLiquidation({ minTime, maxTime, account, max })` finds all the accounts that have been flagged for liquidation.
32. `hzn.accountsLiquidated({ maxTime, minTime, account, max })` finds all the accounts that have been liquidated after being flagged for liquidation.
33. `hzn.getActiveLiquidations({ max, account, minTime, maxTime })` finds all the accounts that have been flagged and are still pending liquidation or in a waiting state. Can also just check for a specific account if desired.

## Supported subscriptions

The below all return an [Observable](https://github.com/tc39/proposal-observable) that when subscribed to with an object.

1. `exchanges.observe()` Get an observable to `subscribe` to that will `next` the latest exchanges in real time (replays the most recent exchange immediately).
1. `rate.observe()` Get an observable to `subscribe` to that will `next` the latest rates in real time (replays the most recent exchange immediately).

## Use this as a node or webpack dependency

```javascript
const hznData = require('horizon-data'); // common js
// or
import hznData from 'horizon-data'; // es modules

// query and log resolved results
hznData.exchanges
	.since({
		minTimestamp: Math.floor(Date.now() / 1e3) - 3600 * 24, // one day ago
	})
	.then(exchanges => console.log(exchanges));

// subscribe and log streaming results
hznData.exchanges.observe().subscribe({
	next(val) {
		console.log(val);
	},
	error: console.error,
	complete() {
		console.log('done');
	},
});
```

### Use in a browser

```html
<script src="//cdn.jsdelivr.net/npm/horizon-data/browser.js"></script>
<script>
	window.hznData.exchanges
		.since({
			minTimestamp: Math.floor(Date.now() / 1e3) - 3600 * 24, // one day ago
		})
		.then(console.log);

	window.hznData.exchanges.observe().subscribe({ next: console.log });
</script>
```

## How to query via the npm library (CLI)

```bash
# get last 24 hours of exchange activity, ordered from latest to earliest
npx horizon-data exchanges.since

# get exchanges on horizon as they occur in real time (replays the last exchange first)
npx horizon-data exchanges.subscribe
```
