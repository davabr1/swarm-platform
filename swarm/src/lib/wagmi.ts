import { http, createConfig, cookieStorage, createStorage } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  coinbaseWallet,
  rainbowWallet,
  injectedWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";

// WalletConnect project id — optional, used when the user wants to pair a
// mobile wallet via QR. When not provided we fall back to a demo id so the
// UI still shows the WC option (users can set NEXT_PUBLIC_WC_PROJECT_ID to
// get full WC functionality).
const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
  process.env.NEXT_PUBLIC_WC_PROJECT_ID ||
  "00000000000000000000000000000000";

// Build the wallet list manually rather than calling getDefaultConfig,
// which reads localStorage at module init and panics during Next.js SSR.
// Keeping this explicit also lets us pick exactly which wallets we want.
const connectors = connectorsForWallets(
  [
    {
      groupName: "popular",
      wallets: [metaMaskWallet, rainbowWallet, coinbaseWallet, walletConnectWallet, injectedWallet],
    },
  ],
  {
    appName: "Swarm",
    projectId: walletConnectProjectId,
  }
);

export const wagmiConfig = createConfig({
  chains: [avalancheFuji],
  connectors,
  transports: {
    [avalancheFuji.id]: http(),
  },
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
});
