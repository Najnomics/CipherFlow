// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

import {SettlementEscrow} from "../../src/SettlementEscrow.sol";

contract PermitToken is ERC20Permit {
    constructor() ERC20("PermitToken", "PTKN") ERC20Permit("PermitToken") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract SettlementEscrowTest is Test {
    SettlementEscrow internal escrow;
    PermitToken internal token;

    address internal admin = address(this);
    address internal intentHub = address(0x1234);

    uint256 internal ownerKey = 0xA11CE;
    address internal owner = vm.addr(ownerKey);

    function setUp() external {
        escrow = new SettlementEscrow(admin);
        token = new PermitToken();

        escrow.grantIntentHubRole(intentHub);

        token.mint(owner, 10 ether);
    }

    function testDepositWithPermit() external {
        uint256 amount = 2 ether;
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = token.nonces(owner);

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                owner,
                address(escrow),
                amount,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);

        vm.prank(intentHub);
        escrow.depositTokenWithPermit(1, address(token), owner, amount, deadline, v, r, s);

        uint256 escrowTokenBalance = token.balanceOf(address(escrow));
        uint256 ledgerBalance = escrow.getTokenBalance(1, address(token));

        assertEq(token.balanceOf(owner), 8 ether, "owner balance");
        assertEq(escrowTokenBalance, amount, "escrow token balance");
        assertEq(ledgerBalance, amount, "ledger balance");
        assertEq(token.allowance(owner, address(escrow)), 0, "allowance spent");
    }
}

