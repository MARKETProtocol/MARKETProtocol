/*
    Copyright 2017 Phillip A. Elsasser

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

pragma solidity 0.4.18;

import "./libraries/MathLib.sol";
import "./tokens/MarketToken.sol";
import "./Linkable.sol";
import "./MarketContract.sol";

import "zeppelin-solidity/contracts/token/SafeERC20.sol";
import "zeppelin-solidity/contracts/token/ERC20.sol";


/// @title MarketCollateralPool is a contract controlled by a specific Market Contract.  It holds collateral balances
/// as well as user balances and open positions.  It should be instantiated and then linked by a MarketContract.
/// @author Phil Elsasser <phil@marketprotcol.io>
contract MarketCollateralPool is Linkable {
    using MathLib for uint;
    using MathLib for int;
    using SafeERC20 for ERC20;

    struct UserNetPosition {
        address userAddress;
        Position[] positions;   // all open positions (lifo upon exit - allows us to not reindex array!)
        int netPosition;        // net position across all prices / executions
    }

    struct Position {
        uint price;
        int qty;
    }

    uint public collateralPoolBalance;                                 // current balance of all collateral committed
    mapping(address => UserNetPosition) addressToUserPosition;
    mapping(address => uint) public userAddressToAccountBalance;       // stores account balances allowed to be allocated to orders
    address public MKT_TOKEN_ADDRESS;
    MarketToken MKT_TOKEN;
    MarketContract MKT_CONTRACT;

    event UpdatedUserBalance(address indexed user, uint balance);
    event UpdatedPoolBalance(uint balance);

    function MarketCollateralPool(address marketContractAddress) Linkable(marketContractAddress) public {
        MKT_CONTRACT = MarketContract(marketContractAddress);
        MKT_TOKEN_ADDRESS = MKT_CONTRACT.MKT_TOKEN_ADDRESS();
        MKT_TOKEN = MarketToken(MKT_TOKEN_ADDRESS);
    }

    /// @notice get the net position for a give user address
    /// @param userAddress address to return position for
    /// @return the users current open position.
    function getUserPosition(address userAddress) external view returns (int) {
        return addressToUserPosition[userAddress].netPosition;
    }

    /// @param userAddress address of user
    /// @return the users currently unallocated token balance
    function getUserAccountBalance(address userAddress) external view returns (uint) {
        return userAddressToAccountBalance[userAddress];
    }

    /*
    // EXTERNAL METHODS
    */

    /// @notice deposits tokens to the smart contract to fund the user account and provide needed tokens for collateral
    /// pool upon trade matching.
    /// @param depositAmount qty of ERC20 tokens to deposit to the smart contract to cover open orders and collateral
    function depositTokensForTrading(uint256 depositAmount) external {
        // user must call approve!
        require(MKT_TOKEN.isUserEnabledForContract(address(MKT_CONTRACT), msg.sender));
        uint256 balanceAfterDeposit = userAddressToAccountBalance[msg.sender].add(depositAmount);
        ERC20(MKT_CONTRACT.BASE_TOKEN_ADDRESS()).safeTransferFrom(msg.sender, this, depositAmount);
        userAddressToAccountBalance[msg.sender] = balanceAfterDeposit;
        UpdatedUserBalance(msg.sender, balanceAfterDeposit);
    }

    // @notice called by a user after settlement has occurred.  This function will finalize all accounting around any
    // outstanding positions and return all remaining collateral to the caller. This should only be called after
    // settlement has occurred.
    function settleAndClose() external {
        require(MKT_CONTRACT.isSettled());
        require(MKT_TOKEN.isUserEnabledForContract(address(MKT_CONTRACT), msg.sender));
        UserNetPosition storage userNetPos = addressToUserPosition[msg.sender];
        if (userNetPos.netPosition != 0) {
            // this user has a position that we need to settle based upon the settlement price of the contract
            reduceUserNetPosition(
                userNetPos,
                msg.sender,
                userNetPos.netPosition * - 1,
                MKT_CONTRACT.settlementPrice()
            );
        }
        // transfer all balances back to user.
        withdrawTokens(userAddressToAccountBalance[msg.sender]);
    }

    /// @param maker address of the maker in the trade
    /// @param taker address of the taker in the trade
    /// @param qty quantity transacted between parties
    /// @param price agreed price of the matched trade.
    function updatePositions(
        address maker,
        address taker,
        int qty,
        uint price
    ) external onlyLinked
    {
        updatePosition(
            maker,
            qty,
            price
        );
        // continue process for taker, but qty is opposite sign for taker
        updatePosition(
            taker,
            qty * -1,
            price
        );
    }

    /*
    // PUBLIC METHODS
    */

    /// @notice removes token from users trading account
    /// @param withdrawAmount qty of token to attempt to withdraw
    function withdrawTokens(uint256 withdrawAmount) public {
        require(userAddressToAccountBalance[msg.sender] >= withdrawAmount);   // ensure sufficient balance
        uint256 balanceAfterWithdrawal = userAddressToAccountBalance[msg.sender].subtract(withdrawAmount);
        userAddressToAccountBalance[msg.sender] = balanceAfterWithdrawal;   // update balance before external call!
        ERC20(MKT_CONTRACT.BASE_TOKEN_ADDRESS()).safeTransfer(msg.sender, withdrawAmount);
        UpdatedUserBalance(msg.sender, balanceAfterWithdrawal);
    }

    /*
    // PRIVATE METHODS
    */

    /// @notice moves collateral from a user's account to the pool upon trade execution.
    /// @param fromAddress address of user entering trade
    /// @param collateralAmount amount of collateral to transfer from user account to collateral pool
    function commitCollateralToPool(
        address fromAddress,
        uint collateralAmount
    ) private
    {
        require(MKT_TOKEN.isUserEnabledForContract(address(MKT_CONTRACT), msg.sender));
        require(userAddressToAccountBalance[fromAddress] >= collateralAmount);   // ensure sufficient balance
        uint newBalance = userAddressToAccountBalance[fromAddress].subtract(collateralAmount);
        userAddressToAccountBalance[fromAddress] = newBalance;
        collateralPoolBalance = collateralPoolBalance.add(collateralAmount);
        UpdatedUserBalance(fromAddress, newBalance);
        UpdatedPoolBalance(collateralPoolBalance);
    }

    /// @notice withdraws collateral from pool to a user account upon exit or trade settlement
    /// @param toAddress address of user
    /// @param collateralAmount amount to transfer from pool to user.
    function withdrawCollateralFromPool(
        address toAddress,
        uint collateralAmount
    ) private
    {
        require(MKT_TOKEN.isUserEnabledForContract(address(MKT_CONTRACT), msg.sender));
        require(collateralPoolBalance >= collateralAmount); // ensure sufficient balance
        uint newBalance = userAddressToAccountBalance[toAddress].add(collateralAmount);
        userAddressToAccountBalance[toAddress] = newBalance;
        collateralPoolBalance = collateralPoolBalance.subtract(collateralAmount);
        UpdatedUserBalance(toAddress, newBalance);
        UpdatedPoolBalance(collateralPoolBalance);
    }

    /// @dev handles all needed internal accounting when a user enters into a new trade
    /// @param userAddress storage struct containing position information for this user
    /// @param qty signed quantity this users position is changing by, + for buy and - for sell
    /// @param price transacted price of the new position / trade
    function updatePosition(
        address userAddress,
        int qty,
        uint price
    ) private
    {
        UserNetPosition storage userNetPosition = addressToUserPosition[userAddress];
        if (userNetPosition.netPosition == 0 || userNetPosition.netPosition.isSameSign(qty)) {
            // new position or adding to open pos
            addUserNetPosition(
                userNetPosition,
                userAddress,
                qty,
                price
            );
        } else {  // opposite side from open position, reduce, flattened, or flipped.
            if (userNetPosition.netPosition >= qty * -1) { // pos is reduced or flattened
                reduceUserNetPosition(
                    userNetPosition,
                    userAddress,
                    qty,
                    price
                );
            } else {    // pos is flipped, reduce and then create new open pos!

                reduceUserNetPosition(
                    userNetPosition,
                    userAddress,
                    userNetPosition.netPosition * -1,
                    price
                ); // flatten completely

                int newNetPos = userNetPosition.netPosition + qty;            // the portion remaining after flattening
                addUserNetPosition(
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
    /// @param userNetPosition current positions held by user
    /// @param userAddress address of user entering into the position
    /// @param qty signed quantity of the trade
    /// @param price agreed price of trade
    function addUserNetPosition(
        UserNetPosition storage userNetPosition,
        address userAddress,
        int qty,
        uint price
    ) private
    {
        uint neededCollateral = MathLib.calculateNeededCollateral(
            MKT_CONTRACT.PRICE_FLOOR(),
            MKT_CONTRACT.PRICE_CAP(),
            MKT_CONTRACT.QTY_DECIMAL_PLACES(),
            qty,
            price
        );
        commitCollateralToPool(userAddress, neededCollateral);
        userNetPosition.positions.push(Position(price, qty));   // append array with new position
    }

    /// @dev reduces net position correctly allocating collateral back to user
    /// @param userNetPos storage struct for this users position
    /// @param userAddress address of user who is reducing their pos
    /// @param qty signed quantity of the qty to reduce this users position by
    /// @param price transacted price
    function reduceUserNetPosition(
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
                        MKT_CONTRACT.PRICE_FLOOR(),
                        MKT_CONTRACT.PRICE_CAP(),
                        MKT_CONTRACT.QTY_DECIMAL_PLACES(),
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
                        MKT_CONTRACT.PRICE_FLOOR(),
                        MKT_CONTRACT.PRICE_CAP(),
                        MKT_CONTRACT.QTY_DECIMAL_PLACES(),
                        qtyToReduce * -1,
                        price
                    )
                );
                //qtyToReduce = 0; // completely reduced now!
                break;
            }
        }

        if (collateralToReturnToUserAccount != 0) {  // allocate funds back to user acct.
            withdrawCollateralFromPool(userAddress, collateralToReturnToUserAccount);
        }
    }
}
