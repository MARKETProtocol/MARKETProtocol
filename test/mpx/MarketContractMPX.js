const CollateralToken = artifacts.require('CollateralToken');
const MarketContractMPX = artifacts.require('MarketContractMPX');
const MarketCollateralPool = artifacts.require('MarketCollateralPool');
const MathLib = artifacts.require('MathLib');

contract('MarketContractMPX', function(accounts) {
  const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50); // order expires 50 minutes from now.
  const oracleURL = 'api.coincap.io/v2/rates/bitcoin';
  const oracleStatistic = 'rateUsd';
  let marketContract;

  before(async function() {
    const contractNames = [
      web3.utils.asciiToHex('BTC', 32),
      web3.utils.asciiToHex('LBTC', 32),
      web3.utils.asciiToHex('SBTC', 32)
    ];
    marketContract = await MarketContractMPX.new(
      contractNames,
      [accounts[0], CollateralToken.address, MarketCollateralPool.address],
      accounts[8], // substitute our address for the oracleHubAddress so we can callback from queries.
      [0, 150, 2, 2, 0, 0, expiration],
      oracleURL,
      oracleStatistic
    );
  });

  it('Constructor sets needed variables correctly', async function() {
    assert.equal(await marketContract.ORACLE_URL(), oracleURL);
    assert.equal(await marketContract.ORACLE_STATISTIC(), oracleStatistic);
    assert.equal(await marketContract.ORACLE_HUB_ADDRESS(), accounts[8]);
  });

  it('oracleCallBack can only be called by the oracleHub', async function() {
    let error = null;
    try {
      await marketContract.oracleCallBack(100, { from: accounts[1] });
    } catch (err) {
      error = err;
    }
    assert.ok(
      error instanceof Error,
      'should not be able to be called from an address that is an oracleHub'
    );

    const txHash = await marketContract.oracleCallBack(100, { from: accounts[8] });
    assert.notEqual(txHash, null, 'oracleCallBack from oracle hub address failed');
  });

  it('oracleCallBack can push contract into settlement', async function() {
    assert.isTrue(!(await marketContract.isSettled()), 'marketContract is already settled');
    await marketContract.oracleCallBack(175, { from: accounts[8] }); // price above cap!
    assert.isTrue(await marketContract.isSettled(), 'marketContract is not settled');
  });

  it('oracleCallBack can not be called after settlement', async function() {
    assert.isTrue(await marketContract.isSettled(), 'marketContract is not settled');
    let error = null;
    try {
      await marketContract.oracleCallBack(175, { from: accounts[8] }); // price above cap!
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able to be called after expiration');
  });

  it('arbitrateSettlement can only be called by the oracleHub', async function() {
    let error = null;
    try {
      await marketContract.arbitrateSettlement(100, { from: accounts[8] });
    } catch (err) {
      error = err;
    }
    assert.ok(
      error instanceof Error,
      'should not be able to be called from an address that is not the owner'
    );

    const txHash = await marketContract.arbitrateSettlement(100, { from: accounts[0] });
    assert.notEqual(txHash, null, 'arbitrateSettlement from owner address failed');
  });

  it('arbitrateSettlement can push contract into settlement', async function() {
    const contractNames = [
      web3.utils.asciiToHex('BTC', 32),
      web3.utils.asciiToHex('LBTC', 32),
      web3.utils.asciiToHex('SBTC', 32)
    ];
    marketContract = await MarketContractMPX.new(
      contractNames,
      [accounts[0], CollateralToken.address, MarketCollateralPool.address],
      accounts[8], // substitute our address for the oracleHubAddress so we can callback from queries.
      [25, 150, 2, 2, 0, 0, expiration],
      oracleURL,
      oracleStatistic
    );

    assert.isTrue(!(await marketContract.isSettled()), 'marketContract is already settled');
    await marketContract.arbitrateSettlement(25, { from: accounts[0] }); // price at floor
    assert.isTrue(await marketContract.isSettled(), 'marketContract is not settled');
  });
});
