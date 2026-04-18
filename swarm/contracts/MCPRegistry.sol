// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MCPRegistry
/// @notice Tracks which MCP (Model Context Protocol) client wallets belong to
///         which main-wallet owners on the Swarm marketplace.
///
/// Under Swarm's x402 model each MCP client holds its own locally-minted
/// secp256k1 key that signs EIP-3009 transferWithAuthorization per call.
/// That makes the MCP self-sovereign — but without an on-chain link back to
/// the user's primary wallet, the website has no way to show "these MCPs
/// belong to you." This registry provides that link: the owner signs a
/// `register(mcp)` tx from their main wallet, binding `mcp` → `owner`.
///
/// Design notes:
///  * No admin, no owner role, no upgradeability. Smallest possible surface.
///  * Each MCP address can only be registered to one owner at a time.
///  * Anyone can call `register` but only the current `ownerOf[mcp]` can
///    `unregister` it — prevents a malicious actor from unlinking a victim.
///  * `pairedAt` is recorded so UIs can show "paired 3 days ago."
contract MCPRegistry {
    /// @dev Per-owner list of MCP addresses. Public mapping would return
    ///      only the array element, not the length; we expose getMCPs().
    mapping(address => address[]) private _mcpsOf;

    /// @notice Reverse index: MCP address → owner. Zero address = unregistered.
    mapping(address => address) public ownerOf;

    /// @notice Block timestamp (uint64) at which an MCP was registered.
    mapping(address => uint64) public pairedAt;

    /// @dev Position of an MCP in its owner's _mcpsOf array, plus 1. Zero
    ///      means "not in list" and lets us distinguish from index 0.
    mapping(address => uint256) private _indexPlusOne;

    event Registered(address indexed owner, address indexed mcp, uint64 pairedAt);
    event Unregistered(address indexed owner, address indexed mcp);

    error ZeroAddress();
    error AlreadyRegistered(address currentOwner);
    error NotOwner();

    /// @notice Bind an MCP address to the caller as its owner.
    /// @dev Intentionally allows the owner to register MULTIPLE MCP
    ///      addresses — a single user can run MCPs from their laptop, phone,
    ///      and a cloud VM, each with its own keypair + USDC balance.
    function register(address mcp) external {
        if (mcp == address(0)) revert ZeroAddress();
        address existing = ownerOf[mcp];
        if (existing != address(0)) revert AlreadyRegistered(existing);

        ownerOf[mcp] = msg.sender;
        pairedAt[mcp] = uint64(block.timestamp);

        _mcpsOf[msg.sender].push(mcp);
        _indexPlusOne[mcp] = _mcpsOf[msg.sender].length;

        emit Registered(msg.sender, mcp, uint64(block.timestamp));
    }

    /// @notice Unlink an MCP from the caller. Only the current owner can call.
    ///         Doesn't refund, doesn't touch the MCP's USDC balance — those
    ///         funds remain at the MCP address and can be swept by whoever
    ///         holds the private key.
    function unregister(address mcp) external {
        if (ownerOf[mcp] != msg.sender) revert NotOwner();

        // Remove from the owner's array using swap-and-pop.
        uint256 indexPlusOne = _indexPlusOne[mcp];
        address[] storage list = _mcpsOf[msg.sender];
        uint256 lastIndex = list.length - 1;
        uint256 targetIndex = indexPlusOne - 1;

        if (targetIndex != lastIndex) {
            address last = list[lastIndex];
            list[targetIndex] = last;
            _indexPlusOne[last] = indexPlusOne;
        }
        list.pop();

        delete ownerOf[mcp];
        delete pairedAt[mcp];
        delete _indexPlusOne[mcp];

        emit Unregistered(msg.sender, mcp);
    }

    /// @notice Read the full list of MCP addresses registered to an owner.
    function getMCPs(address owner) external view returns (address[] memory) {
        return _mcpsOf[owner];
    }

    /// @notice Number of MCPs registered to an owner.
    function countMCPs(address owner) external view returns (uint256) {
        return _mcpsOf[owner].length;
    }
}
