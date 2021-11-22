import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountInfo, Connection, ParsedConfirmedTransaction, PublicKey } from "@solana/web3.js";
import * as borsh from 'borsh';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { AccountAndPubkey, Metadata, METADATA_SCHEMA } from "./types";

const SOLANA_MAINNET = "https://api.mainnet-beta.solana.com";
const DUMP_PATH = __dirname + '/../dumps';
const DEFAULT_SOL = 1000000000;
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
);

export const fetchWalletForNFTs = async (address: string) => {
    // try {
        const wallet = new PublicKey(address);
        const connection = new Connection(SOLANA_MAINNET, "confirmed");

        // Retrieve spl-tokens in wallet
        const ownedTokens = await connection.getParsedTokenAccountsByOwner(wallet, {
            programId: TOKEN_PROGRAM_ID,
        });

        let nftAccounts = [] as any;
        for ( const token of ownedTokens.value ) {

            // Convert BN type public keys to string
            let parsedToken = {
                account: {
                    ...token.account,
                    owner: token.account.owner.toBase58(),
                },
                pubkey: token.pubkey.toBase58(),
            }
            const parsedData = parsedToken.account.data.parsed;
            // Process only nfts
            if ( parsedData.info.tokenAmount.decimals == 0
                && parsedData.info.tokenAmount.uiAmount == 1 ) {
                    // console.dir(parsedToken, {depth: null});
                    console.log(`--> ${nftAccounts.length + 1} nft is determinted`);
                    const metaData = await getAccountsByMint(parsedData.info.mint, connection);
                    console.log('Get token metadata performed');
                    let parsedMetaData = {} as any;
                    if ( metaData.length != 0 ) {
                        parsedMetaData = processMetaData(metaData[0][0]);
                    } 
                    console.log('Process token metadata performed');
                    // console.dir(parsedMetaData, {depth: null});
                    
                    nftAccounts.push({
                        account: token.pubkey.toBase58(),
                        mint: parsedData.info.mint,
                        metadataAccount: metaData[0][1],
                        metadata: parsedMetaData,
                        // nftMetadata: fetchedNFTMetadata,
                    })
                    console.log(nftAccounts[nftAccounts.length - 1]);
                    saveDump(
                        `${parsedData.info.mint}.json`,
                        nftAccounts[nftAccounts.length - 1]
                    );
                    console.log(`\n--> ${nftAccounts.length} Nft is processed`);
            }
        }
        console.log(`\n${nftAccounts.length} nfts determined from this wallet`);

        return nftAccounts;
    // } catch (e) {
    //     console.log(`--> Error: ${e}`);
    //     return false;
    // }
}

export async function getTransactionData(address: string, mint: string) {
    const connection = new Connection(SOLANA_MAINNET, "confirmed");
    let dump = loadDump(`${mint}.json`);
    if (!dump) {
      console.log('Couldn\'t find nft metadata. Fetch NFTs and try again.');
      return false;
    }
    
    let fetchedNFTMetadata = undefined;
    for (let again = 0; /*again < 3*/; again++) {
        try {
            if (!dump.metadata.data.uri) break;
            const nftMetaData = await axios.get(dump.metadata.data.uri);
            if (nftMetaData.status == 200) {
                fetchedNFTMetadata = nftMetaData.data;
                break;
            };
        } catch (e) {
            console.log(`Metadata fetch from arweave is failed. Trying again`);
        }
    }
    if (!fetchedNFTMetadata) {
      console.log('Could\'t get NFT metadata. Fetch Nft again and then try again.');
      return false;
    }
    console.log('Get token nft metadata processed');
    

    const trxTracks = await connection.getSignaturesForAddress(new PublicKey(mint), {limit: 100}, 'confirmed');
    console.log('--> Fetched related signature for address');
    // console.dir(trxTracks, {depth: null});
    let trxData = [] as any, purchasedDate = '', purchasedPrice = 0;
    for( let idx = 0; idx < trxTracks.length; idx ++ ) {
        const time = (trxTracks[idx].blockTime ?? 0) * 1000;
        let date = new Date();
        date.setTime(time);
        if (purchasedDate == '') purchasedDate = date.toLocaleString();
        trxData.push({
            signature: trxTracks[idx].signature,
            slot: trxTracks[idx].slot,
            blockTime: date.toLocaleString(),
        })
        if (idx == 0 || idx == trxTracks.length - 1) {
          const result = await getPriceInfo(trxTracks[idx].signature, address, connection);
          purchasedPrice = result == false ? 0 : result;
        }
    };

    saveDump(`${mint}.json`, {
      ...dump,
      nftMetadata: fetchedNFTMetadata,
      purchasedDate,
      purchasedPrice,
      transactionData: trxData,
    });
    
    return {
      purchasedPrice,
      purchasedDate,
      data: trxData
    };
}

