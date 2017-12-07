const CollateralToken = artifacts.require("CollateralToken");


// basic tests to ensure collateral token works and is set up to allow trading
contract('CollateralToken', function(accounts) {
    let initBalance;
    let collateralToken;
    let balancePerAcct;
    // test setup of token for collateral
    it("Initial supply should be 1e+22", async function() {
        collateralToken = await CollateralToken.deployed();
        initBalance = await collateralToken.INITIAL_SUPPLY.call().valueOf();
        assert.equal(initBalance, 1e+22, "Initial balance not as expected");
    });

    it("Main account should have entire balance", async function() {
        const mainAcctBalance = await collateralToken.balanceOf.call(accounts[0]).valueOf();
        assert.equal(
            mainAcctBalance.toNumber(),
            initBalance.toNumber(),
            "Entire coin balance should be in primary account"
        );
    });

    it("Main account should be able to transfer balance", async function() {
        const balanceToTransfer = initBalance / 2;
        balancePerAcct = balanceToTransfer;
        await collateralToken.transfer(accounts[1], balanceToTransfer, {from: accounts[0]});
        const secondAcctBalance = await collateralToken.balanceOf.call(accounts[1]).valueOf();
        assert.equal(
            secondAcctBalance.toNumber(),
            balanceToTransfer,
            "Transfer didn't register correctly"
        );
    });
});