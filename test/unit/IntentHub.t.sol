// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import {BLS} from "blocklock-solidity/src/libraries/BLS.sol";
import {TypesLib} from "blocklock-solidity/src/libraries/TypesLib.sol";
import {IntentTypes} from "../../src/libraries/IntentTypes.sol";
import {IntentHub} from "../../src/IntentHub.sol";
import {SettlementEscrow} from "../../src/SettlementEscrow.sol";
import {IntentHubHarness} from "../utils/IntentHubHarness.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {CiphertextFixtures} from "../../libs/testing/fixtures/CiphertextFixtures.sol";

contract TestToken is ERC20 {
    constructor() ERC20("TestToken", "TTKN") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract IntentHubTest is Test {
    SettlementEscrow internal escrow;
    IntentHubHarness internal hub;
    TestToken internal token;

    address internal admin = address(this);
    address internal trader = address(0xC0DE);
    address internal solver = address(0xB0B);

    function setUp() external {
        escrow = new SettlementEscrow(admin);
        hub = new IntentHubHarness(admin, escrow);
        token = new TestToken();

        escrow.grantIntentHubRole(address(hub));
        hub.setSubscriptionIdForTest(1);

        vm.deal(trader, 100 ether);
        vm.deal(solver, 100 ether);
    }

    function testCommitRequiresSubscription() external {
        hub.setSubscriptionIdForTest(0);
        assertEq(hub.subscriptionId(), 0, "subscription reset");

        uint256 intentId = _openNativeIntent();
        TypesLib.Ciphertext memory ciphertext = _dummyCiphertext();
        bytes memory condition = abi.encode("B", block.number + 1);
        bytes32 payloadHash = keccak256("requires-subscription");

        uint96 collateral = hub.minimumCollateral();
        uint32 callbackGasLimit = hub.defaultCallbackGasLimit();

        vm.expectRevert(IntentHub.SubscriptionNotInitialized.selector);
        vm.prank(solver);
        hub.commitToIntent{value: collateral}(
            intentId, payloadHash, ciphertext, condition, callbackGasLimit, collateral
        );

        hub.setSubscriptionIdForTest(1);
    }

    function testCommitRevealFlow() external {
        uint256 intentId = _openNativeIntent();
        TypesLib.Ciphertext memory ciphertext = _dummyCiphertext();
        bytes memory condition = abi.encode("B", block.number + 1);
        bytes memory decryptedPayload = abi.encodePacked("cipherflow-route");
        bytes32 payloadHash = keccak256(decryptedPayload);

        uint256 commitmentId =
            _commitIntent(intentId, payloadHash, ciphertext, condition, hub.defaultCallbackGasLimit());

        uint256 requestId = hub.getRequestId(commitmentId);
        hub.simulateBlocklockCallback(requestId, decryptedPayload);

        IntentHub.CommitmentRecord memory record = hub.getCommitment(commitmentId);
        assertEq(uint8(record.commitment.state), uint8(IntentTypes.CommitmentState.RevealReady));
        assertEq(record.commitment.blocklockRequestId, requestId);
        assertEq(keccak256(record.reveal.decryptedPayload), payloadHash);
        assertEq(keccak256(record.reveal.decryptionKey), keccak256(decryptedPayload));
    }

    function testSlashCollateralTransfersToBeneficiary() external {
        uint256 intentId = _openNativeIntent();
        TypesLib.Ciphertext memory ciphertext = _dummyCiphertext();
        bytes memory condition = abi.encode("B", block.number + 1);
        bytes32 payloadHash = keccak256("slash-collateral");

        uint256 commitmentId = _commitIntent(intentId, payloadHash, ciphertext, condition, hub.defaultCallbackGasLimit());

        address beneficiary = address(0xBEEF);
        uint256 slashAmount = hub.minimumCollateral() / 2;
        assertGt(slashAmount, 0);

        uint256 beneficiaryBefore = beneficiary.balance;

        vm.prank(admin);
        hub.slashCollateral(commitmentId, slashAmount, beneficiary);

        assertEq(hub.getCollateralBalance(commitmentId), hub.minimumCollateral() - slashAmount);
        assertEq(beneficiary.balance, beneficiaryBefore + slashAmount);
    }

    function testNativeSettlementDistributesFunds() external {
        uint256 intentId = _openNativeIntent();
        TypesLib.Ciphertext memory ciphertext = _dummyCiphertext();
        bytes memory condition = abi.encode("B", block.number + 1);
        bytes memory decryptedPayload = abi.encodePacked("native-settlement");
        bytes32 payloadHash = keccak256(decryptedPayload);

        uint256 commitmentId =
            _commitIntent(intentId, payloadHash, ciphertext, condition, hub.defaultCallbackGasLimit());

        uint256 requestId = hub.getRequestId(commitmentId);
        hub.simulateBlocklockCallback(requestId, decryptedPayload);

        uint256 solverReward = 0.2 ether;

        vm.prank(solver);
        hub.recordExecution(commitmentId, 1 ether, solverReward, bytes32("tx"), true);

        uint256 traderBefore = trader.balance;
        uint256 solverBefore = solver.balance;

        vm.prank(admin);
        hub.settleNative(commitmentId, solverReward);

        assertEq(trader.balance, traderBefore + (1 ether - solverReward), "trader payout");
        assertEq(solver.balance, solverBefore + solverReward, "solver reward");

        IntentHub.CommitmentRecord memory record = hub.getCommitment(commitmentId);
        assertTrue(record.execution.settlementClaimed, "settled flag");
        assertEq(hub.getIntent(intentId).amountIn, 0, "intent cleared");
    }

    function testERC20SettlementDistributesTokens() external {
        uint256 amount = 500e18;
        token.mint(trader, amount);

        uint256 intentId = _openERC20Intent(amount);
        TypesLib.Ciphertext memory ciphertext = _dummyCiphertext();
        bytes memory condition = abi.encode("B", block.number + 1);
        bytes memory decryptedPayload = abi.encodePacked("erc20-settlement");
        bytes32 payloadHash = keccak256(decryptedPayload);

        uint256 commitmentId =
            _commitIntent(intentId, payloadHash, ciphertext, condition, hub.defaultCallbackGasLimit());
        uint256 requestId = hub.getRequestId(commitmentId);
        hub.simulateBlocklockCallback(requestId, decryptedPayload);

        uint256 solverReward = 120e18;
        vm.prank(solver);
        hub.recordExecution(commitmentId, amount, solverReward, bytes32("erc20tx"), true);

        uint256 solverBefore = token.balanceOf(solver);
        uint256 recipientBefore = token.balanceOf(trader);

        vm.prank(admin);
        hub.settleERC20(commitmentId, solverReward);

        assertEq(token.balanceOf(solver), solverBefore + solverReward, "solver token reward");
        assertEq(token.balanceOf(trader), recipientBefore + (amount - solverReward), "recipient token payout");

        IntentHub.CommitmentRecord memory record = hub.getCommitment(commitmentId);
        assertTrue(record.execution.settlementClaimed, "erc20 settled");
        assertEq(hub.getIntent(intentId).amountIn, 0, "intent token cleared");
    }

    function _openNativeIntent() internal returns (uint256 intentId) {
        vm.startPrank(trader);
        uint64 commitDeadline = uint64(block.timestamp + 1 hours);
        uint64 revealDeadline = commitDeadline + 1 hours;
        uint64 executionDeadline = revealDeadline + 1 hours;

        IntentHub.IntentConfig memory cfg = IntentHub.IntentConfig({
            settlementAsset: address(0),
            recipient: trader,
            amountIn: 1 ether,
            minAmountOut: 0.9 ether,
            commitDeadline: commitDeadline,
            revealDeadline: revealDeadline,
            executionDeadline: executionDeadline,
            extraData: ""
        });

        intentId = hub.createIntent{value: 1 ether}(cfg);
        vm.stopPrank();
    }

    function _commitIntent(
        uint256 intentId,
        bytes32 payloadHash,
        TypesLib.Ciphertext memory ciphertext,
        bytes memory condition,
        uint32 callbackGasLimit
    ) internal returns (uint256 commitmentId) {
        vm.startPrank(solver);
        commitmentId = hub.commitToIntent{value: hub.minimumCollateral()}(
            intentId, payloadHash, ciphertext, condition, callbackGasLimit, hub.minimumCollateral()
        );
        vm.stopPrank();
    }

    function _dummyCiphertext() internal pure returns (TypesLib.Ciphertext memory cipher) {
        return CiphertextFixtures.sampleCiphertext();
    }

    function _openERC20Intent(uint256 amount) internal returns (uint256 intentId) {
        vm.startPrank(trader);
        token.approve(address(escrow), amount);

        uint64 commitDeadline = uint64(block.timestamp + 1 hours);
        uint64 revealDeadline = commitDeadline + 1 hours;
        uint64 executionDeadline = revealDeadline + 1 hours;

        IntentHub.IntentConfig memory cfg = IntentHub.IntentConfig({
            settlementAsset: address(token),
            recipient: trader,
            amountIn: amount,
            minAmountOut: amount - 100e18,
            commitDeadline: commitDeadline,
            revealDeadline: revealDeadline,
            executionDeadline: executionDeadline,
            extraData: ""
        });

        intentId = hub.createIntent(cfg);
        vm.stopPrank();

        assertEq(token.balanceOf(address(escrow)), amount, "escrow token balance");
        assertEq(hub.getIntent(intentId).amountIn, amount, "intent token amount");
    }
}

