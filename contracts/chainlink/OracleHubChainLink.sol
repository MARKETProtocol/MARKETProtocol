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

import "../OracleHub.sol";
import "./src/Chainlinked.sol";
import "../libraries/StringLib.sol";
import "./MarketContractChainLink.sol";

contract OracleHubChainLink is OracleHub, Chainlinked {
    using StringLib for *;

    /// @dev all needed pieces of a chainlink query.
    struct ChainLinkQuery {
        address marketContractAddress;
        string oracleQueryURL;
        string oracleQueryPath;
        string[] oracleQueryRunPath; // cheaper to store or just re-create if needed for on-demand queries?
    }

    mapping(address => ChainLinkQuery) contractAddressToChainLinkQuery;
    mapping(bytes32 => ChainLinkQuery) requestIDToChainLinkQuery;
    address public marketContractFactoryAddress;


    /// @dev creates our OracleHub with needed address for ChainLink
    /// @param contractFactoryAddress       address of our MaretkContractFactory
    /// @param linkTokenAddress             address of the LINK token
    /// @param oracleAddress                address of the ChainLink Oracle
    constructor(address contractFactoryAddress, address linkTokenAddress, address oracleAddress) public {
        marketContractFactoryAddress = contractFactoryAddress;
        setLinkToken(linkTokenAddress);
        setOracle(oracleAddress);
    }

    /*
    // EXTERNAL METHODS
    */

    /// @dev allows us to withdraw link as the owner of this contract
    /// @param sendTo       address of where to send LINK
    /// @param amount       amount of link (in baseUnits)
    function withdrawLink(address sendTo, uint256 amount) external onlyOwner returns (bool) {
        return link.transfer(sendTo, amount);
    }

    /// @notice called by a user requesting an on demand query when they believe that a contract is pushed into
    /// an expired state.
    /// @param marketContractAddress - address of the MarketContract
    function requestOnDemandQuery(address marketContractAddress) external {
        // TODO: enforce ETH payment to cover LINK, refund if settled?
        ChainLinkQuery memory chainLinkQuery = contractAddressToChainLinkQuery[msg.sender];
        bytes32 jobId;
        createRunAndRequest(jobId, chainLinkQuery);
        // if we refund for pushing to settlement we will need to record the caller of this function
        // since it will be asynchronous with the callback
    }

    /// @dev allows for the owner to set a factory address that is then allowed the priviledge of creating
    /// queries.
    function setFactoryAddress(address contractFactoryAddress) external onlyOwner {
        marketContractFactoryAddress = contractFactoryAddress;
    }


    /// @dev called by our factory to create the needed initial query for a new MarketContract
    /// @param marketContractAddress - address of the newly created MarketContract
    /// @param oracleQueryURL   URL of rest end point for data IE 'https://api.kraken.com/0/public/Ticker?pair=ETHUSD'
    /// @param oracleQueryPath  path of data inside json object. IE 'result.XETHZUSD.c.0'
    function requestQuery(
        address marketContractAddress,
        string oracleQueryURL,
        string oracleQueryPath
    ) external onlyFactory {
        ChainLinkQuery storage chainLinkQuery = contractAddressToChainLinkQuery[marketContractAddress];
        chainLinkQuery.marketContractAddress = marketContractAddress;
        chainLinkQuery.oracleQueryURL = oracleQueryURL;
        chainLinkQuery.oracleQueryPath = oracleQueryPath;

        // NOTE: currently this cannot be separated into its own function due to constraints around
        // return types and the current version of solidity... is this true for internal / private fxs?
        StringLib.slice memory pathSlice = oracleQueryPath.toSlice();
        StringLib.slice memory delim = ".".toSlice();
        chainLinkQuery.oracleQueryRunPath = new string[](pathSlice.count(delim) + 1);
        for(uint i = 0; i < chainLinkQuery.oracleQueryRunPath.length; i++) {
            chainLinkQuery.oracleQueryRunPath[i] = pathSlice.split(delim).toString();
        }
        bytes32 jobId; // TODO: how do we want to generate these?
        createRunAndRequest(jobId, chainLinkQuery);
    }

    /// @dev designated callback function to ChainLinks oracles.
    /// @param requestId id of the request being handed back
    /// @param price     value being handed back from oracle.
    function callback(bytes32 requestId, uint256 price) external checkChainlinkFulfillment(requestId) {
        // NOTE: event is emitted by chainlink upon call above to checkChainlinkFulfillment
        ChainLinkQuery memory chainLinkQuery = requestIDToChainLinkQuery[requestId];
        require(chainLinkQuery.marketContractAddress != address(0), "market contract address can not be null!");
        MarketContractChainLink(chainLinkQuery.marketContractAddress).oracleCallBack(price);
    }

    /*
    // PRIVATE METHODS
    */

    /// @dev Creates the needed Run object and initiates the request to ChainLink.
    function createRunAndRequest(bytes32 jobId, ChainLinkQuery memory chainLinkQuery) private returns (bytes32) {
        ChainlinkLib.Run memory run = newRun(jobId, this, "callback(bytes32,uint256)");
        run.add("url", chainLinkQuery.oracleQueryURL);
        run.addStringArray("path", chainLinkQuery.oracleQueryRunPath);
        run.addUint("times", MarketContract(chainLinkQuery.marketContractAddress).PRICE_DECIMAL_PLACES());
        bytes32 requestID = chainlinkRequest(run, LINK(1));
        // TODO: figure out handling of JOB_ID and REQUEST_ID
        // TODO: add sleep adapter
        return requestID;
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
