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
export const SOLANART_PROGRAM_PUBKEY = new PublicKey('CJsLwbP1iu5DuUikHEJnLfANgKy6stB2uFgvBBHoyxwz');
export const MEMO_V2_PROGRAM_PUBKEY = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export const SOLANA_TRX_FEE = 5000;

export let isAttachingListener: {
    mint: string,
    token_Add: string,
    escrow_Add: string,
    event: 'offer' | 'sale'
}[] = [];

export const setAttachingListener = (nfts: {
    mint: string,
    token_Add: string,
    escrow_Add: string,
    event: 'offer' | 'sale',
}[]) => {
    isAttachingListener = nfts;
}

export let floorPriceCache: {
    [collection: string]: {
        magiceden: number | undefined,
        solanart: number | undefined,
    }
} = {};

export let updateFloorPriceCache = (newInfo: any) => {
    floorPriceCache = newInfo;
}

export let collectionsForFloorPrice: string[] = [];

export const updateCollectionsForFloorPrice = (collections: string[]) => {
    collectionsForFloorPrice = collections;
}

export const sleep = async (time: number) => {
    new Promise((resolve, reject) => {
        setTimeout(() => {resolve(1);}, time)
    });
}