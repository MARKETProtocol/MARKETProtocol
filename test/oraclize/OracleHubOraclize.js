const OracleHubOraclize = artifacts.require('OracleHubOraclize');
const MarketContractRegistry = artifacts.require('MarketContractRegistry');
const MarketContractOraclize = artifacts.require('MarketContractOraclize');
const utility = require('../utility.js');

contract('OracleHubOraclize', function(accounts) {
  let oracleHub;
  let marketContractRegistry;
  let marketContract;

  before(async function() {
    oracleHub = await OracleHubOraclize.deployed();
    marketContractRegistry = await MarketContractRegistry.deployed();
    var whiteList = await marketContractRegistry.getAddressWhiteList.call();
    marketContract = await MarketContractOraclize.at(whiteList[whiteList.length - 1]);
  });

  beforeEach(async function() {});

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
    try {
      await oracleHub.requestQuery(
        marketContract.address,
        'URL',
        'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0',
        marketContractExpiration,
        { from: accounts[1] }
      );
    } catch (err) {
      error = err;
    }
    assert.ok(
      error instanceof Error,
      'should not be able to call request query from non factory address'
    );

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

    let error = null;
    try {
      await oracleHub.__callback(queryId, '215.61', { from: accounts[1] });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able call back from non oracle account!');
  });
});
