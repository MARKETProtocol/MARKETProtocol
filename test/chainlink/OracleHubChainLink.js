const OracleHubChainLink = artifacts.require('OracleHubChainLink');
const LinkToken = artifacts.require('LinkToken.sol');
const MarketContractRegistry = artifacts.require('MarketContractRegistry');
const MarketContractChainLink = artifacts.require('MarketContractChainLink');
const ChainLinkOracle = artifacts.require('Oracle');
const utility = require('../utility.js');

contract('OracleHubChainLink', function(accounts) {
  let oracleHubChainLink;
  let linkToken;
  let marketContractRegistry;
  let marketContract;
  let chainLinkOracle;

  before(async function() {
    oracleHubChainLink = await OracleHubChainLink.deployed();
    linkToken = await LinkToken.deployed();
    marketContractRegistry = await MarketContractRegistry.deployed();
    var whiteList = await marketContractRegistry.getAddressWhiteList.call();
    marketContract = await MarketContractChainLink.at(whiteList[whiteList.length - 1]);
    chainLinkOracle = await ChainLinkOracle.deployed();
  });

  beforeEach(async function() {});

  it('Link balances can be withdrawn by owner', async function() {
    const initialBalance = await linkToken.balanceOf(oracleHubChainLink.address);
    assert.isTrue(
      initialBalance.toNumber() >= 10e20,
      'Initial balance does not reflect migrations'
    );

    const ownerAccont = await oracleHubChainLink.owner();
    assert.equal(ownerAccont, accounts[0], "Owner account of the Hub isn't our main test account");

    const balanceToTransfer = 1e20;

    let error = null;
    try {
      await oracleHubChainLink.withdrawLink(accounts[1], balanceToTransfer, { from: accounts[1] });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able to withdraw from non-owner account');

    assert.equal(await linkToken.balanceOf(accounts[1]), 0, 'test account already has balance');

    oracleHubChainLink.withdrawLink(accounts[1], balanceToTransfer, { from: accounts[0] });
    const transferredBalance = await linkToken.balanceOf(accounts[1]);

    assert.equal(balanceToTransfer, transferredBalance.toNumber(), 'Withdraw of link failed');
  });

  it('Factory address can be set by owner', async function() {
    const originalContractFactoryAddress = await oracleHubChainLink.marketContractFactoryAddress();

    let error = null;
    try {
      await oracleHubChainLink.setFactoryAddress(accounts[1], { from: accounts[1] });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able to set factory from non-owner account');

    await oracleHubChainLink.setFactoryAddress(accounts[1], { from: accounts[0] });
    assert.equal(
      await oracleHubChainLink.marketContractFactoryAddress(),
      accounts[1],
      'Did not set factory address correctly'
    );

    await oracleHubChainLink.setFactoryAddress(originalContractFactoryAddress, {
      from: accounts[0]
    });
    assert.equal(
      await oracleHubChainLink.marketContractFactoryAddress(),
      originalContractFactoryAddress,
      'Did not set factory address back correctly'
    );
  });

  it('requestQuery can be called by factory address', async function() {
    let error = null;
    try {
      await oracleHubChainLink.requestQuery(
        marketContract.address,
        'https://api.kraken.com/0/public/Ticker?pair=ETHUSD',
        'result.XETHZUSD.c.0',
        'fakeSleepJobId',
        'fakeOnDemandJobId',
        { from: accounts[1] }
      );
    } catch (err) {
      error = err;
    }
    assert.ok(
      error instanceof Error,
      'should not be able to call request query from non factory address'
    );

    const originalContractFactoryAddress = await oracleHubChainLink.marketContractFactoryAddress();
    // set factory address to an account we can call from
    oracleHubChainLink.setFactoryAddress(accounts[1], { from: accounts[0] });
    oracleHubChainLink.requestQuery(
      marketContract.address,
      'https://api.kraken.com/0/public/Ticker?pair=ETHUSD',
      'result.XETHZUSD.c.0',
      'fakeSleepJobId',
      'fakeOnDemandJobId',
      { from: accounts[1] }
    );

    // Should fire the requested event!
    const events = await utility.getEvent(oracleHubChainLink, 'ChainlinkRequested');
    assert.equal('ChainlinkRequested', events[0].event, 'Event called is not ChainlinkRequested');
    await oracleHubChainLink.setFactoryAddress(originalContractFactoryAddress, {
      from: accounts[0]
    });
  });

  it('callBack cannot be called by a non oracle address', async function() {
    // we first need a valid request ID to call with, so lets create a valid request.
    // set factory address to an account we can call from
    oracleHubChainLink.setFactoryAddress(accounts[1], { from: accounts[0] });
    oracleHubChainLink.requestQuery(
      marketContract.address,
      'https://api.kraken.com/0/public/Ticker?pair=ETHUSD',
      'result.XETHZUSD.c.0',
      'fakeSleepJobId',
      'fakeOnDemandJobId',
      { from: accounts[1] }
    );

    const eventsChainLinkRequested = await utility.getEvent(
      oracleHubChainLink,
      'ChainlinkRequested'
    );
    const eventsRequest = await utility.getEvent(chainLinkOracle, 'RunRequest');
    const internalRequestId = eventsRequest[0].args.internalId;
    const requestID = eventsChainLinkRequested[0].args.id;

    let error = null;
    try {
      await oracleHubChainLink.callback(requestID, 0, { from: accounts[1] });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able call back from non oracle account!');

    // Here lets use the oracle contract to create the needed call to our hub.
    chainLinkOracle.fulfillData(internalRequestId, 0);
    const events = await utility.getEvent(oracleHubChainLink, 'ChainlinkFulfilled');
    assert.equal('ChainlinkFulfilled', events[0].event, 'Event called is not ChainlinkFulfilled');
  });
});
