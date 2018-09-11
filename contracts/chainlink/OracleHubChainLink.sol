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
import "../MarketContract.sol";

contract OracleHubChainLink is OracleHub, Chainlinked {
    using StringLib for *;

    struct ChainLinkQuery {
        address marketContractAddress;
        string oracleQueryURL;
        string oracleQueryPath;
        string[] oracleQueryRunPath; // cheaper to store or just re-create if needed for on-demand queries?
    }

    mapping(address => ChainLinkQuery) contractAddressToChainLinkQuery;
    mapping(bytes32 => ChainLinkQuery) requestIDToChainLinkQuery;
    address public marketContractFactoryAddress;

    constructor(address contractFactoryAddress, address linkTokenAddress, address oracleAddress) public {
        marketContractFactoryAddress = contractFactoryAddress;
        setLinkToken(linkTokenAddress);
        setOracle(oracleAddress);
    }

    function withdrawLink(address sendTo, uint256 amount) onlyOwner returns (bool) {
        return link.transfer(sendTo, amount);
    }


    function callback(bytes32 requestId, uint256 price) public checkChainlinkFulfillment(requestId) {
        // NOTE: event is emitted by chainlink upon call above to checkChainlinkFulfillment
        ChainLinkQuery memory chainLinkQuery = requestIDToChainLinkQuery[requestId];
        require(chainLinkQuery.marketContractAddress != address(0), "market contract address can not be null!");
        //MarketContract(chainLinkQuery.marketContractAddress)
    }

    function createRunAndRequest(bytes32 jobId, ChainLinkQuery memory chainLinkQuery) internal returns (bytes32) {
        ChainlinkLib.Run memory run = newRun(jobId, this, "callback(bytes32,uint256)");
        run.add("url", chainLinkQuery.oracleQueryURL);
        run.addStringArray("path", chainLinkQuery.oracleQueryRunPath);
        run.addUint("times", MarketContract(chainLinkQuery.marketContractAddress).PRICE_DECIMAL_PLACES());
        bytes32 requestID = chainlinkRequest(run, LINK(1));
        // TODO: figure out handling of JOB_ID and REQUEST_ID
        // TODO: add sleep adapter

        return requestID;
    }

    function requestQuery(string oracleQueryURL, string oracleQueryPath) external onlyFactory {
        ChainLinkQuery storage chainLinkQuery = contractAddressToChainLinkQuery[msg.sender];
        chainLinkQuery.marketContractAddress = msg.sender;
        chainLinkQuery.oracleQueryURL = oracleQueryURL;
        chainLinkQuery.oracleQueryPath = oracleQueryPath;

        // NOTE: currently this cannot be separated into its own function due to constraints around
        // return types and the current version of solidity.
        StringLib.slice memory pathSlice = oracleQueryPath.toSlice();
        StringLib.slice memory delim = ".".toSlice();
        chainLinkQuery.oracleQueryRunPath = new string[](pathSlice.count(delim) + 1);
        for(uint i = 0; i < chainLinkQuery.oracleQueryRunPath.length; i++) {
            chainLinkQuery.oracleQueryRunPath[i] = pathSlice.split(delim).toString();
        }
        bytes32 jobId;
        createRunAndRequest(jobId, chainLinkQuery);
    }

    function requestOnDemandQuery(address marketContractAddress) external {
        // TODO: enforce ETH payment to cover LINK, refund if settled?
        ChainLinkQuery memory chainLinkQuery = contractAddressToChainLinkQuery[msg.sender];
        bytes32 jobId;
        createRunAndRequest(jobId, chainLinkQuery);
        // if we refund for pushing to settlement we will need to record the caller of this function
        // since it will be asynchronous with the callback
    }

    function setFactoryAddress(address contractFactoryAddress) external onlyOwner {
        marketContractFactoryAddress = contractFactoryAddress;
    }

    modifier onlyFactory() {
        require(msg.sender == marketContractFactoryAddress);
        _;
    }
}
