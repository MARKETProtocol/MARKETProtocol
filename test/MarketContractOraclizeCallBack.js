const MarketContractOraclize = artifacts.require('TestableMarketContractOraclize');
const MarketCollateralPool = artifacts.require('MarketCollateralPool');
const MarketTradingHub = artifacts.require('MarketTradingHub');
const MarketContractRegistry = artifacts.require('MarketContractRegistry');
const MarketToken = artifacts.require('MarketToken');
const CollateralToken = artifacts.require('CollateralToken');
const OrderLib = artifacts.require('OrderLibMock');
const Helpers = require('./helpers/Helpers.js');

// test to ensure callback gas is within limits when settling contracts
contract('MarketContractOraclize.CallBackExpiration', function(accounts) {

  let orderLib;
  let tradeHelper;
  let collateralPool;
  let collateralToken;
  let marketContractRegistry;
  let marketToken;
  let marketContract;
  let marketContractInstance;
  let gasLimit;
  let marketTradingHub;

  const accountMaker = accounts[0];

  before(async function() {

    marketToken = await MarketToken.deployed();
    marketContractRegistry = await MarketContractRegistry.deployed();
    var whiteList = await marketContractRegistry.getAddressWhiteList.call();
    marketContract = await MarketContractOraclize.at(whiteList[1]);
    collateralPool = await MarketCollateralPool.deployed();
    orderLib = await OrderLib.deployed();
    collateralToken = await CollateralToken.deployed();
    marketTradingHub = await MarketTradingHub.deployed();

    tradeHelper = await Helpers.TradeHelper(
      marketContract,
      orderLib,
      collateralToken,
      collateralPool,
      marketTradingHub
    );
  });

  it('gas used by Oraclize callback is within specified limit', async function() {
    const marketContractExpirationInTenSeconds = Math.floor(Date.now() / 1000) + 10;
    const priceFloor = 1;
    const priceCap = 1000000; // 10k USD
    gasLimit = 6500000; // gas limit for development network
    let block = web3.eth.getBlock('latest');
    if (block.gasLimit > 7000000) {
      // coverage network
      gasLimit = block.gasLimit;
    }
    let txReceipt = null; // Oraclize callback transaction receipt

    MarketContractOraclize.new(
      'ETHUSD-10',
      [ accountMaker, marketToken.address, collateralToken.address, collateralPool.address],
      [priceFloor, priceCap, 2, 1, marketContractExpirationInTenSeconds],
      'URL',
      'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0',
      { gas: gasLimit, accountMaker }
    ).then(async function(deployedMarketContract) {
      let oraclizeCallbackGasCost = await deployedMarketContract.QUERY_CALLBACK_GAS.call();
      let contractSettledEvent = deployedMarketContract.ContractSettled();
      let updatedLastPriceEvent = deployedMarketContract.UpdatedLastPrice();
      marketContractInstance = deployedMarketContract;

      contractSettledEvent.watch(async (err, response) => {
        if (err) {
          console.log(err);
        }
        assert.equal(response.event, 'ContractSettled');
        txReceipt = await web3.eth.getTransactionReceipt(response.transactionHash);
        console.log('Oraclize callback gas used : ' + txReceipt.gasUsed);
        assert.isBelow(
          txReceipt.gasUsed,
          oraclizeCallbackGasCost.toNumber(),
          'Callback tx claims to have used more gas than allowed!'
        );
        contractSettledEvent.stopWatching();
      });

      updatedLastPriceEvent.watch(async (err, response) => {
        if (err) {
          console.log(err);
        }
        assert.equal(response.event, 'UpdatedLastPrice');
        await web3.eth.getTransactionReceipt(response.transactionHash);
        updatedLastPriceEvent.stopWatching();
      });
    });

    let waitForContractSettledEvent = ms =>
      new Promise((r, j) => {
        var check = () => {
          if (txReceipt) r();
          else if ((ms -= 1000) < 0) j(new Error('Oraclize time out!'));
          else {
            setTimeout(check, 1000);
          }
        };
        setTimeout(check, 1000);
      });

    await waitForContractSettledEvent(60000);
    assert.notEqual(
      txReceipt,
      null,
      'Oraclize callback did not arrive. Please increase QUERY_CALLBACK_GAS!'
    );
  });

  it('request early settlement after contract settled', async function() {
    await marketContractInstance.requestEarlySettlement.call({
      gas: gasLimit,
      value: web3.toWei('.1', 'ether'),
      accountMaker
    });
  });

  it('Should fail to deploy a contract with priceFloor equal to priceCap', async function() {
    const marketContractExpirationInTenSeconds = Math.floor(Date.now() / 1000) + 10;
    let error = null;
    try {
      await MarketContractOraclize.new(
        'ETHUSD-EQUALPRICECAPPRICEFLOOR',
        [ accountMaker, marketToken.address, collateralToken.address, collateralPool.address],
        [100000, 100000, 2, 1, marketContractExpirationInTenSeconds],
        'URL',
        'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0',
        { gas: gasLimit, accountMaker }
      );
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'Contract with priceFloor equal to priceCap is possible');
  });

  it('Should fail to deploy a contract with expiration in the past', async function() {
    const marketContractExpirationTenSecondsAgo = Math.floor(Date.now() / 1000) - 10;
    let error = null;
    try {
      await MarketContractOraclize.new(
        'ETHUSD-EQUALPRICECAPPRICEFLOOR',
        [ accountMaker, marketToken.address, collateralToken.address, collateralPool.address],
        [10, 100, 2, 1, marketContractExpirationTenSecondsAgo],
        'URL',
        'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0',
        { gas: gasLimit, accountMaker }
      );
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'Contract with expiration in the past is possible');
  });

  it('Should fail to deploy a contract with expiration set after 60 days', async function() {
    const marketContractExpirationInSixtyOneDays =
      Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 61;
    let error = null;
    try {
      await MarketContractOraclize.new(
        'ETHUSD-EQUALPRICECAPPRICEFLOOR',
        [ accountMaker, marketToken.address, collateralToken.address, collateralPool.address],
        [10, 100, 2, 1, marketContractExpirationTenSecondsAgo],
        'URL',
        'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0',
        { gas: gasLimit, accountMaker }
      );
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'Contract with expiration set after 60 days is possible');
  });
});
