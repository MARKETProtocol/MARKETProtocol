const MarketContractOraclize = artifacts.require("TestableMarketContractOraclize");
const MarketCollateralPool = artifacts.require("MarketCollateralPool");
const CollateralToken = artifacts.require("CollateralToken");
const MarketToken = artifacts.require("MarketToken");
const OrderLib = artifacts.require("OrderLib");
const Helpers = require('./helpers/Helpers.js')
const utility = require('./utility.js');

// basic tests to ensure MarketCollateralPool works and is set up to allow trading
contract('MarketCollateralPool', function(accounts) {

    let balancePerAcct;
    let collateralToken;
    let initBalance;
    let collateralPool;
    let marketContract;
    let marketToken
    let orderLib;
    let decimalPlaces;
    let priceFloor;
    let priceCap;
    let tradeHelper;

    beforeEach(async function() {
        collateralPool = await MarketCollateralPool.deployed();
        marketToken = await MarketToken.deployed();
        marketContract = await MarketContractOraclize.deployed();
        orderLib = await OrderLib.deployed();
        collateralToken = await CollateralToken.deployed();
        decimalPlaces = await marketContract.QTY_DECIMAL_PLACES.call();
        priceFloor = await marketContract.PRICE_FLOOR.call();
        priceCap = await marketContract.PRICE_CAP.call();
        tradeHelper = await Helpers.TradeHelper(MarketContractOraclize, OrderLib, CollateralToken, MarketCollateralPool)
    })

    it("Both accounts should be able to deposit to collateral pool contract", async function() {
        initBalance = await collateralToken.INITIAL_SUPPLY.call().valueOf();

        // transfer half of balance to second account
        const balanceToTransfer = initBalance / 2;
        await collateralToken.transfer(accounts[1], balanceToTransfer, {from: accounts[0]});

        // currently the Market Token is deployed with no qty need to trade, so all accounts should
        // be enabled.
        const isAllowedToTradeAcctOne = await marketToken.isUserEnabledForContract.call(marketContract.address, accounts[0])
        const isAllowedToTradeAcctTwo = await marketToken.isUserEnabledForContract.call(marketContract.address, accounts[1])

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

    it('should fail if settleAndClose() is called before settlement', async () => {
        // const entryOrderPrice = 3000;
        // const orderQty = 2;
        // const orderToFill = 1;
        // await tradeHelper.tradeOrder([accounts[0], accounts[1], accounts[2]], [entryOrderPrice, orderQty, orderToFill]);

        let error = null
        try {
            await collateralPool.settleAndClose.call({ from: accounts[0] });
        } catch (err) {
            error = err;
        }

        assert.ok(error instanceof Error, "settleAndClose() did not fail before settlement");
    })

    it('should close open positions and withdraw collateral to accounts when settleAndClose() is called', async function() {
        const entryOrderPrice = 3000;
        const settlementPrice = 20000; // force to settlement with price below price floor (20155)
        const orderQty = 2;
        const orderToFill = 1;

        await tradeHelper.tradeOrder(
            [accounts[0], accounts[1], accounts[2]],
            [entryOrderPrice, orderQty, orderToFill]
        );
        await tradeHelper.settleOrderWithPrice(settlementPrice);

        const expectedMakersTokenAfterSettlement = await tradeHelper.calculateSettlementToken(
            accounts[0],
            priceFloor,
            priceCap,
            decimalPlaces,
            orderToFill,
            settlementPrice
        )

        const expectedTakersTokenAfterSettlement = await tradeHelper.calculateSettlementToken(
            accounts[1],
            priceFloor,
            priceCap,
            decimalPlaces,
            -orderToFill,
            settlementPrice
        )

        await collateralPool.settleAndClose({ from: accounts[0] });
        await collateralPool.settleAndClose({ from: accounts[1] });

        // makers and takers collateral pool balance is cleared
        const makersCollateralBalanceAfterSettlement = await collateralPool.getUserAccountBalance.call(accounts[0]);
        const takersCollateralBalanceAfterSettlement = await collateralPool.getUserAccountBalance.call(accounts[1]);

        assert.equal(makersCollateralBalanceAfterSettlement.toNumber(), 0, 'Makers collateral balance not returned')
        assert.equal(takersCollateralBalanceAfterSettlement.toNumber(), 0, 'Takers collateral balance not returned')

        // check correct token amount is withdrawn to makers and takers account
        const makersTokenBalanceAfterSettlement = await collateralToken.balanceOf.call(accounts[0]);
        assert.equal(
            makersTokenBalanceAfterSettlement.toNumber(),
            expectedMakersTokenAfterSettlement.toNumber(),
            'Makers account incorrectly settled'
        );

        const takersTokenBalanceAfterSettlement = await collateralToken.balanceOf.call(accounts[1]);
        assert.equal(
            takersTokenBalanceAfterSettlement.toNumber(),
            expectedTakersTokenAfterSettlement.toNumber(),
            'Takers account incorrectly settled'
        );
    })

});