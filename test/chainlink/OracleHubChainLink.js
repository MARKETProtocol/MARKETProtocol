const MarketContractOraclize = artifacts.require('TestableMarketContractOraclize');
const MarketCollateralPool = artifacts.require('MarketCollateralPool');
const MarketContractRegistry = artifacts.require('MarketContractRegistry');
const MarketTradingHub = artifacts.require('MarketTradingHub');
const CollateralToken = artifacts.require('CollateralToken');
const MarketToken = artifacts.require('MarketToken');
const OrderLib = artifacts.require('OrderLibMock');
const Helpers = require('./helpers/Helpers.js');
const utility = require('./utility.js');


const OrableHubChainLink = require("OracleHubChainLink");
const LinkToken = artifacts.require('LinkToken.sol');


contract('OracleHubChainLink', function(accounts) {

  let balancePerAcct;
  let collateralToken;
  let initBalance;
  let collateralPool;
  let marketContract;
  let marketContractRegistry;
  let marketToken;
  let orderLib;
  let qtyMultiplier;
  let priceFloor;
  let priceCap;
  let tradeHelper;
  let marketTradingHub;
  const entryOrderPrice = 33025;
  const accountMaker = accounts[0];
  const accountTaker = accounts[1];

  beforeEach(async function() {

    marketToken = await MarketToken.deployed();
    marketContractRegistry = await MarketContractRegistry.deployed();
    var whiteList = await marketContractRegistry.getAddressWhiteList.call();
    marketContract = await MarketContractOraclize.at(whiteList[1]);
    collateralPool = await MarketCollateralPool.deployed();
    orderLib = await OrderLib.deployed();
    collateralToken = await CollateralToken.deployed();
    qtyMultiplier = await marketContract.QTY_MULTIPLIER.call();
    priceFloor = await marketContract.PRICE_FLOOR.call();
    priceCap = await marketContract.PRICE_CAP.call();
    marketTradingHub = await MarketTradingHub.deployed();
    tradeHelper = await Helpers.TradeHelper(
      marketContract,
      orderLib,
      collateralToken,
      collateralPool,
      marketTradingHub
    );

  });

  it('Link balances can be withdrawn by owner', async function() {

    // test non owner fails
    // test owner succeeds

  });

  it('Factory address can be set by owner', async function() {
    // fails with non owner
    // owner succeeds
  });

  it('requestQuery can be called by factory address', async function() {
    // fails with non factory
    // set factory address to our account and attempt call.
  });

  it('callBack can be called by a the oracle address', async function() {
    // fails with non factory
    // set factory address to our account and attempt call.
  });

  it('callBack can push contract into expiration', async function() {
    // should probably be in MarketContractChainLink
  });





});
