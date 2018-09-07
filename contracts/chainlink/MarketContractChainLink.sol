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
import "../libraries/StringLib.sol";
import "./src/ChainlinkLib.sol";
import "./src/Chainlinked.sol";

/// @title MarketContract first example of a MarketProtocol contract using ChainLink
/// @author Phil Elsasser <phil@marketprotocol.io>
contract MarketContractChainLink is MarketContract, Chainlinked {
    using StringLib for *;

    string public ORACLE_QUERY_URL;
    string public ORACLE_QUERY_PATH;
    string[] public ORACLE_QUERY_RUN_PATH;

    bytes32 internal REQUEST_ID;
    bytes32 internal JOB_ID;

    constructor(
        string contractName,
        address creatorAddress,
        address marketTokenAddress,
        address collateralTokenAddress,
        address collateralPoolFactoryAddress,
        address linkTokenAddress,
        address oracleAddress,
        bytes32 jobId,
        uint[5] contractSpecs,
        string oracleQueryURL,
        string oracleQueryPath
    ) MarketContract(
        contractName,
        creatorAddress,
        marketTokenAddress,
        collateralTokenAddress,
        collateralPoolFactoryAddress,
        contractSpecs
    )  public
    {
        ORACLE_QUERY_URL = oracleQueryURL;
        ORACLE_QUERY_PATH = oracleQueryPath;

        StringLib.slice memory pathSlice = oracleQueryPath.toSlice();
        StringLib.slice memory delim = ".".toSlice();
        ORACLE_QUERY_RUN_PATH = new string[](pathSlice.count(delim) + 1);
        for(uint i = 0; i < ORACLE_QUERY_RUN_PATH.length; i++) {
            ORACLE_QUERY_RUN_PATH[i] = pathSlice.split(delim).toString();
        }

        setLinkToken(linkTokenAddress);
        setOracle(oracleAddress);
        JOB_ID = jobId;
        queryOracle();
    }


    function callback(bytes32 requestId, uint256 price) public checkChainlinkFulfillment(requestId)
    {
        lastPrice = price;
        emit UpdatedLastPrice(price);
        checkSettlement();  // Verify settlement at expiration or requested early settlement.
    }

    function queryOracle() public onlyCreator {
        ChainlinkLib.Run memory run = newRun(JOB_ID, this, "callback(bytes32,uint256)");
        run.add("url", ORACLE_QUERY_URL);
        run.addStringArray("path", ORACLE_QUERY_RUN_PATH);
        run.addInt("times", PRICE_DECIMAL_PLACES);
        REQUEST_ID = chainlinkRequest(run, LINK(1));
    }

    /*
    TODO:
    1. figure out LINK abstraction with factory
    2. add testing
    3. Modify constructor for arrays for addresses
    4. understand how to create on demand calls, jobid, request ids, sleep
    */
}