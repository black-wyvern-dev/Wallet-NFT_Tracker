import { AccountInfo, PublicKey } from "@solana/web3.js";

export class Creator {
    address: PublicKey;
    verified: boolean;
    share: number;
  
    constructor(args: { address: PublicKey; verified: boolean; share: number }) {
      this.address = args.address;
      this.verified = args.verified;
      this.share = args.share;
    }
}

export type AccountAndPubkey = {
    pubkey: string;
    account: AccountInfo<Buffer>;
};

export enum MetadataKey {
    Uninitialized = 0,
    MetadataV1 = 4,
    EditionV1 = 1,
    MasterEditionV1 = 2,
    MasterEditionV2 = 6,
    EditionMarker = 7,
}

export class Data {
    name: string;
    symbol: string;
    uri: string;
    sellerFeeBasisPoints: number;
    creators: Creator[] | null;
    constructor(args: {
      name: string;
      symbol: string;
      uri: string;
      sellerFeeBasisPoints: number;
      creators: Creator[] | null;
    }) {
      this.name = args.name;
      this.symbol = args.symbol;
      this.uri = args.uri;
      this.sellerFeeBasisPoints = args.sellerFeeBasisPoints;
      this.creators = args.creators;
    }
}

export class Metadata {
    key: MetadataKey;
    updateAuthority: PublicKey;
    mint: PublicKey;
    data: Data;
    primarySaleHappened: boolean;
    isMutable: boolean;
    masterEdition?: PublicKey;
    edition?: PublicKey;
    constructor(args: {
      updateAuthority: PublicKey;
      mint: PublicKey;
      data: Data;
      primarySaleHappened: boolean;
      isMutable: boolean;
      masterEdition?: PublicKey;
    }) {
      this.key = MetadataKey.MetadataV1;
      this.updateAuthority = args.updateAuthority;
      this.mint = args.mint;
      this.data = args.data;
      this.primarySaleHappened = args.primarySaleHappened;
      this.isMutable = args.isMutable;
    }
}

export const METADATA_SCHEMA = new Map<any, any>([
    [
      Data,
      {
        kind: 'struct',
        fields: [
          ['name', 'string'],
          ['symbol', 'string'],
          ['uri', 'string'],
          ['sellerFeeBasisPoints', 'u16'],
          ['creators', { kind: 'option', type: [Creator] }],
        ],
      },
    ],
    [
      Creator,
      {
        kind: 'struct',
        fields: [
          ['address', [32]],
          ['verified', 'u8'],
          ['share', 'u8'],
        ],
      },
    ],
    [
      Metadata,
      {
        kind: 'struct',
        fields: [
          ['key', 'u8'],
          ['updateAuthority', [32]],
          ['mint', [32]],
          ['data', Data],
          ['primarySaleHappened', 'u8'],
          ['isMutable', 'u8'],
        ],
      },
    ],
]);
