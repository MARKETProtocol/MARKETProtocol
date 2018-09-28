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

import "./libraries/MathLib.sol";
import "./tokens/MarketToken.sol";
import "./MarketContract.sol";

import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";


/// @title MarketCollateralPool is a contract controlled by Market Contracts.  It holds collateral balances
/// as well as user balances and open positions.  It should be instantiated and then linked to a specific market
/// contract factory.
// TODO: add time lock!
/// @author Phil Elsasser <phil@marketprotocol.io>
contract MarketCollateralPool is Ownable {
    using MathLib for uint;
    using MathLib for int;
    using SafeERC20 for ERC20;

    struct UserNetPosition {
        Position[] positions;   // all open positions (lifo upon exit - allows us to not reindex array!)
        int netPosition;        // net position across all prices / executions
    }

    struct Position {
        uint price;
        int qty;
    }

    mapping(address => uint) public contractAddressToCollateralPoolBalance;                 // current balance of all collateral committed
    mapping(address => mapping(address => UserNetPosition)) contractAddressToUserPosition;
    mapping(address => mapping(address => uint)) public tokenAddressToAccountBalance;       // stores account balances allowed to be allocated to orders
    mapping(address => mapping(address => uint)) public tokenAddressToBalanceLockTime;      // stores account balances lock time

    address public MARKET_TRADING_HUB;

    event UpdatedUserBalance(address indexed collateralTokenAddress, address indexed user, uint balance);

    /// @param marketTradingHub factory address for this collateral pool
    constructor(address marketTradingHub) public {
        MARKET_TRADING_HUB = marketTradingHub;
    }

    /// @notice get the net position for a give user address
    /// @param marketContractAddress MARKET Contract address to return position for
    /// @param userAddress address to return position for
    /// @return the users current open position.
    function getUserNetPosition(address marketContractAddress, address userAddress) external view returns (int) {
        return contractAddressToUserPosition[marketContractAddress][userAddress].netPosition;
    }

    /// @notice gets the number of positions currently held by this address. Useful for iterating
    /// over the positions array in order to retrieve all users data.
    /// @param marketContractAddress MARKET Contract address
    /// @param userAddress address of user
    /// @return number of open unique positions in the array.
    function getUserPositionCount(address marketContractAddress, address userAddress) external view returns (uint) {
        return contractAddressToUserPosition[marketContractAddress][userAddress].positions.length;
    }

    /// @notice Allows for retrieval of user position struct (since solidity cannot return the struct) we return
    /// the data as a tuple of (uint, int) that represents (price, qty)
    /// @param marketContractAddress MARKET Contract address
    /// @param userAddress address of user
    /// @param index 0 based index of position in array (older positions are lower indexes)
    /// @return (price, qty) tuple
    function getUserPosition(
        address marketContractAddress,
        address userAddress,
        uint index
    ) external view returns (uint, int)
    {
        Position storage pos = contractAddressToUserPosition[marketContractAddress][userAddress].positions[index];
        return (pos.price, pos.qty);
    }

    /// @param collateralTokenAddress ERC20 token address
    /// @param userAddress address of user
    /// @return the users currently unallocated token balance
    function getUserUnallocatedBalance(
        address collateralTokenAddress,
        address userAddress
    ) external view returns (uint)
    {
        return tokenAddressToAccountBalance[collateralTokenAddress][userAddress];
    }

    /*
    // EXTERNAL METHODS
    */

    /// @notice deposits tokens to the smart contract to fund the user account and provide needed tokens for collateral
    /// pool upon trade matching.
    /// @param collateralTokenAddress ERC20 token address
    /// @param depositAmount qty of ERC20 tokens to deposit to the smart contract to cover open orders and collateral
    function depositTokensForTrading(address collateralTokenAddress, uint256 depositAmount) external {
        uint256 balanceAfterDeposit = tokenAddressToAccountBalance[collateralTokenAddress][msg.sender].add(depositAmount);
        ERC20(collateralTokenAddress).safeTransferFrom(msg.sender, this, depositAmount);
        tokenAddressToAccountBalance[collateralTokenAddress][msg.sender] = balanceAfterDeposit;
        emit UpdatedUserBalance(collateralTokenAddress, msg.sender, balanceAfterDeposit);
    }

    // @notice called by a user after settlement has occurred.  This function will finalize all accounting around any
    // outstanding positions and return all remaining collateral to the caller. This should only be called after
    // settlement has occurred.
    /// @param marketContractAddress address of the MARKET Contract being traded.
    function settleAndClose(address marketContractAddress) external {
        MarketContract marketContract = MarketContract(marketContractAddress);
        require(marketContract.isSettled(), "Contract is not settled");
        UserNetPosition storage userNetPos = contractAddressToUserPosition[marketContractAddress][msg.sender];
        if (userNetPos.netPosition != 0) {
            // this user has a position that we need to settle based upon the settlement price of the contract
            reduceUserNetPosition(
                marketContract,
                userNetPos,
                msg.sender,
                userNetPos.netPosition * - 1,
                marketContract.settlementPrice()
            );
        }
        // transfer all balances back to user.
        withdrawTokens(marketContract.COLLATERAL_TOKEN_ADDRESS(),
            tokenAddressToAccountBalance[marketContract.COLLATERAL_TOKEN_ADDRESS()][msg.sender]);
    }

    /// @dev called by our linked trading hub when a trade occurs to update both maker and takers positions.
    /// @param marketContractAddress address of the market contract being traded
    /// @param maker address of the maker in the trade
    /// @param taker address of the taker in the trade
    /// @param qty quantity transacted between parties
    /// @param price agreed price of the matched trade.
    function updatePositions(
        address marketContractAddress,
        address maker,
        address taker,
        int qty,
        uint price
    ) external onlyTradingHub
    {
        MarketContract marketContract = MarketContract(marketContractAddress);
        updatePosition(
            marketContract,
            maker,
            qty,
            price
        );
        // continue process for taker, but qty is opposite sign for taker
        updatePosition(
            marketContract,
            taker,
            qty * -1,
            price
        );
    }

    /*
    // PUBLIC METHODS
    */

    /// @notice removes token from users trading account
    /// @param collateralTokenAddress ERC20 token address
    /// @param withdrawAmount qty of token to attempt to withdraw
    function withdrawTokens(address collateralTokenAddress, uint256 withdrawAmount) public {
        uint256 balanceAfterWithdrawal =
            tokenAddressToAccountBalance[collateralTokenAddress][msg.sender].subtract(withdrawAmount);

        tokenAddressToAccountBalance[collateralTokenAddress][msg.sender] = balanceAfterWithdrawal;   // update balance before external call!
        ERC20(collateralTokenAddress).safeTransfer(msg.sender, withdrawAmount);
        emit UpdatedUserBalance(collateralTokenAddress, msg.sender, balanceAfterWithdrawal);
    }

    /*
    // PRIVATE METHODS
    */

    /// @notice moves collateral from a user's account to the pool upon trade execution.
    /// @param marketContract the MARKET Contract being traded.
    /// @param fromAddress address of user entering trade
    /// @param collateralAmount amount of collateral to transfer from user account to collateral pool
    function commitCollateralToPool(
        MarketContract marketContract,
        address fromAddress,
        uint collateralAmount
    ) private
    {

        uint newBalance =
            tokenAddressToAccountBalance[marketContract.COLLATERAL_TOKEN_ADDRESS()][fromAddress].subtract(
                collateralAmount);

        tokenAddressToAccountBalance[marketContract.COLLATERAL_TOKEN_ADDRESS()][fromAddress] = newBalance;

        contractAddressToCollateralPoolBalance[marketContract] =
            contractAddressToCollateralPoolBalance[marketContract].add(collateralAmount);

        emit UpdatedUserBalance(marketContract.COLLATERAL_TOKEN_ADDRESS(), fromAddress, newBalance);
    }

    /// @notice withdraws collateral from pool to a user account upon exit or trade settlement
    /// @param marketContract the MARKET Contract being traded.
    /// @param toAddress address of user
    /// @param collateralAmount amount to transfer from pool to user.
    function withdrawCollateralFromPool(
        MarketContract marketContract,
        address toAddress,
        uint collateralAmount
    ) private
    {
        uint newBalance =
            tokenAddressToAccountBalance[marketContract.COLLATERAL_TOKEN_ADDRESS()][toAddress].add(collateralAmount);
        tokenAddressToAccountBalance[marketContract.COLLATERAL_TOKEN_ADDRESS()][toAddress] = newBalance;
        contractAddressToCollateralPoolBalance[marketContract] =
            contractAddressToCollateralPoolBalance[marketContract].subtract(collateralAmount);

        emit UpdatedUserBalance(marketContract.COLLATERAL_TOKEN_ADDRESS(), toAddress, newBalance);
    }

    /// @dev handles all needed internal accounting when a user enters into a new trade
    /// @param marketContract the MARKET Contract being traded.
    /// @param userAddress storage struct containing position information for this user
    /// @param qty signed quantity this users position is changing by, + for buy and - for sell
    /// @param price transacted price of the new position / trade
    function updatePosition(
        MarketContract marketContract,
        address userAddress,
        int qty,
        uint price
    ) private
    {
        UserNetPosition storage userNetPosition = contractAddressToUserPosition[marketContract][userAddress];
        if (userNetPosition.netPosition == 0 || userNetPosition.netPosition.isSameSign(qty)) {
            // new position or adding to open pos
            addUserNetPosition(
                marketContract,
                userNetPosition,
                userAddress,
                qty,
                price
            );
        } else {  // opposite side from open position, reduce, flattened, or flipped.
            if (userNetPosition.netPosition.abs() >= qty.abs()) { // pos is reduced or flattened
                reduceUserNetPosition(
                    marketContract,
                    userNetPosition,
                    userAddress,
                    qty,
                    price
                );
            } else {    // pos is flipped, reduce and then create new open pos!
                reduceUserNetPosition(
                    marketContract,
                    userNetPosition,
                    userAddress,
                    userNetPosition.netPosition * -1,
                    price
                ); // flatten completely

                int newNetPos = userNetPosition.netPosition + qty;            // the portion remaining after flattening
                addUserNetPosition(
                    marketContract,
                    userNetPosition,
                    userAddress,
                    newNetPos,
                    price
                );
            }
        }
        userNetPosition.netPosition = userNetPosition.netPosition.add(qty);   // keep track of total net pos across all prices for user.
    }

    /// @dev calculates the needed collateral for a new position and commits it to the pool removing it from the
    /// users account and creates the needed Position struct to record the new position.
    /// @param marketContract The MARKET Contract being traded.
    /// @param userNetPosition current positions held by user
    /// @param userAddress address of user entering into the position
    /// @param qty signed quantity of the trade
    /// @param price agreed price of trade
    function addUserNetPosition(
        MarketContract marketContract,
        UserNetPosition storage userNetPosition,
        address userAddress,
        int qty,
        uint price
    ) private
    {
        uint neededCollateral = MathLib.calculateNeededCollateral(
            marketContract.PRICE_FLOOR(),
            marketContract.PRICE_CAP(),
            marketContract.QTY_MULTIPLIER(),
            qty,
            price
        );
        commitCollateralToPool(marketContract, userAddress, neededCollateral);
        userNetPosition.positions.push(Position(price, qty));   // append array with new position
    }

    /// @dev reduces net position correctly allocating collateral back to user
    /// @param marketContract The MARKET Contract being traded.
    /// @param userNetPos storage struct for this users position
    /// @param userAddress address of user who is reducing their pos
    /// @param qty signed quantity of the qty to reduce this users position by
    /// @param price transacted price
    function reduceUserNetPosition(
        MarketContract marketContract,
        UserNetPosition storage userNetPos,
        address userAddress,
        int qty,
        uint price
    ) private
    {
        uint collateralToReturnToUserAccount = 0;
        int qtyToReduce = qty;                      // note: this sign is opposite of our users position
        assert(userNetPos.positions.length != 0);   // sanity check
        while (qtyToReduce != 0) {   //TODO: ensure we dont run out of gas here!
            Position storage position = userNetPos.positions[userNetPos.positions.length - 1];  // get the last pos (LIFO)
            if (position.qty.abs() <= qtyToReduce.abs()) {   // this position is completely consumed!
                collateralToReturnToUserAccount = collateralToReturnToUserAccount.add(
                    MathLib.calculateNeededCollateral(
                        marketContract.PRICE_FLOOR(),
                        marketContract.PRICE_CAP(),
                        marketContract.QTY_MULTIPLIER(),
                        position.qty,
                        price
                    )
                );
                qtyToReduce = qtyToReduce.add(position.qty);
                userNetPos.positions.length--;  // remove this position from our array.
            } else {  // this position stays, just reduce the qty.
                position.qty = position.qty.add(qtyToReduce);
                // pos is opp sign of qty we are reducing here!
                collateralToReturnToUserAccount = collateralToReturnToUserAccount.add(
                    MathLib.calculateNeededCollateral(
                        marketContract.PRICE_FLOOR(),
                        marketContract.PRICE_CAP(),
                        marketContract.QTY_MULTIPLIER(),
                        qtyToReduce * -1,
                        price
                    )
                );
//                qtyToReduce = 0; // completely reduced now!
                break;
            }
        }

        if (collateralToReturnToUserAccount != 0) {  // allocate funds back to user acct.
            withdrawCollateralFromPool(marketContract, userAddress, collateralToReturnToUserAccount);
        }
    }

    modifier onlyTradingHub() {
        require(msg.sender == MARKET_TRADING_HUB,
            "Can only be called by the trading hub");
        _;
    }
}
