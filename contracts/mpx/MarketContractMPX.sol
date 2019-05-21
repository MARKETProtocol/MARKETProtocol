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

import "../MarketContract.sol";


/// @title MarketContractMPX - a MarketContract designed to be used with our internal oracle service
/// @author Phil Elsasser <phil@marketprotocol.io>
contract MarketContractMPX is MarketContract {

    address public ORACLE_HUB_ADDRESS;
    string public ORACLE_URL;
    string public ORACLE_STATISTIC;

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
    constructor(
        bytes32[3] memory contractNames,
        address[3] memory baseAddresses,
        address oracleHubAddress,
        uint[7] memory contractSpecs,
        string memory oracleURL,
        string memory oracleStatistic
    ) MarketContract(
        contractNames,
        baseAddresses,
        contractSpecs
    )  public
    {
        ORACLE_URL = oracleURL;
        ORACLE_STATISTIC = oracleStatistic;
        ORACLE_HUB_ADDRESS = oracleHubAddress;
    }

    /*
    // PUBLIC METHODS
    */

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