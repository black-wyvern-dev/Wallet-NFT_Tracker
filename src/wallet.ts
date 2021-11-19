import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import * as borsh from 'borsh';
import axios from 'axios';
import { AccountAndPubkey, Metadata, METADATA_SCHEMA } from "./types";

const SOLANA_MAINNET = "https://api.mainnet-beta.solana.com";
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
);

export const fetchWalletForNFTs = async (address: string) => {
    try {
        const wallet = new PublicKey(address);
        const connection = new Connection(SOLANA_MAINNET, "confirmed");

        const ownedTokens = await connection.getParsedTokenAccountsByOwner(wallet, {
            programId: TOKEN_PROGRAM_ID,
        });
        let nftAccounts = [] as any;
        for ( const token of ownedTokens.value ) {
            let parsedToken = {
                account: {
                    ...token.account,
                    owner: token.account.owner.toBase58(),
                },
                pubkey: token.pubkey.toBase58(),
            }
            const parsedData = parsedToken.account.data.parsed;
            if ( parsedData.info.tokenAmount.decimals == 0
                && parsedData.info.tokenAmount.uiAmount == 1 ) {
                    console.log(`--> ${nftAccounts.length + 1} nft is determinted`);
                    const metaData = await getAccountsByMint(parsedData.info.mint, connection);
                    console.log('Get token metadata performed');
                    let parsedMetaData = {} as any;
                    if ( metaData.length != 0 ) {
                        parsedMetaData = processMetaData(metaData[0][0]);
                    }
                    console.log('Process token metadata performed');
                    
                    let fetchedNFTMetadata = {};
                    while (1) {
                        try {
                            const nftMetaData = await axios.get(parsedMetaData.data.uri);
                            if (nftMetaData.status == 200) {
                                fetchedNFTMetadata = nftMetaData.data;
                                break;
                            };
                        } catch (e) {
                            console.log(`Metadata fetch from arweave is failed. Trying again`);
                        }
                    }
                    console.log('Get token nft metadata processed');
                    const trxData = await getTransactionData(parsedData.info.mint, connection);
                    console.log('Get related transactions processed');
                    nftAccounts.push({
                        account: token.pubkey.toBase58(),
                        mint: parsedData.info.mint,
                        metadataAccount: metaData[0][1],
                        metadata: parsedMetaData,
                        nftMetadata: fetchedNFTMetadata,
                        transactions: trxData,
                    })
                    console.log(nftAccounts[nftAccounts.length - 1]);
                    console.log(`\n--> ${nftAccounts.length} Nft is processed`);
            }
        }
        // console.dir(nftAccounts, {depth: null});
        console.log(`\n${nftAccounts.length} nfts determined from this wallet`);

        return nftAccounts;
    } catch (e) {
        console.log(`--> Error: ${e}`);
        return false;
    }
}

async function getTransactionData(mint: string, connection: Connection) {
    const trxTracks = await connection.getSignaturesForAddress(new PublicKey(mint), {limit: 100}, 'confirmed');
    let trxData = [];
    for( const track of trxTracks) {
        const time = track.blockTime ?? 0 * 1000;
        trxData.push({
            signature: track.signature,
            slot: track.slot,
            blockTime: (new Date(time)).toLocaleString(),
        })
    };
    return trxData;
}

function processMetaData(meta: Metadata) {
    let bufMeta = meta as any;
    bufMeta.updateAuthority = (new PublicKey(meta.updateAuthority)).toBase58();
    bufMeta.mint = (new PublicKey(meta.mint)).toBase58();
    let bufData = meta.data as any;
    let sliced_name = Buffer.from(bufData.name);
    sliced_name = sliced_name.slice(0, sliced_name.indexOf(0));
    bufData.name = sliced_name.toString();
    let sliced_symbol = Buffer.from(bufData.symbol);
    sliced_symbol = sliced_symbol.slice(0, sliced_symbol.indexOf(0));
    bufData.symbol = sliced_symbol.toString();
    let sliced_uri = Buffer.from(bufData.uri);
    sliced_uri = sliced_uri.slice(0, sliced_uri.indexOf(0));
    bufData.uri = sliced_uri.toString();
    let creators = [];
    for ( const creator of meta.data.creators ?? []) {
        creators.push({
            ...creator,
            address: (new PublicKey(creator.address)).toBase58(),
        });
    }
    bufData.creators = creators;
    bufMeta.data = bufData;
    return bufMeta;
}

async function getAccountsByMint(mint: string, connection: Connection) {
  const metadataAccounts = await getProgramAccounts(
    connection,
    TOKEN_METADATA_PROGRAM_ID.toBase58(),
    {
      filters: [
        {
          memcmp: {
            offset:
              1 + // key
              32, // update auth
            bytes: mint,
          },
        },
      ],
    },
  );
  const decodedAccounts = [];
  for (let i = 0; i < metadataAccounts.length; i++) {
    const e = metadataAccounts[i];
    const decoded = await decodeMetadata(e.account.data);
    const accountPubkey = e.pubkey;
    const store = [decoded, accountPubkey];
    decodedAccounts.push(store);
  }
  return decodedAccounts;
}


async function getProgramAccounts(
    connection: Connection,
    programId: String,
    configOrCommitment?: any,
  ): Promise<Array<AccountAndPubkey>> {
    const extra: any = {};
    let commitment;
    //let encoding;
  
    if (configOrCommitment) {
      if (typeof configOrCommitment === 'string') {
        commitment = configOrCommitment;
      } else {
        commitment = configOrCommitment.commitment;
        //encoding = configOrCommitment.encoding;
  
        if (configOrCommitment.dataSlice) {
          extra.dataSlice = configOrCommitment.dataSlice;
        }
  
        if (configOrCommitment.filters) {
          extra.filters = configOrCommitment.filters;
        }
      }
    }
  
    const args = connection._buildArgs([programId], commitment, 'base64', extra);
    const unsafeRes = await (connection as any)._rpcRequest(
      'getProgramAccounts',
      args,
    );
    //console.log(unsafeRes)
    const data = (
      unsafeRes.result as Array<{
        account: AccountInfo<[string, string]>;
        pubkey: string;
      }>
    ).map(item => {
      return {
        account: {
          // TODO: possible delay parsing could be added here
          data: Buffer.from(item.account.data[0], 'base64'),
          executable: item.account.executable,
          lamports: item.account.lamports,
          // TODO: maybe we can do it in lazy way? or just use string
          owner: item.account.owner,
        } as AccountInfo<Buffer>,
        pubkey: item.pubkey,
      };
    });
  
    return data;
  }
  
  async function decodeMetadata(buffer: any) {
    return borsh.deserializeUnchecked(METADATA_SCHEMA, Metadata, buffer);
  }
  