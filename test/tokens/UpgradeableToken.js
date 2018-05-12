const UpgradeableTokenMock = artifacts.require("UpgradeableTokenMock");
const MarketToken = artifacts.require("MarketToken");

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
  })

  it("Initial supply should be 6e+26", async function() {
    initBalance = await marketToken.INITIAL_SUPPLY.call().valueOf();
    assert.equal(initBalance, 6e+26, "Initial balance not as expected");
  });

  it("Main account should have entire balance", async function() {
    const mainAcctBalance = await marketToken.balanceOf.call(accountOwner).valueOf();
    assert.equal(
      mainAcctBalance.toNumber(),
      initBalance.toNumber(),
      "Entire token balance should be in primary account"
    );
  });

  it("Upgradeable token should have the MKT token as the previous token", async function() {
    const tokenAddress = await upgradeableToken.PREVIOUS_TOKEN_ADDRESS.call();
    assert.equal(
      tokenAddress,
      marketToken.address,
      "Upgrade token should point back at the original MKT token"
    );
  });

  it("Only owner can set upgradeable target", async function() {

    error = null
    try {
      await marketToken.setUpgradeableTarget(
        upgradeableToken.address,
        {from: accountUser}
      );
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof Error, "didn't fail when non owner attempted to set upgradeable target");

    await marketToken.setUpgradeableTarget(
      upgradeableToken.address,
      {from: accountOwner}
    );

    const upgradeableTarget = await marketToken.upgradeableTarget.call();
    assert.equal(
      upgradeableTarget,
      upgradeableToken.address,
      "Upgrade target should point at new token"
    );
  });

  //TODO: add
  // burn test
  // test for conversion
});