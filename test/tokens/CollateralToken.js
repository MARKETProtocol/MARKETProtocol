const BN = require('bn.js');
const CollateralToken = artifacts.require('CollateralToken');

// basic tests to ensure collateral token works and is set up to allow trading
contract('CollateralToken', function(accounts) {
  let initBalance;
  let collateralToken;
  // test setup of token for collateral
  it('Initial supply should be 1e+22', async function() {
    collateralToken = await CollateralToken.deployed();
    initBalance = await collateralToken.totalSupply.call();
    assert.equal(initBalance, 1e22, 'Initial balance not as expected');
  });

  it('Main account should have entire balance', async function() {
    const mainAcctBalance = await collateralToken.balanceOf.call(accounts[0]);
    assert.isTrue(
      mainAcctBalance.eq(initBalance),
      'Entire coin balance should be in primary account'
    );
  });

  it('Main account should be able to transfer balance', async function() {
    const balanceToTransfer = new BN(1000000);
    await collateralToken.transfer(accounts[1], balanceToTransfer.toString(), {
      from: accounts[0]
    });
    const secondAcctBalance = await collateralToken.balanceOf.call(accounts[1]);
    assert.isTrue(secondAcctBalance.eq(balanceToTransfer), "Transfer didn't register correctly");
  });
});
