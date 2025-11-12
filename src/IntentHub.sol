// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {TypesLib} from "blocklock-solidity/src/libraries/TypesLib.sol";

import {BlockLockAdapter} from "./adapters/BlockLockAdapter.sol";
import {IntentTypes} from "./libraries/IntentTypes.sol";
import {SettlementEscrow} from "./SettlementEscrow.sol";

/// @title IntentHub
/// @notice Manages intent lifecycle, solver commitments, BlockLock reveals, and settlement wiring.
contract IntentHub is BlockLockAdapter, AccessControl, ReentrancyGuard {
    using IntentTypes for IntentTypes.Intent;
    using IntentTypes for IntentTypes.Commitment;
    using SafeCast for uint256;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    enum FundingMode {
        Subscription
    }

    struct IntentConfig {
        address settlementAsset;
        address recipient;
        uint256 amountIn;
        uint256 minAmountOut;
        uint64 commitDeadline;
        uint64 revealDeadline;
        uint64 executionDeadline;
        bytes extraData;
    }

    struct CommitmentRecord {
        uint256 intentId;
        IntentTypes.Commitment commitment;
        IntentTypes.Reveal reveal;
        IntentTypes.ExecutionReceipt execution;
        TypesLib.Ciphertext ciphertext;
        bytes condition;
        uint32 callbackGasLimit;
    }

    SettlementEscrow public immutable SETTLEMENT_ESCROW;
    address public treasury;

    uint96 public minimumCollateral;
    uint32 public defaultCallbackGasLimit;

    uint256 public nextIntentId;
    uint256 public nextCommitmentId;

    mapping(uint256 => IntentTypes.Intent) private intents;
    mapping(uint256 => CommitmentRecord) private commitments;
    mapping(uint256 => uint256[]) private intentCommitments;
    mapping(uint256 => uint256) private blocklockRequestToCommitment;
    mapping(uint256 => uint256) private collateralNative;

    event IntentCreated(
        uint256 indexed intentId,
        address indexed trader,
        address settlementAsset,
        uint256 amountIn,
        uint64 commitDeadline,
        uint64 revealDeadline,
        uint64 executionDeadline
    );
    event IntentCancelled(uint256 indexed intentId);
    event CommitmentSubmitted(
        uint256 indexed intentId,
        uint256 indexed commitmentId,
        address indexed solver,
        uint256 collateral,
        uint256 blocklockRequestId
    );
    event CommitmentRevealed(uint256 indexed intentId, uint256 indexed commitmentId);
    event ExecutionRecorded(
        uint256 indexed intentId,
        uint256 indexed commitmentId,
        uint256 amountOut,
        uint256 solverPayout,
        bytes32 settlementTxHash,
        bool success
    );
    event CollateralWithdrawn(uint256 indexed commitmentId, address indexed solver, uint256 amount);
    event TreasuryUpdated(address indexed newTreasury);
    event CollateralSlashed(uint256 indexed commitmentId, address indexed beneficiary, uint256 amount);
    event NativeIntentSettled(uint256 indexed intentId, uint256 solverReward, uint256 traderPayout);
    event ERC20IntentSettled(uint256 indexed intentId, address indexed token, uint256 solverReward, uint256 traderPayout);
    event SubscriptionInitialized(uint256 indexed subscriptionId, uint256 amountFunded);
    event SubscriptionToppedUp(uint256 indexed subscriptionId, uint256 amount);

    error IntentNotOpen(uint256 intentId);
    error DeadlineConfigurationInvalid();
    error CommitWindowClosed(uint256 intentId);
    error RevealWindowClosed(uint256 intentId);
    error ExecutionWindowClosed(uint256 intentId);
    error MinimumCollateralNotMet(uint96 provided, uint96 required);
    error UnknownIntent(uint256 intentId);
    error UnknownCommitment(uint256 commitmentId);
    error CommitmentStateInvalid(uint256 commitmentId, IntentTypes.CommitmentState expected);
    error SolverOnly(uint256 commitmentId, address solver, address caller);
    error PayloadHashMismatch(uint256 commitmentId);
    error CollateralLocked(uint256 commitmentId);
    error SubscriptionNotInitialized();
    error SubscriptionAlreadyInitialized();

    constructor(address admin, address blocklockSender, SettlementEscrow escrow) BlockLockAdapter(blocklockSender) {
        SETTLEMENT_ESCROW = escrow;
        minimumCollateral = 0.1 ether;
        defaultCallbackGasLimit = 300_000;
        treasury = admin;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    // -----------
    // Admin ops
    // -----------

    function setMinimumCollateral(uint96 newMin) external onlyRole(ADMIN_ROLE) {
        minimumCollateral = newMin;
    }

    function setDefaultCallbackGasLimit(uint32 newLimit) external onlyRole(ADMIN_ROLE) {
        defaultCallbackGasLimit = newLimit;
    }

    function setTreasury(address newTreasury) external onlyRole(ADMIN_ROLE) {
        require(newTreasury != address(0), "treasury zero");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function initializeBlocklockSubscription() external payable onlyRole(ADMIN_ROLE) {
        if (subscriptionId != 0) revert SubscriptionAlreadyInitialized();

        uint256 subId = _subscribe();
        subscriptionId = subId;

        if (msg.value > 0) {
            blocklock.fundSubscriptionWithNative{value: msg.value}(subId);
        }

        emit SubscriptionInitialized(subId, msg.value);
    }

    function topUpBlocklockSubscription() external payable onlyRole(ADMIN_ROLE) {
        if (subscriptionId == 0) revert SubscriptionNotInitialized();
        require(msg.value > 0, "no value");

        blocklock.fundSubscriptionWithNative{value: msg.value}(subscriptionId);
        emit SubscriptionToppedUp(subscriptionId, msg.value);
    }

    // ----------------
    // Intent lifecycle
    // ----------------

    function createIntent(IntentConfig calldata cfg) external payable nonReentrant returns (uint256 intentId) {
        _validateDeadlines(cfg.commitDeadline, cfg.revealDeadline, cfg.executionDeadline);
        intentId = ++nextIntentId;

        IntentTypes.Intent storage intent = intents[intentId];
        intent.trader = msg.sender;
        intent.settlementAsset = cfg.settlementAsset;
        intent.recipient = cfg.recipient;
        intent.amountIn = cfg.amountIn;
        intent.minAmountOut = cfg.minAmountOut;
        intent.commitDeadline = cfg.commitDeadline;
        intent.revealDeadline = cfg.revealDeadline;
        intent.executionDeadline = cfg.executionDeadline;
        intent.extraData = cfg.extraData;
        intent.state = IntentTypes.AuctionState.Open;

        if (cfg.settlementAsset == address(0)) {
            require(msg.value == cfg.amountIn, "Native amount mismatch");
            SETTLEMENT_ESCROW.depositNative{value: cfg.amountIn}(intentId);
        } else {
            require(msg.value == 0, "ERC20 intents cannot send native");
            SETTLEMENT_ESCROW.depositToken(intentId, cfg.settlementAsset, msg.sender, cfg.amountIn);
        }

        emit IntentCreated(
            intentId,
            msg.sender,
            cfg.settlementAsset,
            cfg.amountIn,
            cfg.commitDeadline,
            cfg.revealDeadline,
            cfg.executionDeadline
        );
    }

    function cancelIntent(uint256 intentId) external nonReentrant {
        IntentTypes.Intent storage intent = _requireIntent(intentId);
        if (intent.state != IntentTypes.AuctionState.Open) revert IntentNotOpen(intentId);
        if (intent.trader != msg.sender && !hasRole(ADMIN_ROLE, msg.sender)) revert SolverOnly(0, intent.trader, msg.sender);

        intent.state = IntentTypes.AuctionState.Cancelled;

        _refundTrader(intentId, intent);

        emit IntentCancelled(intentId);
    }

    // ------------------
    // Solver commitments
    // ------------------

    function commitToIntent(
        uint256 intentId,
        bytes32 payloadHash,
        TypesLib.Ciphertext calldata ciphertext,
        bytes calldata condition,
        uint32 callbackGasLimit,
        uint96 collateral
    ) external payable nonReentrant returns (uint256 commitmentId) {
        if (subscriptionId == 0) revert SubscriptionNotInitialized();

        IntentTypes.Intent storage intent = _requireIntent(intentId);
        if (intent.state != IntentTypes.AuctionState.Open) revert IntentNotOpen(intentId);
        if (block.timestamp > intent.commitDeadline) revert CommitWindowClosed(intentId);

        if (collateral < minimumCollateral) revert MinimumCollateralNotMet(collateral, minimumCollateral);
        require(msg.value == collateral, "Collateral mismatch");

        commitmentId = ++nextCommitmentId;

        CommitmentRecord storage record = commitments[commitmentId];
        record.intentId = intentId;

        IntentTypes.Commitment storage commitment = record.commitment;
        commitment.solver = msg.sender;
        commitment.payloadHash = payloadHash;
        commitment.submittedAt = block.timestamp.toUint64();
        commitment.revealAvailableAt = uint64(block.number + 1);
        commitment.collateral = collateral;
        commitment.state = IntentTypes.CommitmentState.PendingReveal;

        record.callbackGasLimit = callbackGasLimit == 0 ? defaultCallbackGasLimit : callbackGasLimit;
        record.condition = condition;
        record.ciphertext = ciphertext;

        uint256 requestId =
            _requestBlocklockWithSubscriptionForCommitment(commitmentId, record.callbackGasLimit, condition, ciphertext);
        blocklockRequestToCommitment[requestId] = commitmentId;
        commitment.blocklockRequestId = requestId;

        collateralNative[commitmentId] = collateral;

        intentCommitments[intentId].push(commitmentId);

        emit CommitmentSubmitted(intentId, commitmentId, msg.sender, collateral, requestId);
    }

    function withdrawCollateral(uint256 commitmentId, address payable recipient) external nonReentrant {
        CommitmentRecord storage record = _requireCommitment(commitmentId);
        IntentTypes.Commitment storage commitment = record.commitment;

        if (commitment.solver != msg.sender && !hasRole(ADMIN_ROLE, msg.sender)) {
            revert SolverOnly(commitmentId, commitment.solver, msg.sender);
        }

        if (
            commitment.state != IntentTypes.CommitmentState.Executed
                && commitment.state != IntentTypes.CommitmentState.Cancelled
                && commitment.state != IntentTypes.CommitmentState.Expired
        ) {
            revert CollateralLocked(commitmentId);
        }

        uint256 amount = collateralNative[commitmentId];
        collateralNative[commitmentId] = 0;
        if (amount > 0) {
            (bool success,) = recipient.call{value: amount}("");
            require(success, "Collateral transfer failed");
            emit CollateralWithdrawn(commitmentId, recipient, amount);
        }
    }

    function slashCollateral(uint256 commitmentId, uint256 amount, address beneficiary) external onlyRole(ADMIN_ROLE) {
        require(amount > 0, "amount zero");

        uint256 balance = collateralNative[commitmentId];
        require(balance >= amount, "insufficient collateral");

        collateralNative[commitmentId] = balance - amount;

        address payout = beneficiary == address(0) ? treasury : beneficiary;
        (bool success,) = payable(payout).call{value: amount}("");
        require(success, "collateral transfer failed");

        emit CollateralSlashed(commitmentId, payout, amount);
    }

    function recordExecution(
        uint256 commitmentId,
        uint256 amountOut,
        uint256 solverPayout,
        bytes32 settlementTxHash,
        bool success
    ) external nonReentrant {
        CommitmentRecord storage record = _requireCommitment(commitmentId);
        IntentTypes.Commitment storage commitment = record.commitment;

        if (commitment.solver != msg.sender && !hasRole(ADMIN_ROLE, msg.sender)) {
            revert SolverOnly(commitmentId, commitment.solver, msg.sender);
        }
        if (commitment.state != IntentTypes.CommitmentState.RevealReady) {
            revert CommitmentStateInvalid(commitmentId, IntentTypes.CommitmentState.RevealReady);
        }

        IntentTypes.ExecutionReceipt storage exec = record.execution;
        require(exec.executedAt == 0, "Execution already recorded");

        exec.executor = msg.sender;
        exec.amountOut = amountOut;
        exec.solverPayout = solverPayout;
        exec.settlementTxHash = settlementTxHash;
        exec.success = success;
        exec.executedAt = block.timestamp.toUint64();

        commitment.state = IntentTypes.CommitmentState.Executed;

        IntentTypes.Intent storage intent = intents[record.intentId];
        if (success) {
            intent.state = IntentTypes.AuctionState.Settled;
        } else {
            intent.state = IntentTypes.AuctionState.Revealed;
        }

        emit ExecutionRecorded(record.intentId, commitmentId, amountOut, solverPayout, settlementTxHash, success);
    }

    // -------------
    // View helpers
    // -------------

    function getIntent(uint256 intentId) external view returns (IntentTypes.Intent memory) {
        return intents[intentId];
    }

    function getCommitment(uint256 commitmentId) external view returns (CommitmentRecord memory) {
        return commitments[commitmentId];
    }

    function listCommitmentsForIntent(uint256 intentId) external view returns (uint256[] memory) {
        return intentCommitments[intentId];
    }

    function getCollateralBalance(uint256 commitmentId) external view returns (uint256) {
        return collateralNative[commitmentId];
    }

    function settleNative(uint256 commitmentId, uint256 solverReward) external nonReentrant onlyRole(ADMIN_ROLE) {
        CommitmentRecord storage record = _requireCommitment(commitmentId);
        IntentTypes.Intent storage intent = intents[record.intentId];
        require(intent.settlementAsset == address(0), "not native intent");

        IntentTypes.ExecutionReceipt storage exec = record.execution;
        require(exec.executedAt != 0 && exec.success, "execution incomplete");
        require(!exec.settlementClaimed, "already settled");

        uint256 total = intent.amountIn;
        require(total >= solverReward, "reward too high");

        uint256 traderPayout = total - solverReward;

        if (solverReward > 0) {
            SETTLEMENT_ESCROW.releaseNative(record.intentId, payable(record.commitment.solver), solverReward);
        }
        if (traderPayout > 0) {
            SETTLEMENT_ESCROW.releaseNative(record.intentId, payable(intent.recipient), traderPayout);
        }

        exec.settlementClaimed = true;
        exec.solverPayout = solverReward;
        intent.amountIn = 0;

        emit NativeIntentSettled(record.intentId, solverReward, traderPayout);
    }

    function settleERC20(uint256 commitmentId, uint256 solverReward) external nonReentrant onlyRole(ADMIN_ROLE) {
        CommitmentRecord storage record = _requireCommitment(commitmentId);
        IntentTypes.Intent storage intent = intents[record.intentId];
        require(intent.settlementAsset != address(0), "not erc20 intent");

        IntentTypes.ExecutionReceipt storage exec = record.execution;
        require(exec.executedAt != 0 && exec.success, "execution incomplete");
        require(!exec.settlementClaimed, "already settled");

        uint256 total = intent.amountIn;
        require(total >= solverReward, "reward too high");

        uint256 traderPayout = total - solverReward;

        if (solverReward > 0) {
            SETTLEMENT_ESCROW.releaseToken(record.intentId, intent.settlementAsset, record.commitment.solver, solverReward);
        }
        if (traderPayout > 0) {
            SETTLEMENT_ESCROW.releaseToken(record.intentId, intent.settlementAsset, intent.recipient, traderPayout);
        }

        exec.settlementClaimed = true;
        exec.solverPayout = solverReward;
        intent.amountIn = 0;

        emit ERC20IntentSettled(record.intentId, intent.settlementAsset, solverReward, traderPayout);
    }

    // --------------------------
    // BlockLock callback bridge
    // --------------------------

    function _onBlocklockReceived(uint256 requestId, bytes calldata decryptionKey) internal override {
        uint256 commitmentId = blocklockRequestToCommitment[requestId];
        if (commitmentId == 0) revert BlocklockRequestUnknown(requestId);
        delete blocklockRequestToCommitment[requestId];

        CommitmentRecord storage record = _requireCommitment(commitmentId);
        IntentTypes.Commitment storage commitment = record.commitment;
        if (commitment.state != IntentTypes.CommitmentState.PendingReveal) {
            revert CommitmentStateInvalid(commitmentId, IntentTypes.CommitmentState.PendingReveal);
        }

        bytes memory plaintext = _decodePayload(record.ciphertext, decryptionKey);
        if (keccak256(plaintext) != commitment.payloadHash) {
            revert PayloadHashMismatch(commitmentId);
        }

        commitment.state = IntentTypes.CommitmentState.RevealReady;
        commitment.revealAvailableAt = uint64(block.number);

        record.reveal.decryptedPayload = plaintext;
        record.reveal.decryptionKey = decryptionKey;
        record.reveal.revealedAt = block.timestamp.toUint64();

        IntentTypes.Intent storage intent = intents[record.intentId];
        if (intent.state == IntentTypes.AuctionState.Open) {
            intent.state = IntentTypes.AuctionState.Revealed;
        }

        _clearBlocklockReference(commitmentId);

        emit CommitmentRevealed(record.intentId, commitmentId);
    }

    // ----------------
    // Internal helpers
    // ----------------

    function _requireIntent(uint256 intentId) internal view returns (IntentTypes.Intent storage intent) {
        intent = intents[intentId];
        if (intent.trader == address(0)) revert UnknownIntent(intentId);
    }

    function _requireCommitment(uint256 commitmentId)
        internal
        view
        returns (CommitmentRecord storage record)
    {
        record = commitments[commitmentId];
        if (record.commitment.solver == address(0)) revert UnknownCommitment(commitmentId);
    }

    function _validateDeadlines(uint64 commitDeadline, uint64 revealDeadline, uint64 executionDeadline) internal view {
        if (
            commitDeadline <= block.timestamp || revealDeadline <= commitDeadline || executionDeadline < revealDeadline
                || executionDeadline <= block.timestamp
        ) {
            revert DeadlineConfigurationInvalid();
        }
    }

    function _refundTrader(uint256 intentId, IntentTypes.Intent storage intent) internal {
        if (intent.settlementAsset == address(0)) {
            SETTLEMENT_ESCROW.releaseNative(intentId, payable(intent.trader), intent.amountIn);
        } else {
            SETTLEMENT_ESCROW.releaseToken(intentId, intent.settlementAsset, intent.trader, intent.amountIn);
        }
    }

    function _decodePayload(TypesLib.Ciphertext memory ciphertext, bytes calldata decryptionKey)
        internal
        view
        virtual
        returns (bytes memory)
    {
        return _decrypt(ciphertext, decryptionKey);
    }
}

