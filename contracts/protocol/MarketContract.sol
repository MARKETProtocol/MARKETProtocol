/*
    Copyright 2017-2019 MARKET Protocol

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
*/

pragma solidity 0.5.11;

import "github.com/OpenZeppelin/openzeppelin-contracts/blob/v2.3.0/contracts/ownership/Ownable.sol";

import "./MarketContractStore.sol";
import "./MathLib.sol";
import "./StringLib.sol";
import "./PositionToken.sol";

/// @title MarketContract base contract implementing all needed functionality for trading.
/// @author MARKET Protocol <support@marketprotocol.io>
contract MarketContract is Ownable {
    using StringLib for *;

    address public storeAddress;
    string public name;

    // events
    event UpdatedLastPrice(uint256 price);
    event ContractSettled(uint settlePrice);

    constructor(
        string memory name_,
        address storeAddress_,

        address collateralPoolAddress,
        address collateralTokenAddress,
        address feeStrategyAddress,
        address longTokenAddress,
        address owner,
        address settler,
        address shortTokenAddress,

        uint quantityMultiplier,
        uint priceCap,
        uint priceFloor,
        uint priceDecimals
    )
        public
    {
        name = name_;
        storeAddress = storeAddress_;
        
        MarketContractStore(storeAddress).register(
            collateralPoolAddress,
            collateralTokenAddress,
            feeStrategyAddress,
            longTokenAddress,
            owner,
            settler,
            shortTokenAddress,
            quantityMultiplier,
            priceCap,
            priceFloor,
            priceDecimals
        );
    }

    // External functions
    // ...

    // External functions that are view
    // ...

    // External functions that are pure
    // ...

    // Public functions
    // ...

    // Internal functions
    // ...

    // Private functions
    // ...





    /// @param contractNames bytes32 array of names
    ///     contractName            name of the market contract
    ///     longTokenSymbol         symbol for the long token
    ///     shortTokenSymbol        symbol for the short token
    /// @param baseAddresses array of 2 addresses needed for our contract including:
    ///     ownerAddress                    address of the owner of these contracts.
    ///     collateralTokenAddress          address of the ERC20 token that will be used for collateral and pricing
    ///     collateralPoolAddress           address of our collateral pool contract
    /// @param oracleHubAddress     address of our oracle hub providing the callbacks
    /// @param contractSpecs array of unsigned integers including:
    ///     floorPrice              minimum tradeable price of this contract, contract enters settlement if breached
    ///     capPrice                maximum tradeable price of this contract, contract enters settlement if breached
    ///     priceDecimalPlaces      number of decimal places to convert our queried price from a floating point to
    ///                             an integer
    ///     qtyMultiplier           multiply traded qty by this value from base units of collateral token.
    ///     feeInBasisPoints    fee amount in basis points (Collateral token denominated) for minting.
    ///     mktFeeInBasisPoints fee amount in basis points (MKT denominated) for minting.
    ///     expirationTimeStamp     seconds from epoch that this contract expires and enters settlement
    /// @param oracleURL url of data
    /// @param oracleStatistic statistic type (lastPrice, vwap, etc)
    // constructor(
    //     bytes32[3] memory contractNames,
    //     address[3] memory baseAddresses,
    //     address oracleHubAddress,
    //     uint[7] memory contractSpecs,
    //     string memory oracleURL,
    //     string memory oracleStatistic
    // ) public
    // {
    //     PRICE_FLOOR = contractSpecs[0];
    //     PRICE_CAP = contractSpecs[1];
    //     require(PRICE_CAP > PRICE_FLOOR, "PRICE_CAP must be greater than PRICE_FLOOR");

    //     PRICE_DECIMAL_PLACES = contractSpecs[2];
    //     QTY_MULTIPLIER = contractSpecs[3];
    //     EXPIRATION = contractSpecs[6];
    //     require(EXPIRATION > now, "EXPIRATION must be in the future");
    //     require(QTY_MULTIPLIER != 0,"QTY_MULTIPLIER cannot be 0");

    //     COLLATERAL_TOKEN_ADDRESS = baseAddresses[1];
    //     COLLATERAL_POOL_ADDRESS = baseAddresses[2];
    //     COLLATERAL_PER_UNIT = MathLib.calculateTotalCollateral(PRICE_FLOOR, PRICE_CAP, QTY_MULTIPLIER);
    //     COLLATERAL_TOKEN_FEE_PER_UNIT = MathLib.calculateFeePerUnit(
    //         PRICE_FLOOR,
    //         PRICE_CAP,
    //         QTY_MULTIPLIER,
    //         contractSpecs[4]
    //     );
    //     MKT_TOKEN_FEE_PER_UNIT = MathLib.calculateFeePerUnit(
    //         PRICE_FLOOR,
    //         PRICE_CAP,
    //         QTY_MULTIPLIER,
    //         contractSpecs[5]
    //     );

    //     // create long and short tokens
    //     CONTRACT_NAME = contractNames[0].bytes32ToString();
    //     PositionToken longPosToken = new PositionToken(
    //         "MARKET Protocol Long Position Token",
    //         contractNames[1].bytes32ToString(),
    //         uint8(PositionToken.MarketSide.Long)
    //     );
    //     PositionToken shortPosToken = new PositionToken(
    //         "MARKET Protocol Short Position Token",
    //         contractNames[2].bytes32ToString(),
    //         uint8(PositionToken.MarketSide.Short)
    //     );

    //     LONG_POSITION_TOKEN = address(longPosToken);
    //     SHORT_POSITION_TOKEN = address(shortPosToken);

    //     ORACLE_URL = oracleURL;
    //     ORACLE_STATISTIC = oracleStatistic;
    //     ORACLE_HUB_ADDRESS = oracleHubAddress;

    //     transferOwnership(baseAddresses[0]);
    // }

    /*
    // EXTERNAL - onlyCollateralPool METHODS
    */

    /// @notice called only by our collateral pool to create long and short position tokens
    /// @param qtyToMint    qty in base units of how many short and long tokens to mint
    /// @param minter       address of minter to receive tokens
    // function mintPositionTokens(
    //     uint256 qtyToMint,
    //     address minter
    // ) external onlyCollateralPool
    // {
    //     // mint and distribute short and long position tokens to our caller
    //     PositionToken(LONG_POSITION_TOKEN).mintAndSendToken(qtyToMint, minter);
    //     PositionToken(SHORT_POSITION_TOKEN).mintAndSendToken(qtyToMint, minter);
    // }

    /// @notice called only by our collateral pool to redeem long position tokens
    /// @param qtyToRedeem  qty in base units of how many tokens to redeem
    /// @param redeemer     address of person redeeming tokens
    // function redeemLongToken(
    //     uint256 qtyToRedeem,
    //     address redeemer
    // ) external onlyCollateralPool
    // {
    //     // mint and distribute short and long position tokens to our caller
    //     PositionToken(LONG_POSITION_TOKEN).redeemToken(qtyToRedeem, redeemer);
    // }

    /// @notice called only by our collateral pool to redeem short position tokens
    /// @param qtyToRedeem  qty in base units of how many tokens to redeem
    /// @param redeemer     address of person redeeming tokens
    // function redeemShortToken(
    //     uint256 qtyToRedeem,
    //     address redeemer
    // ) external onlyCollateralPool
    // {
    //     // mint and distribute short and long position tokens to our caller
    //     PositionToken(SHORT_POSITION_TOKEN).redeemToken(qtyToRedeem, redeemer);
    // }

    /*
    // Public METHODS
    */

    /// @notice checks to see if a contract is settled, and that the settlement delay has passed
    // function isPostSettlementDelay() public view returns (bool) {
    //     return isSettled && (now >= (settlementTimeStamp + SETTLEMENT_DELAY));
    // }

    /*
    // PRIVATE METHODS
    */


    /// @dev records our final settlement price and fires needed events.
    /// @param finalSettlementPrice final query price at time of settlement
    function settleContract(uint finalSettlementPrice) internal {
        settlementTimeStamp = now;
        settlementPrice = finalSettlementPrice;
        emit ContractSettled(finalSettlementPrice);
    }

    /// @notice only able to be called directly by our collateral pool which controls the position tokens
    /// for this contract!
    modifier onlyCollateralPool {
        require(msg.sender == COLLATERAL_POOL_ADDRESS, "Only callable from the collateral pool");
        _;
    }

    /// @dev called only by our oracle hub when a new price is available provided by our oracle.
    /// @param price lastPrice provided by the oracle.
    function oracleCallBack(uint256 price) public onlyOracleHub {
        require(!isSettled);
        lastPrice = price;
        emit UpdatedLastPrice(price);
        checkSettlement();  // Verify settlement at expiration or requested early settlement.
    }

    /// @dev allows us to arbitrate a settlement price by updating the settlement value, and resetting the
    /// delay for funds to be released. Could also be used to allow us to force a contract into early settlement
    /// if a dispute arises that we believe is best resolved by early settlement.
    /// @param price settlement price
    function arbitrateSettlement(uint256 price) public onlyOwner {
        require(price >= PRICE_FLOOR && price <= PRICE_CAP, "arbitration price must be within contract bounds");
        lastPrice = price;
        emit UpdatedLastPrice(price);
        settleContract(price);
        isSettled = true;
    }

    /// @dev allows calls only from the oracle hub.
    modifier onlyOracleHub() {
        require(msg.sender == ORACLE_HUB_ADDRESS, "only callable by the oracle hub");
        _;
    }

    /// @dev allows for the owner of the contract to change the oracle hub address if needed
    function setOracleHubAddress(address oracleHubAddress) public onlyOwner {
        require(oracleHubAddress != address(0), "cannot set oracleHubAddress to null address");
        ORACLE_HUB_ADDRESS = oracleHubAddress;
    }
}
