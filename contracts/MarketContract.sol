/*
    Copyright 2017-2018 Phillip A. Elsasser

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

pragma solidity ^0.4.24;

import "./Creatable.sol";

/// @title MarketContract base contract implement all needed functionality for trading.
/// @notice this is the abstract base contract that all contracts should inherit from to
/// implement different oracle solutions.
/// @author Phil Elsasser <phil@marketprotocol.io>
contract MarketContract is Creatable {

    string public CONTRACT_NAME;
    address public COLLATERAL_TOKEN_ADDRESS;
    uint public PRICE_CAP;
    uint public PRICE_FLOOR;
    uint public PRICE_DECIMAL_PLACES;   // how to convert the pricing from decimal format (if valid) to integer
    uint public QTY_MULTIPLIER;         // multiplier corresponding to the value of 1 increment in price to token base units
    uint public EXPIRATION;

    // state variables
    uint public lastPrice;
    uint public settlementPrice;
    bool public isSettled = false;

    // events
    event UpdatedLastPrice(uint256 price);
    event ContractSettled(uint settlePrice);

    /// @param contractName viewable name of this contract (BTC/ETH, LTC/ETH, etc)
    /// @param baseAddresses array of 2 addresses needed for our contract including:
    ///     creatorAddress                  address of the person creating the contract
    ///     collateralTokenAddress          address of the ERC20 token that will be used for collateral and pricing
    /// @param contractSpecs array of unsigned integers including:
    ///     floorPrice          minimum tradeable price of this contract, contract enters settlement if breached
    ///     capPrice            maximum tradeable price of this contract, contract enters settlement if breached
    ///     priceDecimalPlaces  number of decimal places to convert our queried price from a floating point to
    ///                         an integer
    ///     qtyMultiplier       multiply traded qty by this value from base units of collateral token.
    ///     expirationTimeStamp seconds from epoch that this contract expires and enters settlement
    constructor(
        string contractName,
        address[2] baseAddresses,
        uint[5] contractSpecs
    ) public
    {
        PRICE_FLOOR = contractSpecs[0];
        PRICE_CAP = contractSpecs[1];
        require(PRICE_CAP > PRICE_FLOOR);

        PRICE_DECIMAL_PLACES = contractSpecs[2];
        QTY_MULTIPLIER = contractSpecs[3];
        EXPIRATION = contractSpecs[4];
        require(EXPIRATION > now);

        CONTRACT_NAME = contractName;
        COLLATERAL_TOKEN_ADDRESS = baseAddresses[1];
        creator = baseAddresses[0];
    }

    /*
    // PRIVATE METHODS
    */

    /// @dev checks our last query price to see if our contract should enter settlement due to it being past our
    //  expiration date or outside of our tradeable ranges.
    function checkSettlement() internal {
        if (isSettled)   // already settled.
            return;

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
    function settleContract(uint finalSettlementPrice) private {
        settlementPrice = finalSettlementPrice;
        emit ContractSettled(finalSettlementPrice);
    }
}
