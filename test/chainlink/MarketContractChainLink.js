const MarketContractChainLink = artifacts.require('MarketContractChainLink');
const CollateralToken = artifacts.require('CollateralToken');
const MathLib = artifacts.require('MathLib');

contract('MarketContractChainLink', function(accounts) {
  const expiration = new Date().getTime() / 1000 + 60 * 50; // order expires 50 minutes from now.
  const oracleQueryURL = 'https://api.kraken.com/0/public/Ticker?pair=ETHUSD';
  const oracleQueryPath = 'result.XETHZUSD.c.0';
  let marketContract;

  before(async function() {
    marketContract = await MarketContractChainLink.new(
      'MyNewContract',
      [accounts[0], CollateralToken.address],
      accounts[0], // substitute our address for the oracleHubAddress so we can callback from queries.
      [0, 150, 2, 2, expiration],
      oracleQueryURL,
      oracleQueryPath
    );
  });

  it('Constructor sets needed variables correctly', async function() {
    assert.equal(await marketContract.ORACLE_QUERY_URL(), oracleQueryURL);
    assert.equal(await marketContract.ORACLE_QUERY_PATH(), oracleQueryPath);
    assert.equal(await marketContract.ORACLE_HUB_ADDRESS(), accounts[0]);
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

    const txHash = await marketContract.oracleCallBack(100, { from: accounts[0] });
    assert.notEqual(txHash, null, 'oracleCallBack from oracle hub address failed');
  });

  it('oracleCallBack can push contract into settlement', async function() {
    assert.isTrue(!(await marketContract.isSettled()), 'marketContract is already settled');
    await marketContract.oracleCallBack(175, { from: accounts[0] }); // price above cap!
    assert.isTrue(await marketContract.isSettled(), 'marketContract is not settled');
  });

  it('oracleCallBack can not be called after settlement', async function() {
    assert.isTrue(await marketContract.isSettled(), 'marketContract is not settled');
    let error = null;
    try {
      await marketContract.oracleCallBack(175, { from: accounts[0] }); // price above cap!
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'should not be able to be called after expiration');
  });
});
