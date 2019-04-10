const UpgradeableTokenMock = artifacts.require('UpgradeableTokenMock');
const MarketToken = artifacts.require('MarketToken');

// basic tests to ensure collateral token works and is set up to allow trading
contract('UpgradeableToken', function(accounts) {
  let marketToken;
  let upgradeableToken;
  let initBalance;
  const accountOwner = accounts[0];
  const accountUser = accounts[1];

  beforeEach(async function() {
    marketToken = await MarketToken.deployed();
    upgradeableToken = await UpgradeableTokenMock.new(marketToken.address);
  });

  it('Initial supply should be 6e+26', async function() {
    initBalance = await marketToken.INITIAL_SUPPLY();
    assert.equal(initBalance, 6e26, 'Initial balance not as expected');
  });

  it('Main account should have entire balance', async function() {
    const mainAcctBalance = await marketToken.balanceOf.call(accountOwner);
    assert.isTrue(
      mainAcctBalance.eq(initBalance),
      'Entire token balance should be in primary account'
    );
  });

  it('Upgradeable token should have the MKT token as the previous token', async function() {
    const tokenAddress = await upgradeableToken.PREVIOUS_TOKEN_ADDRESS();
    assert.equal(
      tokenAddress,
      marketToken.address,
      'Upgrade token should point back at the original MKT token'
    );
  });

  it('Only owner can set upgradeable target', async function() {
    error = null;
    try {
      await marketToken.setUpgradeableTarget(upgradeableToken.address, { from: accountUser });
    } catch (err) {
      error = err;
    }
    assert.ok(
      error instanceof Error,
      "didn't fail when non owner attempted to set upgradeable target"
    );

    await marketToken.setUpgradeableTarget(upgradeableToken.address, { from: accountOwner });

    const upgradeableTarget = await marketToken.upgradeableTarget();
    assert.equal(
      upgradeableTarget,
      upgradeableToken.address,
      'Upgrade target should point at new token'
    );
  });

  it('Can only burn owned tokens', async function() {
    const initialBalance = 50000000;

    await marketToken.transfer(accountUser, initialBalance, { from: accounts[0] });
    let currentBalance = await marketToken.balanceOf.call(accountUser);

    assert.equal(initialBalance, currentBalance, 'user account should have correct balance');

    error = null;
    try {
      await marketToken.burn(initialBalance + 5000, { from: accountUser });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, "didn't fail when attempting to burn more tokens than owned");

    const amountToBurn = initialBalance / 2;
    await marketToken.burn(amountToBurn, { from: accountUser });

    currentBalance = await marketToken.balanceOf.call(accountUser);
    assert.equal(
      initialBalance - amountToBurn,
      currentBalance,
      'user account should have correct balance after burn'
    );

    const initialSupply = await marketToken.INITIAL_SUPPLY.call();
    let currentSupply = await marketToken.totalSupply.call();

    assert.equal(
      initialSupply - amountToBurn,
      currentSupply,
      "current supply doesn't match after burn"
    );
  });

  it('Can only upgrade owned tokens', async function() {
    const initialBalance = await marketToken.balanceOf.call(accountUser);
    await marketToken.setUpgradeableTarget(upgradeableToken.address, { from: accountOwner });

    const upgradeableTarget = await marketToken.upgradeableTarget();
    assert.equal(
      upgradeableTarget,
      upgradeableToken.address,
      'Upgrade target should point at new token'
    );

    error = null;
    try {
      await marketToken.upgrade(initialBalance + 5000, { from: accountUser });
    } catch (err) {
      error = err;
    }
    assert.ok(
      error instanceof Error,
      "didn't fail when attempting to upgrade more tokens than owned"
    );

    const amountToUpgrade = initialBalance / 2;
    await marketToken.upgrade(amountToUpgrade, { from: accountUser });

    assert.equal(
      upgradeableTarget,
      upgradeableToken.address,
      'Upgrade target should point at new token'
    );

    const balanceAfterUpgrade = await marketToken.balanceOf.call(accountUser);
    assert.equal(
      initialBalance - amountToUpgrade,
      balanceAfterUpgrade,
      'user account should have correct balance after upgrade'
    );

    const totalUpgradeTokenBalance = await upgradeableToken.balanceOf.call(accountUser);
    assert.equal(
      amountToUpgrade,
      totalUpgradeTokenBalance,
      'user account should have correct balance after upgrade in new token'
    );
  });

  it('Cannot upgrade without a target', async function() {
    await marketToken.setUpgradeableTarget('0x0000000000000000000000000000000000000000'); // set target to null address

    error = null;
    try {
      await marketToken.upgrade(1, { from: accountOwner });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, "didn't fail when attempting to upgrade without a target");
  });
});
