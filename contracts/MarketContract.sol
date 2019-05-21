/*
    Copyright 2017-2019 Phillip A. Elsasser

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

pragma solidity 0.5.2;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

import "./libraries/MathLib.sol";
import "./libraries/StringLib.sol";
import "./tokens/PositionToken.sol";


/// @title MarketContract base contract implement all needed functionality for trading.
/// @notice this is the abstract base contract that all contracts should inherit from to
/// implement different oracle solutions.
/// @author Phil Elsasser <phil@marketprotocol.io>
contract MarketContract is Ownable {
    using StringLib for *;

    string public CONTRACT_NAME;
    address public COLLATERAL_TOKEN_ADDRESS;
    address public COLLATERAL_POOL_ADDRESS;
    uint public PRICE_CAP;
    uint public PRICE_FLOOR;
    uint public PRICE_DECIMAL_PLACES;   // how to convert the pricing from decimal format (if valid) to integer
    uint public QTY_MULTIPLIER;         // multiplier corresponding to the value of 1 increment in price to token base units
    uint public COLLATERAL_PER_UNIT;    // required collateral amount for the full range of outcome tokens
    uint public COLLATERAL_TOKEN_FEE_PER_UNIT;
    uint public MKT_TOKEN_FEE_PER_UNIT;
    uint public EXPIRATION;
    uint public SETTLEMENT_DELAY = 1 days;
    address public LONG_POSITION_TOKEN;
    address public SHORT_POSITION_TOKEN;

    // state variables
    uint public lastPrice;
    uint public settlementPrice;
    uint public settlementTimeStamp;
    bool public isSettled = false;

    // events
    event UpdatedLastPrice(uint256 price);
    event ContractSettled(uint settlePrice);

    /// @param contractNames bytes32 array of names
    ///     contractName            name of the market contract
    ///     longTokenSymbol         symbol for the long token
    ///     shortTokenSymbol        symbol for the short token
    /// @param baseAddresses array of 2 addresses needed for our contract including:
    ///     ownerAddress                    address of the owner of these contracts.
    ///     collateralTokenAddress          address of the ERC20 token that will be used for collateral and pricing
    ///     collateralPoolAddress           address of our collateral pool contract
    /// @param contractSpecs array of unsigned integers including:
    ///     floorPrice          minimum tradeable price of this contract, contract enters settlement if breached
    ///     capPrice            maximum tradeable price of this contract, contract enters settlement if breached
    ///     priceDecimalPlaces  number of decimal places to convert our queried price from a floating point to
    ///                         an integer
    ///     qtyMultiplier       multiply traded qty by this value from base units of collateral token.
    ///     feeInBasisPoints    fee amount in basis points (Collateral token denominated) for minting.
    ///     mktFeeInBasisPoints fee amount in basis points (MKT denominated) for minting.
    ///     expirationTimeStamp seconds from epoch that this contract expires and enters settlement
    constructor(
        bytes32[3] memory contractNames,
        address[3] memory baseAddresses,
        uint[7] memory contractSpecs
    ) public
    {
        PRICE_FLOOR = contractSpecs[0];
        PRICE_CAP = contractSpecs[1];
        require(PRICE_CAP > PRICE_FLOOR, "PRICE_CAP must be greater than PRICE_FLOOR");

        PRICE_DECIMAL_PLACES = contractSpecs[2];
        QTY_MULTIPLIER = contractSpecs[3];
        EXPIRATION = contractSpecs[6];
        require(EXPIRATION > now, "EXPIRATION must be in the future");
        require(QTY_MULTIPLIER != 0,"QTY_MULTIPLIER cannot be 0");

        COLLATERAL_TOKEN_ADDRESS = baseAddresses[1];
        COLLATERAL_POOL_ADDRESS = baseAddresses[2];
        COLLATERAL_PER_UNIT = MathLib.calculateTotalCollateral(PRICE_FLOOR, PRICE_CAP, QTY_MULTIPLIER);
        COLLATERAL_TOKEN_FEE_PER_UNIT = MathLib.calculateFeePerUnit(
            PRICE_FLOOR,
            PRICE_CAP,
            QTY_MULTIPLIER,
            contractSpecs[4]
        );
        MKT_TOKEN_FEE_PER_UNIT = MathLib.calculateFeePerUnit(
            PRICE_FLOOR,
            PRICE_CAP,
            QTY_MULTIPLIER,
            contractSpecs[5]
        );

        // create long and short tokens
        CONTRACT_NAME = contractNames[0].bytes32ToString();
        PositionToken longPosToken = new PositionToken(
            "MARKET Protocol Long Position Token",
            contractNames[1].bytes32ToString(),
            uint8(PositionToken.MarketSide.Long)
        );
        PositionToken shortPosToken = new PositionToken(
            "MARKET Protocol Short Position Token",
            contractNames[2].bytes32ToString(),
            uint8(PositionToken.MarketSide.Short)
        );

        LONG_POSITION_TOKEN = address(longPosToken);
        SHORT_POSITION_TOKEN = address(shortPosToken);

        transferOwnership(baseAddresses[0]);
    }

    /*
    // EXTERNAL - onlyCollateralPool METHODS
    */

    /// @notice called only by our collateral pool to create long and short position tokens
    /// @param qtyToMint    qty in base units of how many short and long tokens to mint
    /// @param minter       address of minter to receive tokens
    function mintPositionTokens(
        uint256 qtyToMint,
        address minter
    ) external onlyCollateralPool
    {
        // mint and distribute short and long position tokens to our caller
        PositionToken(LONG_POSITION_TOKEN).mintAndSendToken(qtyToMint, minter);
        PositionToken(SHORT_POSITION_TOKEN).mintAndSendToken(qtyToMint, minter);
    }

    /// @notice called only by our collateral pool to redeem long position tokens
    /// @param qtyToRedeem  qty in base units of how many tokens to redeem
    /// @param redeemer     address of person redeeming tokens
    function redeemLongToken(
        uint256 qtyToRedeem,
        address redeemer
    ) external onlyCollateralPool
    {
        // mint and distribute short and long position tokens to our caller
        PositionToken(LONG_POSITION_TOKEN).redeemToken(qtyToRedeem, redeemer);
    }

    /// @notice called only by our collateral pool to redeem short position tokens
    /// @param qtyToRedeem  qty in base units of how many tokens to redeem
    /// @param redeemer     address of person redeeming tokens
    function redeemShortToken(
        uint256 qtyToRedeem,
        address redeemer
    ) external onlyCollateralPool
    {
        // mint and distribute short and long position tokens to our caller
        PositionToken(SHORT_POSITION_TOKEN).redeemToken(qtyToRedeem, redeemer);
    }

    /*
    // Public METHODS
    */

    /// @notice checks to see if a contract is settled, and that the settlement delay has passed
    function isPostSettlementDelay() public view returns (bool) {
        return isSettled && (now >= (settlementTimeStamp + SETTLEMENT_DELAY));
    }

    /*
    // PRIVATE METHODS
    */

    /// @dev checks our last query price to see if our contract should enter settlement due to it being past our
    //  expiration date or outside of our tradeable ranges.
    function checkSettlement() internal {
        require(!isSettled, "Contract is already settled"); // already settled.

        uint newSettlementPrice;
        if (now > EXPIRATION) {  // note: miners can cheat this by small increments of time (minutes, not hours)
            isSettled = true;                   // time based expiration has occurred.
            newSettlementPrice = lastPrice;
        } else if (lastPrice >= PRICE_CAP) {    // price is greater or equal to our cap, settle to CAP price
            isSettled = true;
            newSettlementPrice = PRICE_CAP;
        } else if (lastPrice <= PRICE_FLOOR) {  // price is lesser or equal to our floor, settle to FLOOR price
            isSettled = true;
            newSettlementPrice = PRICE_FLOOR;
        }

        if (isSettled) {
            settleContract(newSettlementPrice);
        }
    }

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

}