// Get Purchase Price from signature
const getPriceInfo = async (sig: string, wallet: string, connection: Connection) => {
    const parsedTrxDatas = await connection.getParsedConfirmedTransaction(sig, 'finalized');
    if (parsedTrxDatas == null) return false;
    let parsedData = parseTransactionData(parsedTrxDatas, sig);

    let transaferData = [], purchaser = '', price = 0;
    // Find mintAuthority
    for (const ins of parsedData.transaction.message.instructions) {
      if (ins.program == 'system' && ins.parsed.type == 'transfer') {
        if (ins.parsed.info.lamports % 10000 != 0) continue;
        transaferData.push(ins.parsed.info);
      }
      if (ins.program == 'spl-token' && ins.parsed.type == 'mintTo') {
        purchaser = ins.parsed.info.mintAuthority;
      }
    }
    for (const ins of parsedData.meta.innerInstructions) {
      for (const innerIns of ins.instructions) {
        if (innerIns.program == 'system' && innerIns.parsed.type == 'transfer') {
          if (innerIns.parsed.info.lamports % 10000 != 0) continue;
          transaferData.push(innerIns.parsed.info);
        }
      }
    }
    for (const data of transaferData)
      if (data.source == wallet || data.source == purchaser)
        price += data.lamports;
    // console.dir(transaferData, {depth: null});
    console.log(`--> Parsed price: ${purchaser} - ${price / DEFAULT_SOL}`);
    return price;
}

// Convert all PublicKeys in the transactions data as base58 string
export const parseTransactionData = (raw: ParsedConfirmedTransaction | null, sig: string) => {
  let parsedData = raw as any;
  parsedData.signature = sig;
  // Parse innerInstruction accounts
  let newInnerIns = [];
  for ( const innerIns of raw?.meta?.innerInstructions ?? []) {
      let newIns = [];
      for ( const ins of innerIns.instructions) {
          let newData = ins as any;
          newData.programId = ins.programId.toBase58();
          if (newData.accounts) {
              let newAccounts = [];
              for (const account of newData.accounts) newAccounts.push(account.toBase58());
              newData.accounts = newAccounts;
          }
          newIns.push(newData);
      }
      newInnerIns.push({
          index: innerIns.index,
          instructions: newIns,
      });
  }
  parsedData.meta.innerInstructions = newInnerIns;

  // Parse transaction accounts
  let newTransaction = raw?.transaction as any;
  let newAccountKeys = [];
  for ( const account of newTransaction?.message.accountKeys ?? [])
      newAccountKeys.push({
          ...account,
          pubkey: account.pubkey.toBase58(),
      })
  let newInstructions = [];
  for ( const ins of newTransaction?.message.instructions) {
      let newIns = ins as any;
      if (newIns.accounts) {
          let newInsAccounts = [];
          for ( const account of newIns.accounts as any) newInsAccounts.push(account.toBase58());
          newIns.accounts = newInsAccounts;
      }
      newIns.programId = newIns.programId.toBase58();
      newInstructions.push(newIns)
  }
  
  newTransaction = {
      ...newTransaction,
      message: {
          ...newTransaction.message,
          instructions: newInstructions,
          accountKeys: newAccountKeys,
      }
  };
  parsedData.transaction = newTransaction;
  return parsedData;
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

// Get NFT Token Metadata from mint address
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

// Decode metadata from buffer with schema
async function decodeMetadata(buffer: any) {
  return borsh.deserializeUnchecked(METADATA_SCHEMA, Metadata, buffer);
}

export function saveDump(
  dumpType: string,
  content: any,
  cPath: string = DUMP_PATH,
  infos: any = {},
) {
  fs.writeFileSync(
    getDumpPath(dumpType, cPath, infos),
    JSON.stringify(content),
  );
}

/**
 * Restore dump content as file
 * 
 * @param dumpType Type of dump which is used to resolve dump file name
 * @param cPath Location of saved dump file
 * @returns JSON object or undefined
 */
 export function loadDump(
  dumpType: string,
  cPath: string = DUMP_PATH,
) {
  const path = getDumpPath(dumpType, cPath);
  return fs.existsSync(path)
    ? JSON.parse(fs.readFileSync(path).toString())
    : undefined;
}

/**
 * Resolve dump file path from dumpType
 * 
 * @param dumpType Type of dump which is used to resolve dump file name
 * @param cPath Location of saved dump file
 * @param infos Optional param for track transactions. Save period info in the dump file name
 * @returns Location of subdirectory of exact dump file
 */
export function getDumpPath(
  dumpType: string,
  cPath: string = DUMP_PATH,
  infos: any = {},
) {
  if (!fs.existsSync(cPath)) fs.mkdirSync(cPath, {recursive: true});
  switch (dumpType) {
    default:
      return path.join(cPath, dumpType);
  }
}