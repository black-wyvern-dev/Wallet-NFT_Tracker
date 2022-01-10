import { PublicKey } from "@solana/web3.js";

export const SOLANA_MAINNET = "https://solana-api.projectserum.com";

export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
);

export const TEST_COLLECTION_LIST = [
    '111_solana_tattoos',
    'solana_monkey_business',
    'monkeyball',
];

export const MAGIC_EDEN_PROGRAM_PUBKEY = new PublicKey('MEisE1HzehtrDpAAT8PnLHjpSSkRYakotTuJRPjTpo8');

export const SOLANA_TRX_FEE = 5000;

export let isAttachingListener = false;
export const setAttachingListener = (value: boolean) => {
    isAttachingListener = value;
}