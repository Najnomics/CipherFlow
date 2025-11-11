// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SettlementEscrow
/// @notice Holds trader funds and intent collateral until the IntentHub instructs settlement or refunds.
/// @dev The IntentHub is granted the `INTENT_HUB_ROLE` and becomes the only contract that can move balances.
contract SettlementEscrow is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant INTENT_HUB_ROLE = keccak256("INTENT_HUB_ROLE");

    mapping(uint256 => uint256) private nativeBalances;
    mapping(uint256 => mapping(address => uint256)) private tokenBalances;

    event NativeDeposited(uint256 indexed intentId, uint256 amount);
    event NativeReleased(uint256 indexed intentId, address indexed to, uint256 amount);
    event TokenDeposited(uint256 indexed intentId, address indexed token, address indexed from, uint256 amount);
    event TokenReleased(uint256 indexed intentId, address indexed token, address indexed to, uint256 amount);
    event TokenDepositedWithPermit(
        uint256 indexed intentId, address indexed token, address indexed from, uint256 amount, uint256 deadline
    );

    error NotAuthorised();
    error InsufficientBalance();

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Assigns the IntentHub address allowed to manage escrowed funds.
    function grantIntentHubRole(address hub) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(INTENT_HUB_ROLE, hub);
    }

    /// @notice Removes an IntentHub address from the authorised set.
    function revokeIntentHubRole(address hub) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(INTENT_HUB_ROLE, hub);
    }

    /// @notice Deposit native (ETH) liquidity for a specific intent.
    /// @dev Only callable by an address with the `INTENT_HUB_ROLE`.
    function depositNative(uint256 intentId) external payable onlyIntentHub nonReentrant {
        nativeBalances[intentId] += msg.value;
        emit NativeDeposited(intentId, msg.value);
    }

    /// @notice Pull ERC20 liquidity from a trader into escrow for an intent.
    /// @dev The `from` address must have approved the escrow contract beforehand.
    function depositToken(uint256 intentId, address token, address from, uint256 amount)
        external
        onlyIntentHub
        nonReentrant
    {
        tokenBalances[intentId][token] += amount;
        IERC20(token).safeTransferFrom(from, address(this), amount);
        emit TokenDeposited(intentId, token, from, amount);
    }

    /// @notice Pull ERC20 liquidity using an EIP-2612 permit signature.
    function depositTokenWithPermit(
        uint256 intentId,
        address token,
        address from,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external onlyIntentHub nonReentrant {
        IERC20Permit(token).permit(from, address(this), amount, deadline, v, r, s);
        tokenBalances[intentId][token] += amount;
        IERC20(token).safeTransferFrom(from, address(this), amount);
        emit TokenDepositedWithPermit(intentId, token, from, amount, deadline);
    }

    /// @notice Release native liquidity towards a recipient when an intent closes or settles.
    function releaseNative(uint256 intentId, address payable to, uint256 amount)
        external
        onlyIntentHub
        nonReentrant
    {
        uint256 balance = nativeBalances[intentId];
        if (balance < amount) revert InsufficientBalance();
        nativeBalances[intentId] = balance - amount;

        (bool success,) = to.call{value: amount}("");
        require(success, "Native transfer failed");

        emit NativeReleased(intentId, to, amount);
    }

    /// @notice Release ERC20 liquidity towards a recipient when an intent closes or settles.
    function releaseToken(uint256 intentId, address token, address to, uint256 amount)
        external
        onlyIntentHub
        nonReentrant
    {
        uint256 balance = tokenBalances[intentId][token];
        if (balance < amount) revert InsufficientBalance();
        tokenBalances[intentId][token] = balance - amount;

        IERC20(token).safeTransfer(to, amount);
        emit TokenReleased(intentId, token, to, amount);
    }

    /// @notice View helper for native balances.
    function getNativeBalance(uint256 intentId) external view returns (uint256) {
        return nativeBalances[intentId];
    }

    /// @notice View helper for ERC20 balances.
    function getTokenBalance(uint256 intentId, address token) external view returns (uint256) {
        return tokenBalances[intentId][token];
    }

    modifier onlyIntentHub() {
        _checkIntentHub();
        _;
    }

    function _checkIntentHub() internal view {
        if (!hasRole(INTENT_HUB_ROLE, msg.sender)) revert NotAuthorised();
    }
}

