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

import "../MarketContract.sol";

/// @title MarketContract first example of a MarketProtocol contract using ChainLink
/// @author Phil Elsasser <phil@marketprotocol.io>
contract MarketContractChainLink is MarketContract {

    string public ORACLE_QUERY_URL;
    string public ORACLE_QUERY_PATH;
    address public ORACLE_HUB_ADDRESS;

    constructor(
        string contractName,
        address[4] baseAddresses,
        address oracleHubAddress,
        uint[5] contractSpecs,
        string oracleQueryURL,
        string oracleQueryPath
    ) MarketContract(
        contractName,
        baseAddresses,
        contractSpecs
    )  public
    {
        ORACLE_QUERY_URL = oracleQueryURL;
        ORACLE_QUERY_PATH = oracleQueryPath;
        ORACLE_HUB_ADDRESS = oracleHubAddress;
    }

    function oracleCallBack(uint256 price) public onlyOracleHub {
        require(!isSettled);
        lastPrice = price;
        emit UpdatedLastPrice(price);
        checkSettlement();  // Verify settlement at expiration or requested early settlement.
    }

    modifier onlyOracleHub() {
        require(msg.sender == ORACLE_HUB_ADDRESS);
        _;
    }
}