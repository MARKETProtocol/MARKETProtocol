const CollateralToken = artifacts.require('InitialAllocationCollateralToken');

// basic tests to ensure collateral token allows for initial grant.
contract('InitialAllocationCollateralToken', function(accounts) {
  let collateralToken;

  before(async function() {
    return CollateralToken.new('CollateralToken', 'CTK', 100, 18, {
      gas: 3000000,
      from: accounts[0]
    }).then(function(instance) {
      collateralToken = instance;
      return collateralToken;
    });
  });

  it('account should not have balance', async function() {
    const subAcctBalance = await collateralToken.balanceOf.call(accounts[1]);
    assert.equal(
      subAcctBalance.toNumber(),
      0,
      'balances should be zero for all accounts that did not deploy the token'
    );
  });

  it('account should be able to unlock balance only once', async function() {
    await collateralToken.getInitialAllocation({ from: accounts[1] });
    const subAcctBalance = await collateralToken.balanceOf.call(accounts[1]);
    const initialAllocation = await collateralToken.INITIAL_TOKEN_ALLOCATION();
    assert.isTrue(
      subAcctBalance.eq(initialAllocation),
      'balances should be allocated to called of getInitialAllocation'
    );

    const isAllocationClaimed = await collateralToken.isAllocationClaimed(accounts[1]);
    assert.equal(isAllocationClaimed, true, 'allocation not marked as claimed');

    const isAllocationClaimedOfDiffAccount = await collateralToken.isAllocationClaimed(accounts[2]);
    assert.equal(
      isAllocationClaimedOfDiffAccount,
      false,
      'allocation marked as claimed for fresh account'
    );

    let error = null;
    try {
      await collateralToken.getInitialAllocation({ from: accounts[1] });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, 'Caller was able to get initial allocation twice!');
  });
});
