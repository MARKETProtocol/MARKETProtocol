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

import "./MarketContractOraclize.sol";
import "./oraclizeAPI.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

contract OracleHubOraclize is usingOraclize, Ownable {

    mapping(address => OraclizeQuery) contractAddressToOraclizeQuery;
    mapping(bytes32 => OraclizeQuery) queryIDToOraclizeQuery;
    address public marketContractFactoryAddress;
    mapping(bytes32 => bool) public validQueryIDs;
    uint constant public QUERY_CALLBACK_GAS = 160000;

    /// @dev all needed pieces of an oraclize query.
    struct OraclizeQuery {
        address marketContractAddress;
        string dataSource;
        string query;
    }

    event OraclizeQueryRequested(address indexed marketContract, bytes32 indexed queryId);

    /// @dev creates our OracleHub
    /// @param contractFactoryAddress       address of our MarketContractFactory
    constructor(address contractFactoryAddress) public payable {
        oraclize_setProof(proofType_TLSNotary | proofStorage_IPFS);
        marketContractFactoryAddress = contractFactoryAddress;
    }

    /*
    // EXTERNAL METHODS
    */

    /// @dev allows us to withdraw eth as the owner of this contract
    /// @param sendTo       address of where to send ETH
    /// @param amount       amount of ETH (in baseUnits)
    function withdrawEther(address sendTo, uint256 amount) external onlyOwner returns (bool) {
        return sendTo.send(amount);
    }

    /// @notice allows a user to request an extra query to oracle in order to push the contract into
    /// settlement.  A user may call this as many times as they like, since they are the ones paying for
    /// the call to our oracle and post processing. This is useful for both a failsafe and as a way to
    /// settle a contract early if a price cap or floor has been breached.
    function requestOnDemandQuery(address marketContractAddress) external payable {
        OraclizeQuery storage oraclizeQuery = contractAddressToOraclizeQuery[marketContractAddress];
        uint cost = oraclize_getPrice(oraclizeQuery.dataSource, QUERY_CALLBACK_GAS);
        require(msg.value >= cost); // user must pay enough to cover query and callback

        bytes32 queryId = oraclize_query(
            oraclizeQuery.dataSource,
            oraclizeQuery.query,
            QUERY_CALLBACK_GAS
        );

        require(queryId != 0);
        validQueryIDs[queryId] = true;
        queryIDToOraclizeQuery[queryId] = oraclizeQuery;
        emit OraclizeQueryRequested(marketContractAddress, queryId);
    }


    /// @dev allows for the owner to set a factory address that is then allowed the priviledge of creating
    /// queries.
    function setFactoryAddress(address contractFactoryAddress) external onlyOwner {
        marketContractFactoryAddress = contractFactoryAddress;
    }

    /// @dev called by our factory to create the needed initial query for a new MarketContract
    /// @param marketContractAddress - address of the newly created MarketContract
    /// @param oracleDataSource a data-source such as "URL", "WolframAlpha", "IPFS"
    /// see http://docs.oraclize.it/#ethereum-quick-start-simple-query
    /// @param oracleQuery see http://docs.oraclize.it/#ethereum-quick-start-simple-query for examples
    function requestQuery(
        address marketContractAddress,
        string oracleDataSource,
        string oracleQuery,
        uint expiration
    ) external onlyFactory
    {
        OraclizeQuery storage oraclizeQuery = contractAddressToOraclizeQuery[marketContractAddress];
        oraclizeQuery.marketContractAddress = marketContractAddress;
        oraclizeQuery.dataSource = oracleDataSource;
        oraclizeQuery.query = oracleQuery;

        bytes32 queryId = oraclize_query(
            expiration,
            oracleDataSource,
            oracleQuery,
            QUERY_CALLBACK_GAS
        );

        require(queryId != 0);
        validQueryIDs[queryId] = true;
        queryIDToOraclizeQuery[queryId] = oraclizeQuery;  // save query struct for later recall on callback.
        emit OraclizeQueryRequested(marketContractAddress, queryId);
    }

    /// @notice only public for callbacks from oraclize, do not call
    /// @param queryID of the returning query, this should match our own internal mapping
    /// @param result query to be processed
    /// @param proof result proof
    function __callback(bytes32 queryID, string result, bytes proof) public {
        require(msg.sender == oraclize_cbAddress());
        require(validQueryIDs[queryID]);  // At expiration or early settlement.

        OraclizeQuery memory oraclizeQuery = queryIDToOraclizeQuery[queryID];
        MarketContractOraclize marketContract = MarketContractOraclize(oraclizeQuery.marketContractAddress);
        uint price = parseInt(result, marketContract.PRICE_DECIMAL_PLACES());
        marketContract.oracleCallBack(price);

        delete validQueryIDs[queryID];
        proof;  // silence compiler warnings
    }

    /*
    // MODIFIERS
    */

    /// @dev only callable by the designated factory!
    modifier onlyFactory() {
        require(msg.sender == marketContractFactoryAddress);
        _;
    }
}
