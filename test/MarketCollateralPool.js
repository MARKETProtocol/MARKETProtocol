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
    let qtyMultiplier;
    let priceFloor;
    let priceCap;
    let tradeHelper;
    const entryOrderPrice = 33025;
    const accountMaker = accounts[0];
    const accountTaker = accounts[1];

    beforeEach(async function() {
        collateralPool = await MarketCollateralPool.deployed();
        marketToken = await MarketToken.deployed();
        marketContract = await MarketContractOraclize.deployed();
        orderLib = await OrderLib.deployed();
        collateralToken = await CollateralToken.deployed();
        qtyMultiplier = await marketContract.QTY_MULTIPLIER.call();
        priceFloor = await marketContract.PRICE_FLOOR.call();
        priceCap = await marketContract.PRICE_CAP.call();
        tradeHelper = await Helpers.TradeHelper(MarketContractOraclize, OrderLib, CollateralToken, MarketCollateralPool)
    })

    it("Both accounts should be able to deposit to collateral pool contract", async function() {
        initBalance = await collateralToken.INITIAL_SUPPLY.call().valueOf();
        fourBalance = 10000;
        // transfer half of balance to second account
        const balanceToTransfer = initBalance / 2;
        await collateralToken.transfer(accounts[1], balanceToTransfer, {from: accounts[0]});
        await collateralToken.transfer(accounts[3], fourBalance, {from: accounts[0]});

        let error = null
        try {
            await collateralPool.depositTokensForTrading(500, {from: accounts[5]});
        } catch (err) {
            error = err;
        }

        assert.ok(error instanceof Error, "should not be able to deposit tokens until enabled");

        // currently the Market Token is deployed with no qty need to trade, so all accounts should
        // be enabled.
        const isAllowedToTradeAcctOne = await marketToken.isUserEnabledForContract.call(marketContract.address, accounts[0])
        const isAllowedToTradeAcctTwo = await marketToken.isUserEnabledForContract.call(marketContract.address, accounts[1])
        const isAllowedToTradeAcctFour = await marketToken.isUserEnabledForContract.call(marketContract.address, accounts[3])
        await marketToken.setLockQtyToAllowTrading(10);
        error = null

        try {
            await collateralPool.depositTokensForTrading(fourBalance, {from: accounts[3]});
        } catch (err) {
            error = err;
        }
        assert.ok(error instanceof Error, "should not be able to deposit tokens until APPROVED");
        await marketToken.setLockQtyToAllowTrading(0);

        assert.isTrue(isAllowedToTradeAcctOne, "account isn't able to trade!");
        assert.isTrue(isAllowedToTradeAcctTwo, "account isn't able to trade!");
        assert.isTrue(isAllowedToTradeAcctFour, "account isn't able to trade!");

        const amountToDeposit = 5000000;
        // create approval for main contract to move tokens!
        await collateralToken.approve(collateralPool.address, amountToDeposit, {from: accounts[0]})
        await collateralToken.approve(collateralPool.address, amountToDeposit, {from: accounts[1]})
        await collateralToken.approve(collateralPool.address, fourBalance, {from: accounts[3]})

        // move tokens to the collateralPool
        await collateralPool.depositTokensForTrading(amountToDeposit, {from: accounts[0]})
        await collateralPool.depositTokensForTrading(amountToDeposit, {from: accounts[1]})
        await collateralPool.depositTokensForTrading(fourBalance, {from: accounts[3]})

// trigger requires
        error = null
        try {
            await collateralPool.depositTokensForTrading(amountToDeposit, {from: accounts[2]});
        } catch (err) {
            error = err;
        }
       assert.ok(error instanceof Error, "should not be able to deposit tokens");

        error = null
        try {
            await collateralPool.settleAndClose( {from: accounts[2]});
        } catch (err) {
            error = err;
        }
        assert.ok(error instanceof Error, "should not be able call settleAndClose until settled");
// end trigger requires

        // ensure balances are now inside the contract.
        const tradingBalanceAcctOne = await collateralPool.getUserAccountBalance.call(accounts[0]);
        const tradingBalanceAcctTwo = await collateralPool.getUserAccountBalance.call(accounts[1]);
        const tradingBalanceAcctFour = await collateralPool.getUserAccountBalance.call(accounts[3]);
        assert.equal(tradingBalanceAcctOne, amountToDeposit, "Balance doesn't equal tokens deposited");
        assert.equal(tradingBalanceAcctTwo, amountToDeposit, "Balance doesn't equal tokens deposited");
        assert.equal(tradingBalanceAcctFour, fourBalance, "4 Balance doesn't equal tokens deposited");
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

    it("test lock marketToken", async function() {
        const entryOrderPrice = 3000;
        const settlementPrice = 20000; // force to settlement with price below price floor (20155)
        const orderQty = 2;
        const orderToFill = 1;

        // trigger require when don't have enough MKT tokens
        await marketToken.setLockQtyToAllowTrading(10);
        await marketToken.transfer(accountTaker, 10);
        await marketToken.lockTokensForTradingMarketContract(marketContract.address, 10, {from:accountTaker});

        try {
            await tradeHelper.tradeOrder(
                [accounts[0], accounts[1], accounts[2]],
                [entryOrderPrice, orderQty, orderToFill]
            );
        } catch (err) {
            error = err;
        }
        assert.ok(error instanceof Error, "didn't fail with inadequate locked market tokens for Maker");

        await marketToken.lockTokensForTradingMarketContract(marketContract.address, 10, {from:accountMaker});
        await marketToken.unlockTokens(marketContract.address, 10, {from:accountTaker});

        try {
            await tradeHelper.tradeOrder(
                [accounts[0], accounts[1], accounts[2]],
                [entryOrderPrice, orderQty, orderToFill]
            );
        } catch (err) {
            error = err;
        }
        assert.ok(error instanceof Error, "didn't fail with inadequate locked market tokens for Taker");

        await marketToken.unlockTokens(marketContract.address, 10, {from:accountMaker});
        //
        //  try to withdraw collateral without adequate locked tokens
        //
        try {
            await collateralPool.withdrawTokens(1, {from: accounts[1]})
        } catch (err) {
            error = err;
        }
        assert.ok(error instanceof Error, "didn't fail withdrawTokens with inadequate locked market tokens for Taker");
        //
        //  try to deposit tokens without adequate locked tokens
        //
        try {
            await collateralPool.depositTokensForTrading(amountToDeposit, {from: accounts[0]})
        } catch (err) {
            error = err;
        }
        assert.ok(error instanceof Error, "didn't fail depositTokens with inadequate locked market tokens for Maker");

        //  clear out the lockqty
        await marketToken.setLockQtyToAllowTrading(0);
    });

    it("2 Trades occur, 1 cancel occurs, new order, 2 trades, positions updated", async function() {
        const timeStamp = ((new Date()).getTime() / 1000) + 60*5; // order expires 5 minute from now.
        const orderAddresses = [accountMaker, accountTaker, accounts[2]];
        const smallAddress = [accountMaker, accounts[3], accounts[2]];
        const unsignedOrderValues = [0, 0, entryOrderPrice, timeStamp, 1];
        var orderQty = 10;   // user is attempting to buy 10
        // set up 2 different trades (different trading partners)
        const orderHash = await orderLib.createOrderHash.call(
            MarketContractOraclize.address,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );
        // this one designed to fail
        const smallOrderHash = await orderLib.createOrderHash.call(
            MarketContractOraclize.address,
            smallAddress,
            unsignedOrderValues,
            orderQty
        );

        // create approval and deposit collateral tokens for trading.
        const amountToDeposit = 5000000;
        await collateralToken.approve(collateralPool.address, amountToDeposit, {from: accounts[0]})
        await collateralToken.approve(collateralPool.address, amountToDeposit, {from: accounts[1]})

        // move tokens to the collateralPool
        await collateralPool.depositTokensForTrading(amountToDeposit, {from: accounts[0]})
        await collateralPool.depositTokensForTrading(amountToDeposit, {from: accounts[1]})

        makerAccountBalanceBeforeTrade = await collateralPool.getUserAccountBalance.call(accounts[0]);
        takerAccountBalanceBeforeTrade = await collateralPool.getUserAccountBalance.call(accounts[1]);

        // Execute trade between maker and taker for partial amount of order.
        var qtyToFill = 1;
        var orderSignature = utility.signMessage(web3, accountMaker, orderHash)
        await marketContract.tradeOrder(
            orderAddresses,
            unsignedOrderValues,
            orderQty,                  // qty is 10
            qtyToFill,          // let us fill a one lot
            orderSignature[0],  // v
            orderSignature[1],  // r
            orderSignature[2],  // s
            {from: accountTaker}
        );
        // the taker on this order has no tokens, order will fail
        orderSignature = utility.signMessage(web3, accountMaker, smallOrderHash)
        error = null
        try {
            await marketContract.tradeOrder(
                smallAddress,
                unsignedOrderValues,
                orderQty,                  // qty is 10
                qtyToFill,          // let us fill a one lot
                orderSignature[0],  // v
                orderSignature[1],  // r
                orderSignature[2],  // s
                {from: accounts[3]}
            );
        } catch (err) {
            error = err;
        }
        assert.ok(error instanceof Error, "didn't fail a trade order");

        var makerNetPos = await collateralPool.getUserPosition.call(accountMaker);
        var takerNetPos = await collateralPool.getUserPosition.call(accountTaker);
        assert.equal(makerNetPos.toNumber(), 1, "Maker should be long 1");
        assert.equal(takerNetPos.toNumber(), -1, "Taker should be short 1");

        var qtyFilled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
        assert.equal(qtyFilled.toNumber(), 1, "Fill Qty doesn't match expected");

        qtyToFill = 2;
        orderSignature = utility.signMessage(web3, accountMaker, orderHash)
        await marketContract.tradeOrder(
            orderAddresses,
            unsignedOrderValues,
            orderQty,                  // qty is 10
            qtyToFill,          // let us fill a one lot
            orderSignature[0],  // v
            orderSignature[1],  // r
            orderSignature[2],  // s
            {from: accountTaker}
        );

        makerNetPos = await collateralPool.getUserPosition.call(accountMaker);
        takerNetPos = await collateralPool.getUserPosition.call(accountTaker);
        assert.equal(makerNetPos.toNumber(), 3, "Maker should be long 3");
        assert.equal(takerNetPos.toNumber(), -3, "Taker should be short 3");

        qtyFilled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
        assert.equal(qtyFilled.toNumber(), 3, "Fill Qty doesn't match expected");

        await marketContract.cancelOrder(orderAddresses, unsignedOrderValues, 10, 1); //cancel part of order
        const qtyFilledOrCancelled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
        assert.equal(qtyFilledOrCancelled.toNumber(), 4, "Fill Or Cancelled Qty doesn't match expected");

        // after the execution we should have collateral transferred from users to the pool, check all balances
        // here.
        const priceFloor = await marketContract.PRICE_FLOOR.call();
        const priceCap = await marketContract.PRICE_CAP.call();
        const qtyMultiplier = await marketContract.QTY_MULTIPLIER.call();
        const actualCollateralPoolBalance = await collateralPool.collateralPoolBalance.call();

        const longCollateral = (entryOrderPrice - priceFloor) * qtyMultiplier * qtyFilled;
        const shortCollateral = (priceCap - entryOrderPrice) * qtyMultiplier * qtyFilled;
        const totalExpectedCollateralBalance = longCollateral + shortCollateral;

        assert.equal(
            totalExpectedCollateralBalance,
            actualCollateralPoolBalance,
            "Collateral pool isn't funded correctly"
        );

        const makerAccountBalanceAfterTrade = await collateralPool.getUserAccountBalance.call(accounts[0]);
        const takerAccountBalanceAfterTrade = await collateralPool.getUserAccountBalance.call(accounts[1]);

        assert.equal(
            makerAccountBalanceAfterTrade,
            makerAccountBalanceBeforeTrade - longCollateral,
            "Maker balance is wrong"
        );
        assert.equal(
            takerAccountBalanceAfterTrade,
            takerAccountBalanceBeforeTrade - shortCollateral,
            "Taker balance is wrong"
        );
        orderQty = -10;   // user is attempting to sell 10
        const secondOrderHash = await orderLib.createOrderHash.call(
            MarketContractOraclize.address,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );

        // Execute trade between maker and taker for partial amount of order.
        takerAccountBalanceBeforeTrade = takerAccountBalanceAfterTrade;
        makerAccountBalanceBeforeTrade = makerAccountBalanceAfterTrade;
        qtyToFill = -1;
        orderSignature = utility.signMessage(web3, accountMaker, secondOrderHash)
        await marketContract.tradeOrder(
            orderAddresses,
            unsignedOrderValues,
            orderQty,                  // qty is -10
            qtyToFill,          // let us fill a minus two lot
            orderSignature[0],  // v
            orderSignature[1],  // r
            orderSignature[2],  // s
            {from: accountTaker}
        );
        makerNetPos = await collateralPool.getUserPosition.call(accountMaker);
        takerNetPos = await collateralPool.getUserPosition.call(accountTaker);
        assert.equal(makerNetPos.toNumber(), 2, "Maker should be long 2");
        assert.equal(takerNetPos.toNumber(), -2, "Taker should be short 2");

        qtyFilled = await marketContract.getQtyFilledOrCancelledFromOrder.call(secondOrderHash);
        assert.equal(qtyFilled.toNumber(), -1, "Fill Qty doesn't match expected");
        const elongCollateral = (entryOrderPrice - priceFloor) * qtyMultiplier * qtyFilled;
        const eshortCollateral = (priceCap - entryOrderPrice) * qtyMultiplier * qtyFilled;

        const emakerAccountBalanceAfterTrade = await collateralPool.getUserAccountBalance.call(accounts[0]);
        const etakerAccountBalanceAfterTrade = await collateralPool.getUserAccountBalance.call(accounts[1]);

        assert.equal(
            emakerAccountBalanceAfterTrade.toNumber(),
            makerAccountBalanceBeforeTrade - elongCollateral,
            "ending Maker balance is wrong"
        );
        assert.equal(
            etakerAccountBalanceAfterTrade.toNumber(),
            takerAccountBalanceBeforeTrade - eshortCollateral,
            "ending Taker balance is wrong"
        );
        qtyToFill = -2;
        orderSignature = utility.signMessage(web3, accountMaker, secondOrderHash)
        await marketContract.tradeOrder(
            orderAddresses,
            unsignedOrderValues,
            orderQty,                  // qty is -10
            qtyToFill,          // let us fill a minus two lot
            orderSignature[0],  // v
            orderSignature[1],  // r
            orderSignature[2],  // s
            {from: accountTaker}
        );
    });


    it("Fail depositTokensForTrading when not enough MKT tokens for contract", async function() {
        await marketToken.setLockQtyToAllowTrading(10);
        var error = null
        try {
            await collateralPool.depositTokensForTrading(1, {from: accounts[2]});
        } catch (err) {
            error = err;
        }
        assert.ok(error instanceof Error, "should not be able to deposit tokens until enabled");
        await marketToken.setLockQtyToAllowTrading(0);
    });



    it('should close open positions and withdraw collateral to accounts when settleAndClose() is called', async function() {
        const entryOrderPrice = 3000;
        const settlementPrice = 20000; // force to settlement with price below price floor (20155)
        const orderQty = 2;
        const orderQtyToFill = 1;

        await tradeHelper.tradeOrder(
            [accounts[0], accounts[1], accounts[2]],
            [entryOrderPrice, orderQty, orderQtyToFill]
        );
        await tradeHelper.attemptToSettleContract(settlementPrice); // this should push our contract into settlement.

        const expectedMakersTokenBalanceAfterSettlement = await tradeHelper.calculateSettlementToken(
            accounts[0],
            priceFloor,
            priceCap,
            qtyMultiplier,
            orderQtyToFill,
            settlementPrice
        )

        const expectedTakersTokenBalanceAfterSettlement = await tradeHelper.calculateSettlementToken(
            accounts[1],
            priceFloor,
            priceCap,
            qtyMultiplier,
            -orderQtyToFill,
            settlementPrice
        )

        // test for inadequate locked tokens
        await marketToken.setLockQtyToAllowTrading(10);
        try {
            await collateralPool.settleAndClose({ from: accounts[0] });
        } catch (err) {
            error = err;
        }
        assert.ok(error instanceof Error, "didn't fail settleAndClose for inadequate locked market tokens for Taker");
        await marketToken.setLockQtyToAllowTrading(0);
        // end test for inadequate locked tokens

        // each account now calls settle and close, returning to them all collateral.
        await collateralPool.settleAndClose({ from: accounts[0] });
        await collateralPool.settleAndClose({ from: accounts[1] });
        await collateralPool.settleAndClose({ from: accounts[3] });

        // makers and takers collateral pool balance is cleared
        const makersCollateralBalanceAfterSettlement = await collateralPool.getUserAccountBalance.call(accounts[0]);
        const takersCollateralBalanceAfterSettlement = await collateralPool.getUserAccountBalance.call(accounts[1]);

        assert.equal(makersCollateralBalanceAfterSettlement.toNumber(), 0, 'Makers collateral balance not returned')
        assert.equal(takersCollateralBalanceAfterSettlement.toNumber(), 0, 'Takers collateral balance not returned')

        // check correct token amount is withdrawn to makers and takers account
        const makersTokenBalanceAfterSettlement = await collateralToken.balanceOf.call(accounts[0]);
        assert.equal(
            makersTokenBalanceAfterSettlement.toNumber(),
            expectedMakersTokenBalanceAfterSettlement.toNumber(),
            'Makers account incorrectly settled'
        );

        const takersTokenBalanceAfterSettlement = await collateralToken.balanceOf.call(accounts[1]);
        assert.equal(
            takersTokenBalanceAfterSettlement.toNumber(),
            expectedTakersTokenBalanceAfterSettlement.toNumber(),
            'Takers account incorrectly settled'
        );

    })

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


});