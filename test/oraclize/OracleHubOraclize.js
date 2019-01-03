const OracleHubOraclize = artifacts.require('OracleHubOraclize');
const MarketContractOraclize = artifacts.require('MarketContractOraclize');
const MarketContractFactoryOraclize = artifacts.require('MarketContractFactoryOraclize');
const CollateralToken = artifacts.require('CollateralToken');

const utility = require('../utility.js');

contract('OracleHubOraclize', function(accounts) {
  const oracleQuery =
    'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0';
  const oracleDataSoure = 'URL';
  const contractName = 'ETHUSD';
  const marketContractExpiration = Math.floor(Date.now() / 1000) + 600;
  const priceCap = 60465;
  const priceFloor = 20155;
  const priceDecimalPlaces = 2;
  const qtyMultiplier = 10;

  let oracleHub;
  let collateralToken;
  let marketContractFactory;
  let events;

  before(async function() {
    oracleHub = await OracleHubOraclize.deployed();
    collateralToken = await CollateralToken.deployed();
    marketContractFactory = await MarketContractFactoryOraclize.deployed();
  });

  it('ETH balances can be withdrawn by owner', async function() {
    const initialBalance = await web3.eth.getBalance(oracleHub.address);
    assert.isTrue(initialBalance.toNumber() >= 1e17, 'Initial balance does not reflect migrations');

    const ownerAccount = await oracleHub.owner();
    assert.equal(ownerAccount, accounts[0], "Owner account of the Hub isn't our main test account");

    const balanceToTransfer = 1e10;

    let error = null;
    try {
      await oracleHub.withdrawEther(accounts[1], balanceToTransfer, { from: accounts[1] });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able to withdraw from non-owner account');

    const accountBalance = await web3.eth.getBalance(accounts[1]);
    await oracleHub.withdrawEther(accounts[1], balanceToTransfer, { from: accounts[0] });
    const finalBalance = await web3.eth.getBalance(oracleHub.address);
    const finalAccountBalance = await web3.eth.getBalance(accounts[1]);

    assert.equal(initialBalance - finalBalance, balanceToTransfer, 'contract value is off');
    assert.isTrue(finalAccountBalance > accountBalance, 'account 1 received the transfer');
  });

  it('Factory address can be set by owner', async function() {
    const originalContractFactoryAddress = await oracleHub.marketContractFactoryAddress();

    let error = null;
    try {
      await oracleHub.setFactoryAddress(accounts[1], { from: accounts[1] });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able to set factory from non-owner account');

    await oracleHub.setFactoryAddress(accounts[1], { from: accounts[0] });
    assert.equal(
      await oracleHub.marketContractFactoryAddress(),
      accounts[1],
      'Did not set factory address correctly'
    );

    await oracleHub.setFactoryAddress(originalContractFactoryAddress, { from: accounts[0] });
    assert.equal(
      await oracleHub.marketContractFactoryAddress(),
      originalContractFactoryAddress,
      'Did not set factory address back correctly'
    );
  });

  it('requestQuery can be called by factory address', async function() {
    // Create a new market contract so we have a valid address to use.
    await marketContractFactory.deployMarketContractOraclize(
      contractName,
      CollateralToken.address,
      [priceFloor, priceCap, priceDecimalPlaces, qtyMultiplier, marketContractExpiration],
      oracleDataSoure,
      oracleQuery
    );

    // Should fire the MarketContractCreated event!
    events = await utility.getEvent(marketContractFactory, 'MarketContractCreated');
    assert.equal(
      'MarketContractCreated',
      events[0].event,
      'Event called is not MarketContractCreated'
    );
    let marketContract = await MarketContractOraclize.at(events[0].args.contractAddress);

    // we can now attempt to request a valid query, but it should fail, because we are not calling
    // from the factory address
    await utility.shouldFail(async function() {
      await oracleHub.requestQuery(
        marketContract.address,
        oracleDataSoure,
        oracleQuery,
        marketContractExpiration,
        { from: accounts[1] }
      );
    }, 'should not be able to call request query from non factory address');

    // set factory address to an account we can call from
    oracleHub.setFactoryAddress(accounts[1], { from: accounts[0] });
    oracleHub.requestQuery(
      marketContract.address,
      'URL',
      'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0',
      marketContractExpiration,
      { from: accounts[1] }
    );

    // Should fire the requested event!
    events = await utility.getEvent(oracleHub, 'OraclizeQueryRequested');
    assert.equal(
      'OraclizeQueryRequested',
      events[0].event,
      'Event called is not OraclizeQueryRequested'
    );

    // set back to proceed with tests.
    await oracleHub.setFactoryAddress(marketContractFactory.address, { from: accounts[0] });
  });

  it('callBack cannot be called by a non oracle address', async function() {
    // we first need a valid request ID to call with, so lets create a valid request
    // and market contract
    await marketContractFactory.deployMarketContractOraclize(
      contractName,
      CollateralToken.address,
      [priceFloor, priceCap, priceDecimalPlaces, qtyMultiplier, marketContractExpiration],
      oracleDataSoure,
      oracleQuery
    );

    // by creating a contract, we should have also created a valid request with a query id.
    const eventsChainLinkRequested = await utility.getEvent(oracleHub, 'OraclizeQueryRequested');
    const queryId = eventsChainLinkRequested[0].args.queryId;

    utility.shouldFail(async function() {
      await oracleHub.__callback(queryId, '215.61', { from: accounts[1] });
    }, 'should not be able call back from non oracle account!');
  });

  it('callback should invoke marketContract.oracleCallback()', async function() {
    // Create a new market contract so we have a valid address and also a new request.
    // we will set the expiration for a moment from now, so we should see the call back immediately.
    let quickExpiration = Math.floor(Date.now() / 1000) + 5; //expires in 5 seconds
    await marketContractFactory.deployMarketContractOraclize(
      contractName,
      CollateralToken.address,
      [priceFloor, priceCap, priceDecimalPlaces, qtyMultiplier, quickExpiration],
      oracleDataSoure,
      oracleQuery
    );

    // Should fire the MarketContractCreated event!
    events = await utility.getEvent(marketContractFactory, 'MarketContractCreated');
    assert.equal(
      'MarketContractCreated',
      events[0].event,
      'Event called is not MarketContractCreated'
    );
    let marketContract = await MarketContractOraclize.at(events[0].args.contractAddress);

    // Our market contract should get a updated query in 5 seconds and we can confirm by listening
    // to the updated last price event.
    let updatedLastPriceEvent = marketContract.UpdatedLastPrice();
    let txReceipt;
    updatedLastPriceEvent.watch(async (err, eventLogs) => {
      if (err) {
        console.log(err);
      }
      assert.equal(eventLogs.event, 'UpdatedLastPrice');
      txReceipt = await web3.eth.getTransactionReceipt(eventLogs.transactionHash);
      updatedLastPriceEvent.stopWatching();
    });

    const waitForUpdatedLastPriceEvent = ms =>
      new Promise((resolve, reject) => {
        const check = () => {
          if (txReceipt) resolve();
          // else if ((ms -= 1000) < 0) reject(new Error('Oraclize time out!'));
          else {
            setTimeout(check, 1000);
          }
        };
        setTimeout(check, 1000);
      });

    await waitForUpdatedLastPriceEvent(30000);
    assert.notEqual(
      txReceipt,
      null,
      'Oraclize callback did not invoke marketContract.oracleCallback()'
    );
  });

  it('gas used by OracleHub callback is within specified limit', async function() {
    // Create a new market contract so we have a valid address and also a new request.
    // we will set the expiration for a moment from now, so we should see the call back immediately.
    let quickExpiration = Math.floor(Date.now() / 1000) + 5; //expires in 5 seconds
    await marketContractFactory.deployMarketContractOraclize(
      contractName,
      CollateralToken.address,
      [priceFloor, priceCap, priceDecimalPlaces, qtyMultiplier, quickExpiration],
      oracleDataSoure,
      oracleQuery
    );

    // Should fire the MarketContractCreated event!
    events = await utility.getEvent(marketContractFactory, 'MarketContractCreated');
    assert.equal(
      'MarketContractCreated',
      events[0].event,
      'Event called is not MarketContractCreated'
    );
    let marketContract = await MarketContractOraclize.at(events[0].args.contractAddress);

    let oraclizeCallbackGasCost = await oracleHub.QUERY_CALLBACK_GAS.call();
    let contractSettledEvent = marketContract.ContractSettled();
    let txReceipt; // Oraclize callback transaction receipt

    contractSettledEvent.watch(async (err, response) => {
      if (err) {
        console.log(err);
      }
      assert.equal(response.event, 'ContractSettled');
      txReceipt = await web3.eth.getTransactionReceipt(response.transactionHash);
      // console.log('Oraclize callback gas used : ' + txReceipt.gasUsed);
      assert.isBelow(
        txReceipt.gasUsed,
        oraclizeCallbackGasCost.toNumber(),
        'Callback tx claims to have used more gas than allowed!'
      );
      contractSettledEvent.stopWatching();
    });

    const waitForContractSettledEvent = ms =>
      new Promise((resolve, reject) => {
        const check = () => {
          if (txReceipt) resolve();
          // else if ((ms -= 1000) < 0) reject(new Error('Oraclize time out!'));
          else {
            setTimeout(check, 1000);
          }
        };
        setTimeout(check, 1000);
      });

    await waitForContractSettledEvent(30000);
    assert.notEqual(
      txReceipt,
      null,
      'Oraclize callback did not arrive. Please increase QUERY_CALLBACK_GAS!'
    );
  });

  describe('requestOnDemandQuery()', function() {
    let marketContractForDemandQuery;

    before(async function() {
      // Create a new market contract for this test suite
      await marketContractFactory.deployMarketContractOraclize(
        contractName,
        CollateralToken.address,
        [priceFloor, priceCap, priceDecimalPlaces, qtyMultiplier, marketContractExpiration],
        oracleDataSoure,
        oracleQuery
      );

      // Should fire the MarketContractCreated event!
      events = await utility.getEvent(marketContractFactory, 'MarketContractCreated');
      assert.equal(
        'MarketContractCreated',
        events[0].event,
        'Event called is not MarketContractCreated'
      );
      marketContractForDemandQuery = await MarketContractOraclize.at(
        events[0].args.contractAddress
      );
    });

    it('should fail if not eth is sent', async function() {
      await utility.shouldFail(async function() {
        await oracleHub.requestOnDemandQuery(marketContractForDemandQuery.address, {
          from: accounts[0]
        });
      }, 'query did not fail');
    });

    it('should emit OraclizeQueryRequested', async function() {
      let txReceipt;

      await oracleHub.requestOnDemandQuery(marketContractForDemandQuery.address, {
        from: accounts[0],
        value: web3.toWei(1)
      });

      let oraclizeQueryRequestEvent = oracleHub.OraclizeQueryRequested();
      oraclizeQueryRequestEvent.watch(async (err, eventLogs) => {
        if (err) {
          console.log(err);
        }
        assert.equal(eventLogs.event, 'OraclizeQueryRequested');
        txReceipt = await web3.eth.getTransactionReceipt(eventLogs.transactionHash);
        oraclizeQueryRequestEvent.stopWatching();
      });

      const waitForQueryEvent = ms =>
        new Promise((resolve, reject) => {
          const check = () => {
            if (txReceipt) resolve();
            // else if ((ms -= 1000) < 0) reject(new Error('Oraclize time out!'));
            else {
              setTimeout(check, 1000);
            }
          };
          setTimeout(check, 1000);
        });

      await waitForQueryEvent(30000);
      assert.notEqual(txReceipt, null, 'did not emit OraclizeQueryRequested event');
    });
  });
});
