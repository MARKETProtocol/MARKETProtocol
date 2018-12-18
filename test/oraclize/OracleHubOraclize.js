const OracleHubOraclize = artifacts.require('OracleHubOraclize');
const MarketContractRegistry = artifacts.require('MarketContractRegistry');
const MarketContractOraclize = artifacts.require('MarketContractOraclize');
const MarketCollateralPool = artifacts.require('MarketCollateralPool');
const CollateralToken = artifacts.require('CollateralToken');
const utility = require('../utility.js');

contract('OracleHubOraclize', function(accounts) {
  let oracleHub;
  let marketContractRegistry;
  let collateralPool;
  let collateralToken;
  let marketContract;

  let oracleDataSource;
  let oracleQuery;

  before(async function() {
    oracleHub = await OracleHubOraclize.deployed();
    collateralPool = await MarketCollateralPool.deployed();
    collateralToken = await CollateralToken.deployed();
    marketContractRegistry = await MarketContractRegistry.deployed();
  });

  beforeEach(async function() {
    marketContract = await utility.createMarketContract(
      collateralToken,
      collateralPool,
      accounts[0],
      oracleHub.address
    );
    await marketContractRegistry.addAddressToWhiteList(marketContract.address, {
      from: accounts[0]
    });
    oracleDataSource = await marketContract.ORACLE_DATA_SOURCE.call();
    oracleQuery = await marketContract.ORACLE_QUERY.call();
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
    // @perfectmak - can you please make the above test more exact, I am brain dead and struggling
    // with big number precision/
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
    let error = null;
    const marketContractExpiration = Math.floor(Date.now() / 1000) + 600;

    await utility.shouldFail(async function() {
      await oracleHub.requestQuery(
        marketContract.address,
        'URL',
        'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0',
        marketContractExpiration,
        { from: accounts[1] }
      );
    }, 'should not be able to call request query from non factory address');

    const originalContractFactoryAddress = await oracleHub.marketContractFactoryAddress();
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
    const events = await utility.getEvent(oracleHub, 'OraclizeQueryRequested');
    assert.equal(
      'OraclizeQueryRequested',
      events[0].event,
      'Event called is not OraclizeQueryRequested'
    );

    await oracleHub.setFactoryAddress(originalContractFactoryAddress, { from: accounts[0] });
  });

  it('callBack cannot be called by a non oracle address', async function() {
    // we first need a valid request ID to call with, so lets create a valid request.
    // set factory address to an account we can call from
    const marketContractExpiration = Math.floor(Date.now() / 1000) + 600;
    await oracleHub.setFactoryAddress(accounts[1], { from: accounts[0] });
    await oracleHub.requestQuery(
      marketContract.address,
      'URL',
      'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0',
      marketContractExpiration,
      { from: accounts[1] }
    );

    const eventsChainLinkRequested = await utility.getEvent(oracleHub, 'OraclizeQueryRequested');
    const queryId = eventsChainLinkRequested[0].args.queryId;

    utility.shouldFail(async function() {
      await oracleHub.__callback(queryId, '215.61', { from: accounts[1] });
    }, 'should not be able call back from non oracle account!');
  });

  it('callback should invoke marketContract.oracleCallback()', async function() {
    let txReceipt = null;

    await oracleHub.setFactoryAddress(accounts[1], { from: accounts[0] });
    await oracleHub.requestQuery(marketContract.address, oracleDataSource, oracleQuery, 0, {
      from: accounts[1]
    });

    let updatedLastPriceEvent = marketContract.UpdatedLastPrice();
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

    await waitForUpdatedLastPriceEvent(300000);
    assert.notEqual(
      txReceipt,
      null,
      'Oraclize callback did not inovke marketContract.oracleCallback()'
    );
  });

  it('gas used by OracleHub callback is within specified limit', async function() {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const marketContractExpirationInThreeSeconds = nowInSeconds + 3;
    const priceFloor = 1;
    const priceCap = 150;
    let gasLimit = 6500000; // gas limit for development network
    let block = web3.eth.getBlock('latest');
    if (block.gasLimit > 7000000) {
      // coverage network
      gasLimit = block.gasLimit;
    }
    let txReceipt = null; // Oraclize callback transaction receipt

    const deployedMarketContract = await MarketContractOraclize.new(
      'ETHUSD-10',
      [accounts[0], collateralToken.address, collateralPool.address],
      oracleHub.address,
      [priceFloor, priceCap, 2, 2, marketContractExpirationInThreeSeconds],
      oracleDataSource,
      oracleQuery,
      { gas: gasLimit }
    );

    // request query update
    await oracleHub.setFactoryAddress(accounts[1], { from: accounts[0] });
    await oracleHub.requestQuery(deployedMarketContract.address, oracleDataSource, oracleQuery, 0, {
      from: accounts[1]
    });

    let oraclizeCallbackGasCost = await oracleHub.QUERY_CALLBACK_GAS.call();
    let contractSettledEvent = deployedMarketContract.ContractSettled();

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

    await waitForContractSettledEvent(300000);
    assert.notEqual(
      txReceipt,
      null,
      'Oraclize callback did not arrive. Please increase QUERY_CALLBACK_GAS!'
    );
  });

  // describe('requestOnDemandQuery()', function() {
  //   it('should fail if not eth is sent', async function() {
  //     await utility.shouldFail(async function() {
  //       await oracleHub.requestOnDemandQuery(marketContract.address, { from: accounts[0] });
  //     }, 'query did not fail');
  //   });
  //
  //   it('should emit OraclizeQueryRequested', async function() {
  //     let txReceipt = null;
  //
  //     await oracleHub.requestOnDemandQuery(marketContract.address, {
  //       from: accounts[0],
  //       value: web3.toWei(1)
  //     });
  //
  //     let oraclizeQueryRequestEvent = oracleHub.OraclizeQueryRequested();
  //     oraclizeQueryRequestEvent.watch(async (err, eventLogs) => {
  //       if (err) {
  //         console.log(err);
  //       }
  //       assert.equal(eventLogs.event, 'OraclizeQueryRequested');
  //       txReceipt = await web3.eth.getTransactionReceipt(eventLogs.transactionHash);
  //       oraclizeQueryRequestEvent.stopWatching();
  //     });
  //
  //     const waitForQueryEvent = ms =>
  //       new Promise((resolve, reject) => {
  //         const check = () => {
  //           if (txReceipt) resolve();
  //           // else if ((ms -= 1000) < 0) reject(new Error('Oraclize time out!'));
  //           else {
  //             setTimeout(check, 1000);
  //           }
  //         };
  //         setTimeout(check, 1000);
  //       });
  //
  //     await waitForQueryEvent(300000);
  //     assert.notEqual(txReceipt, null, 'did not emit OraclizeQueryRequested event');
  //   });
  // });
});
