// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import {BLS} from "blocklock-solidity/src/libraries/BLS.sol";
import {TypesLib} from "blocklock-solidity/src/libraries/TypesLib.sol";
import {IntentTypes} from "../../src/libraries/IntentTypes.sol";
import {IntentHub} from "../../src/IntentHub.sol";
import {SettlementEscrow} from "../../src/SettlementEscrow.sol";
import {IntentHubHarness} from "../utils/IntentHubHarness.sol";

contract IntentHubTest is Test {
    SettlementEscrow internal escrow;
    IntentHubHarness internal hub;

    address internal admin = address(this);
    address internal trader = address(0xC0DE);
    address internal solver = address(0xB0B);

    function setUp() external {
        escrow = new SettlementEscrow(admin);
        hub = new IntentHubHarness(admin, escrow);

        escrow.grantIntentHubRole(address(hub));

        vm.deal(trader, 100 ether);
        vm.deal(solver, 100 ether);
    }

    function testCommitRevealFlow() external {
        uint256 intentId = _openIntent();
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
        uint256 intentId = _openIntent();
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

    function _openIntent() internal returns (uint256 intentId) {
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
        vm.prank(solver);
        commitmentId = hub.commitToIntent{value: hub.minimumCollateral()}(
            intentId, payloadHash, ciphertext, condition, callbackGasLimit, hub.minimumCollateral()
        );
    }

    function _dummyCiphertext() internal pure returns (TypesLib.Ciphertext memory cipher) {
        cipher.u = BLS.PointG2({
            x: [uint256(1), uint256(2)],
            y: [uint256(3), uint256(4)]
        });
        cipher.v = abi.encodePacked(bytes32(uint256(123)));
        cipher.w = abi.encodePacked(bytes32(uint256(456)));
    }
}

