#!/usr/bin/env node

const program = require('commander');
const stringify = require('csv-stringify');
const moment = require('moment');

const {
	exchanges,
	depot,
	zassets,
	rate,
	hzn,
	binaryOptions,
	etherCollateral,
	limitOrders,
	exchanger,
	liquidations,
} = require('.');

const logResults = ({ json } = {}) => results => {
	console.log(json ? JSON.stringify(results, null, 2) : results);
	return results;
};

const showResultCount = ({ max }) => results => {
	if (process.env.DEBUG) {
		console.log(`${results.length} entries returned (max supplied: ${max})`);
	}
};

program
	.command('depot.userActions')
	.option('-u, --user <value>', 'An address')
	.option('-m, --max <value>', 'Maximum number of results', 10)
	.action(async ({ max, user }) => {
		depot
			.userActions({ max, user })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('depot.clearedDeposits')
	.option('-f, --from-address <value>', 'A from address')
	.option('-t, --to-address <value>', 'A to address')
	.option('-m, --max <value>', 'Maximum number of results', 10)
	.action(async ({ max, fromAddress, toAddress }) => {
		depot
			.clearedDeposits({ max, fromAddress, toAddress })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('depot.exchanges')
	.option('-f, --from <value>', 'A from address')
	.option('-m, --max <value>', 'Maximum number of results', 10)
	.action(async ({ max, from }) => {
		depot
			.exchanges({ max, from })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program.command('exchanges.total').action(async () => {
	exchanges.total().then(console.log);
});

program
	.command('exchanges.aggregate')
	.option('-t, --timeSeries <value>', 'The type of timeSeries - 1d, 15m', '1d')
	.option('-m, --max <value>', 'Maximum number of results', 30)
	.action(async ({ timeSeries, max }) => {
		exchanges
			.aggregate({ timeSeries, max })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('exchanges.since')
	.option(
		'-t, --min-timestamp <value>',
		'Timestamp',
		Math.floor(Date.now() / 1e3) - 3600 * 24, //default is 1 day ago
	)
	.option('-b, --min-block <value>', 'The smallest block to include, if any')
	.option('-m, --max <value>', 'Maximum number of results')
	.option('-f, --from-address <value>', 'A from address')
	.option('-j, --json', 'Whether or not to display the results as JSON')
	.option('-c, --csv', 'Whether or not to display the results as a CSV')
	.action(async ({ minTimestamp, minBlock, max, fromAddress, json, csv }) => {
		const results = await exchanges.since({ minTimestamp, minBlock, max, fromAddress });

		if (json) {
			console.log(JSON.stringify(results, null, 2));
		} else if (csv) {
			const formatted = results.map(result => {
				return Object.assign({}, result, {
					date: new Date(result.date).toString(),
					fromCurrencyKeyBytes: undefined,
					toCurrencyKeyBytes: undefined,
				});
			});
			stringify(formatted, { header: true }).pipe(process.stdout);
		} else {
			console.log(results);
		}
	});

const doReclaimRebates = ({ prg, isReclaim }) => {
	prg
		.command(`exchanges.${isReclaim ? 'reclaims' : 'rebates'}`)
		.option(
			'-t, --min-timestamp <value>',
			'Timestamp',
			Math.floor(Date.now() / 1e3) - 3600 * 24, //default is 1 day ago
		)
		.option('-b, --min-block <value>', 'The smallest block to include, if any')
		.option('-m, --max <value>', 'Maximum number of results')
		.option('-a, --account <value>', 'An address')
		.option('-j, --json', 'Whether or not to display the results as JSON')
		.action(async ({ minTimestamp, minBlock, max, account, json }) => {
			const results = await exchanges[isReclaim ? 'reclaims' : 'rebates']({ minTimestamp, minBlock, max, account });

			if (json) {
				console.log(JSON.stringify(results, null, 2));
			} else {
				console.log(results);
			}
			console.log('----------------------');
			console.log('Number of entries:', results.length);
			const totalInUSD = results.reduce((memo, { amountInUSD }) => memo + amountInUSD, 0);
			console.log(`Total in USD $${Math.round(totalInUSD)}`);
		});
};

// add command exchanges.reclaims
doReclaimRebates({ prg: program, isReclaim: true });

// add command exchanges.rebates
doReclaimRebates({ prg: program, isReclaim: false });

program
	.command('exchanges.grouped')
	.option('-t, --type <value>', 'The type of unit - months, weeks or days', 'days')
	.option('-n, --unit <value>', 'The number of units (months, weeks, days) back to include prior to the current', 0)
	.option('-j, --json', 'Whether or not to display the results as JSON')
	.option('-c, --csv', 'Whether or not to display the results as a CSV')
	.action(async ({ type, unit, json, csv }) => {
		const typeToLabelFormatMap = {
			months: ts => moment(ts).format('MMM YY'),
			weeks: ts => 'Week ' + moment(ts).format('ww, YY'),
			days: ts => moment(ts).format('DD MMM YY'),
		};
		const typeWithoutPlural = type.slice(0, type.length - 1);
		// get entries from beyond a certain point
		const minTimestamp = moment()
			.startOf(typeWithoutPlural)
			.subtract(unit, type)
			.unix();

		// results are reverse chronologically ordered
		const results = await exchanges.since({ minTimestamp });
		const groups = [];
		const _cache = {};
		const lastMomentInWindow = moment(results[0].timestamp).endOf(typeWithoutPlural);

		for (const { timestamp, fromAmountInUSD, feesInUSD, fromAddress } of results) {
			const i = Math.abs(moment(timestamp).diff(lastMomentInWindow, type));
			// initialize the grouping
			groups[i] = groups[i] || {
				volume: 0,
				fees: 0,
				unique: 0,
				trades: 0,
				label: typeToLabelFormatMap[type](timestamp),
			};
			_cache[i] = _cache[i] || {};

			groups[i].volume = Math.round(fromAmountInUSD + groups[i].volume);
			groups[i].fees = Math.round(feesInUSD + groups[i].fees);
			groups[i].unique += !_cache[i][fromAddress] ? 1 : 0;
			groups[i].trades++;

			_cache[i][fromAddress] = true; // track this address
		}

		if (json) {
			console.log(JSON.stringify(groups, null, 2));
		} else if (csv) {
			stringify(groups, { header: true }).pipe(process.stdout);
		} else {
			console.log(groups);
		}
	});

program
	.command('zassets.issuers')
	.option('-m, --max <value>', 'Maximum number of results', 100)
	.option('-j, --json', 'Whether or not to display the results as JSON')

	.action(async ({ max, json }) => {
		zassets
			.issuers({ max })
			.then(logResults({ json }))
			.then(showResultCount({ max }));
	});

program
	.command('zassets.transfers')
	.option('-f, --from <value>', 'A from address')
	.option('-t, --to <value>', 'A to address')
	.option('-m, --max <value>', 'Maximum number of results', 100)
	.option('-s, --zasset <value>', 'Zasset code')
	.action(async ({ zasset, from, to, max }) => {
		zassets
			.transfers({ zasset, from, to, max })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('zassets.holders')
	.option('-a, --address <value>', 'Address to filter on, if any')
	.option('-s, --zasset <value>', 'The zasset currencyKey')
	.option('-m, --max <value>', 'Maximum number of results', 100)
	.option('-o, --addresses-only', 'Show addresses only')
	.option('-j, --json', 'Whether or not to display the results as JSON')
	.action(async ({ max, addressesOnly, address, json, zasset }) => {
		zassets
			.holders({ max, address, addressesOnly, zasset })
			.then(results => (addressesOnly ? results.map(({ address }) => address) : results))
			.then(logResults({ json }))
			.then(showResultCount({ max }));
	});

program
	.command('rate.hznAggregate')
	.option('-t, --timeSeries <value>', 'The type of timeSeries - 1d, 15m', '1d')
	.option('-m, --max <value>', 'Maximum number of results', 30)
	.action(async ({ timeSeries, max }) => {
		rate
			.hznAggregate({ timeSeries, max })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('rate.updates')
	.option('-m, --max <value>', 'Maximum number of results', 10)
	.option('-b, --min-block <value>', 'The smallest block to include, if any')
	.option('-B, --max-block <value>', 'The biggest block to include, if any')
	.option('-s, --zasset <value>', 'Zasset code')
	.option('-j, --json', 'Whether or not to display the results as JSON')
	.option('-t, --minTimestamp <value>', 'The oldest timestamp to include, if any')
	.option('-T, --maxTimestamp <value>', 'The youngest timestamp to include, if any')
	.action(async ({ max, zasset, minBlock, maxBlock, minTimestamp, maxTimestamp, json }) => {
		rate
			.updates({ max, zasset, minBlock, maxBlock, minTimestamp, maxTimestamp })
			.then(logResults({ json }))
			.then(showResultCount({ max }));
	});

program
	.command('rate.dailyRateChange')
	.option('-s, --zassets [value...]', 'specify zassets to get rate changes from')
	.option('-f, --fromBlock <value>', 'will get rates 24HR prior starting from this block')
	.option('-m, --max <value>', 'max needs to be higher than total zassets in the system at the moment', 100)
	.action(async ({ zassets, fromBlock }) => {
		rate
			.dailyRateChange({ zassets, fromBlock })
			.then(logResults())
			.then(showResultCount({ max: 'n/a' }));
	});

program
	.command('hzn.holders')
	.option('-a, --address <value>', 'Address to filter on, if any')
	.option('-c, --min-claims <value>', 'Minimum number of claims')
	.option('-i, --min-mints <value>', 'Minimum number of mints')
	.option('-j, --json', 'Whether or not to display the results as JSON')
	.option('-m, --max <value>', 'Maximum number of results', 100)
	.option('-n, --min-collateral <value>', 'Minimum amount of collateral (input will have 18 decimals added)')
	.option('-o, --addresses-only', 'Show addresses only')
	.option('-x, --max-collateral <value>', 'Maximum amount of collateral (input will have 18 decimals added)')
	.action(async ({ max, addressesOnly, address, maxCollateral, minCollateral, json, minMints, minClaims }) => {
		hzn
			.holders({
				max,
				address,
				addressesOnly,
				minCollateral,
				maxCollateral,
				minMints,
				minClaims,
			})
			.then(results => (addressesOnly ? results.map(({ address }) => address) : results))
			.then(logResults({ json }))
			.then(showResultCount({ max }));
	});

program.command('hzn.total').action(async () => {
	hzn.total().then(console.log);
});

program
	.command('hzn.aggregateActiveStakers')
	.option('-m, --max <value>', 'Maximum number of results', 30)
	.action(async ({ max }) => {
		hzn
			.aggregateActiveStakers({ max })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program.command('hzn.totalActiveStakers').action(async () => {
	hzn.totalActiveStakers().then(console.log);
});

program
	.command('hzn.transfers')
	.option('-f, --from <value>', 'A from address')
	.option('-t, --to <value>', 'A to address')
	.option(',m, --max <value>', 'Maximum number of results', 100)
	.action(async ({ from, to, max }) => {
		hzn
			.transfers({ from, to, max })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('hzn.rewards')
	.option('-a, --addresses-only', 'Show addresses only')
	.option('-m, --max <value>', 'Maximum number of results', Infinity)
	.option('-j, --json', 'Whether or not to display the results as JSON')

	.action(async ({ max, json, addressesOnly }) => {
		hzn
			.rewards({ max })
			.then(results => (addressesOnly ? results.map(({ address }) => address) : results))
			.then(logResults({ json }))
			.then(showResultCount({ max }));
	});

program
	.command('hzn.burned')
	.option('-b, --min-block <value>', 'The smallest block to include, if any')
	.option('-a, --account <value>', 'Account to filter on, if any')
	.option('-m, --max <value>', 'Maximum number of results', Infinity)

	.action(async ({ minBlock, max, account }) => {
		hzn
			.burned({ minBlock, max, account })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('hzn.issued')
	.option('-b, --min-block <value>', 'The smallest block to include, if any')
	.option('-a, --account <value>', 'Account to filter on, if any')
	.option('-m, --max <value>', 'Maximum number of results', Infinity)

	.action(async ({ minBlock, max, account }) => {
		hzn
			.issued({ minBlock, max, account })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('hzn.feesClaimed')
	.option('-a, --account <value>', 'Account to filter on, if any')
	.option('-m, --max <value>', 'Maximum number of results', 100)

	.action(async ({ max, account }) => {
		hzn
			.feesClaimed({ max, account })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('hzn.debtSnapshot')
	.option('-m, --max <value>', 'Maximum number of results', Infinity)
	.option('-b, --min-block <value>', 'The smallest block to include, if any')
	.option('-B, --max-block <value>', 'The biggest block to include, if any')
	.option('-a, --account <value>', 'Account to filter on, if any')

	.action(async ({ account, max, minBlock, maxBlock }) => {
		hzn
			.debtSnapshot({ account, max, minBlock, maxBlock })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('binaryOptions.markets')
	.option('-m, --max <value>', 'Maximum number of results', 100)
	.option('-c, --creator <value>', 'The address of the market creator')
	.option('-o, --isOpen', 'If the market is open or not')
	.option('-t, --minTimestamp <value>', 'The oldest timestamp to include, if any')
	.option('-T, --maxTimestamp <value>', 'The youngest timestamp to include, if any')

	.action(async ({ max, creator, isOpen, minTimestamp, maxTimestamp }) => {
		binaryOptions
			.markets({ max, creator, isOpen, minTimestamp, maxTimestamp })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('binaryOptions.optionTransactions')
	.option('-m, --max <value>', 'Maximum number of results', Infinity)
	.option('-M, --market <value>', 'The market address')
	.option('-a, --account <value>', 'The account address')

	.action(async ({ max, type, market, account }) => {
		binaryOptions
			.optionTransactions({ max, type, market, account })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('binaryOptions.marketsBidOn')
	.option('-m, --max <value>', 'Maximum number of results', Infinity)
	.option('-a, --account <value>', 'The account address')

	.action(async ({ max, account }) => {
		binaryOptions
			.marketsBidOn({ max, account })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('binaryOptions.historicalOptionPrice')
	.option('-m, --max <value>', 'Maximum number of results', Infinity)
	.option('-M, --market <value>', 'The market address')
	.option('-t, --minTimestamp <value>', 'The oldest timestamp to include, if any')
	.option('-T, --maxTimestamp <value>', 'The youngest timestamp to include, if any')

	.action(async ({ max, market, minTimestamp, maxTimestamp }) => {
		binaryOptions
			.historicalOptionPrice({ max, market, minTimestamp, maxTimestamp })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('etherCollateral.loans')
	.option('-m, --max <value>', 'Maximum number of results', Infinity)
	.option('-a, --account <value>', 'Account to filter on, if any')
	.option('-o, --is-open <value>', 'If the loan is open or closed')
	.option('-c, --collateral-minted <value>', 'The collateral minted for the loan')

	.action(async ({ max, account, isOpen, collateralMinted }) => {
		etherCollateral
			.loans({ max, account, isOpen, collateralMinted })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('etherCollateral.partiallyLiquidatedLoans')
	.option('-m, --max <value>', 'Maximum number of results', Infinity)
	.option('-a, --account <value>', 'Account to filter on, if any')

	.action(async ({ max, account }) => {
		etherCollateral
			.partiallyLiquidatedLoans({ max, account })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('etherCollateral.liquidatedLoans')
	.option('-m, --max <value>', 'Maximum number of results', Infinity)
	.option('-a, --account <value>', 'Account to filter on, if any')

	.action(async ({ max, account }) => {
		etherCollateral
			.liquidatedLoans({ max, account })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('limitOrders.orders')
	.option('-m, --max <value>', 'Maximum number of results', Infinity)
	.option('-a, --account <value>', 'Account to filter on, if any')

	.action(async ({ max, account }) => {
		limitOrders
			.orders({ max, account })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('exchanger.exchangeEntriesSettled')
	.option('-m, --max <value>', 'Maximum number of results', 100)
	.option('-f, --from <value>', 'A from address')

	.action(async ({ max, from }) => {
		exchanger
			.exchangeEntriesSettled({ max, from })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('liquidations.accountsFlaggedForLiquidation')
	.option(
		'-t, --maxTime <value>',
		'max deadline for flagged accounts - set to 3 days from now as default',
		Math.round((Date.now() + 86400 * 1000 * 3) / 1000),
	)
	.option(
		'-t, --minTime <value>',
		'min deadline for flagged accounts - set to 27 days ago as default',
		Math.round((Date.now() - 86400 * 1000 * 27) / 1000),
	)
	.option('-m, --max <value>', 'Maximum number of results', Infinity)
	.option('-a, --account <value>', 'Account to filter on, if any')

	.action(async ({ account, minTime, maxTime, max }) => {
		liquidations
			.accountsFlaggedForLiquidation({ account, minTime, maxTime, max })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('liquidations.accountsRemovedFromLiquidation')
	.option(
		'-T, --maxTime <value>',
		'max time for fixed flagged accounts - set to now as default',
		Math.round(Date.now() / 1000),
	)
	.option(
		'-t, --minTime <value>',
		'min time for fixed flagged accounts - set to 30 days ago as default',
		Math.round((Date.now() - 86400 * 1000 * 30) / 1000),
	)
	.option('-m, --max <value>', 'Maximum number of results', Infinity)
	.option('-a, --account <value>', 'Account to filter on, if any')

	.action(async ({ account, minTime, maxTime, max }) => {
		liquidations
			.accountsRemovedFromLiquidation({ account, minTime, maxTime, max })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('liquidations.accountsLiquidated')
	.option(
		'-T, --maxTime <value>',
		'max time for fixed flagged accounts - set to now as default',
		Math.round(Date.now() / 1000),
	)
	.option(
		'-t, --minTime <value>',
		'min time for fixed flagged accounts - set to 30 days ago as default',
		Math.round((Date.now() - 86400 * 1000 * 30) / 1000),
	)
	.option('-m, --max <value>', 'Maximum number of results', Infinity)
	.option('-a, --account <value>', 'Account to filter on, if any')

	.action(async ({ account, minTime, maxTime, max }) => {
		liquidations
			.accountsLiquidated({ account, minTime, maxTime, max })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program
	.command('liquidations.getActiveLiquidations')
	.option(
		'-T, --maxTime <value>',
		'max time for fixed flagged accounts - set to now as default',
		Math.round(Date.now() / 1000),
	)
	.option(
		'-t, --minTime <value>',
		'min time for fixed flagged accounts - set to 30 days ago as default',
		Math.round((Date.now() - 86400 * 1000 * 30) / 1000),
	)
	.option('-m, --max <value>', 'Maximum number of results', Infinity)
	.option('-a, --account <value>', 'Account to filter on, if any')

	.action(async ({ minTime, maxTime, account, max }) => {
		liquidations
			.getActiveLiquidations({ minTime, maxTime, account, max })
			.then(logResults())
			.then(showResultCount({ max }));
	});

program.command('exchanges.observe').action(async () => {
	exchanges.observe().subscribe({
		next(val) {
			console.log(val);
		},
	});
});

program.command('rate.observe').action(async () => {
	rate.observe().subscribe({
		next(val) {
			console.log(val);
		},
	});
});
program.parse(process.argv);
