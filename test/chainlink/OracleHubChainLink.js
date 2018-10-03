const OrableHubChainLink = artifacts.require("OracleHubChainLink");
const LinkToken = artifacts.require('LinkToken.sol');


contract('OracleHubChainLink', function(accounts) {

  let oracleHubChainLink;
  let linkToken;

  before(async function() {
    oracleHubChainLink = await OrableHubChainLink.deployed();
    linkToken = await LinkToken.deployed();
  });

  beforeEach(async function() {

  });

  it('Link balances can be withdrawn by owner', async function() {

    const initialBalance = await linkToken.balanceOf(oracleHubChainLink.address);
    expect(initialBalance, 10e22, "Initial balance does not reflect migrations");

    const ownerAccont = await oracleHubChainLink.owner();
    assert.equal(ownerAccont, accounts[0], "Owner account of the Hub isn't our main test account");

    const balanceToTransfer = 1e20;

    let error = null;
    try {
      await oracleHubChainLink.withdrawLink(accounts[1], balanceToTransfer, {from: accounts[1]});
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able to withdraw from non-owner account');

    assert.equal(await linkToken.balanceOf(accounts[1]), 0, "test account already has balance");

    oracleHubChainLink.withdrawLink(accounts[1], balanceToTransfer, {from: accounts[0]});
    const transferredBalance = await linkToken.balanceOf(accounts[1]);

    assert.equal(balanceToTransfer, transferredBalance, "Withdraw of link failed");
  });

  it('Factory address can be set by owner', async function() {
    const originalContractFactoryAddress = await oracleHubChainLink.marketContractFactoryAddress();

    let error = null;
    try {
      await oracleHubChainLink.setFactoryAddress(accounts[1], {from: accounts[1]});
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able to set factory from non-owner account');

    await oracleHubChainLink.setFactoryAddress(accounts[1], {from: accounts[0]});
    assert.equal(await oracleHubChainLink.marketContractFactoryAddress(), accounts[1], "Did not set factory address correctly");

    await oracleHubChainLink.setFactoryAddress(originalContractFactoryAddress, {from: accounts[0]});
    assert.equal(await oracleHubChainLink.marketContractFactoryAddress(), originalContractFactoryAddress, "Did not set factory address back correctly");
  });

  it('requestQuery can be called by factory address', async function() {
    // fails with non factory
    // set factory address to our account and attempt call.

    let error = null;
    try {
      await oracleHubChainLink.setFactoryAddress(accounts[1], {from: accounts[1]});
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able to set factory from non-owner account');



  });

  it('callBack can be called by a the oracle address', async function() {
    // fails with non factory
    // set factory address to our account and attempt call.
  });

  it('callBack can push contract into expiration', async function() {
    // should probably be in MarketContractChainLink
  });





});
