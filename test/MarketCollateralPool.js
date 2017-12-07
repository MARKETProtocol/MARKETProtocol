const MarketContractOraclize = artifacts.require("MarketContractOraclize");
const MarketCollateralPool = artifacts.require("MarketCollateralPool");
const CollateralToken = artifacts.require("CollateralToken");
const MarketToken = artifacts.require("MarketToken");


// basic tests to ensure MarketCollateralPool works and is set up to allow trading
contract('MarketCollateralPool', function(accounts) {

    let balancePerAcct;
    let collateralToken;
    let initBalance;
    let collateralPool;
    let marketContract;
    let marketToken

    it("Both accounts should be able to deposit to collateral pool contract", async function() {
        collateralToken = await CollateralToken.deployed();
        initBalance = await collateralToken.INITIAL_SUPPLY.call().valueOf();
        collateralPool = await MarketCollateralPool.deployed();
        marketContract = await MarketContractOraclize.deployed();
        marketToken = await MarketToken.deployed();

        // transfer half of balance to second account
        const balanceToTransfer = initBalance / 2;
        await collateralToken.transfer(accounts[1], balanceToTransfer, {from: accounts[0]});

        // currently the Market Token is deployed with no qty need to trade, so all accounts should
        // be enabled.
        const isAllowedToTradeAcctOne = await marketToken.isUserEnabledForContract(marketContract.address, accounts[0])
        const isAllowedToTradeAcctTwo = await marketToken.isUserEnabledForContract(marketContract.address, accounts[1])

        assert.isTrue(isAllowedToTradeAcctOne, "account isn't able to trade!");
        assert.isTrue(isAllowedToTradeAcctTwo, "account isn't able to trade!");

        const amountToDeposit = 5000000;
        // create approval for main contract to move tokens!
        await collateralToken.approve(collateralPool.address, amountToDeposit, {from: accounts[0]})
        await collateralToken.approve(collateralPool.address, amountToDeposit, {from: accounts[1]})

        // move tokens to the collateralPool
        await collateralPool.depositTokensForTrading(amountToDeposit, {from: accounts[0]})
        await collateralPool.depositTokensForTrading(amountToDeposit, {from: accounts[1]})

        // ensure balances are now inside the contract.
        const tradingBalanceAcctOne = await collateralPool.getUserAccountBalance.call(accounts[0]);
        const tradingBalanceAcctTwo = await collateralPool.getUserAccountBalance.call(accounts[1]);
        assert.equal(tradingBalanceAcctOne, amountToDeposit, "Balance doesn't equal tokens deposited");
        assert.equal(tradingBalanceAcctTwo, amountToDeposit, "Balance doesn't equal tokens deposited");
    });

    it("Both accounts should be able to withdraw from collateral pool contract", async function() {
        const amountToWithdraw = 2500000;
        // move tokens to the MarketContract
        await collateralPool.withdrawTokens(amountToWithdraw, {from: accounts[0]})
        await collateralPool.withdrawTokens(amountToWithdraw, {from: accounts[1]})
        // ensure balances are now correct inside the contract.
        let tradingBalanceAcctOne = await collateralPool.getUserAccountBalance.call(accounts[0]);
        let tradingBalanceAcctTwo = await collateralPool.getUserAccountBalance.call(accounts[1]);

        assert.equal(
            tradingBalanceAcctOne,
            amountToWithdraw,
            "Balance doesn't equal tokens deposited - withdraw"
        );
        assert.equal(
            tradingBalanceAcctTwo,
            amountToWithdraw,
            "Balance doesn't equal tokens deposited - withdraw"
        );

        // ensure balances are now correct inside the arbitrary token
        balancePerAcct = initBalance / 2;
        const expectedTokenBalances = balancePerAcct - tradingBalanceAcctOne;
        const secondAcctTokenBalance = await collateralToken.balanceOf.call(accounts[1]).valueOf();
        assert.equal(secondAcctTokenBalance, expectedTokenBalances, "Token didn't get transferred back to user");
    });
});