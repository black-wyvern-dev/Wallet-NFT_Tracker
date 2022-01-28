import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountInfo, Connection, LAMPORTS_PER_SOL, PartiallyDecodedInstruction, PublicKey, ParsedConfirmedTransaction, ConfirmedSignatureInfo } from "@solana/web3.js";
import * as borsh from 'borsh';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import {
  getParsedNftAccountsByOwner
} from "@nfteyez/sol-rayz";
import {
  DIGITALEYES_DIRECTSELL_PROGRAM_PUBKEY,
  DIGITALEYES_PROGRAM_PUBKEY,
  EXCHANGE_PROGRAM_PUBKEY,
  MAGIC_EDEN_PROGRAM_PUBKEY,
  SOLANART_PROGRAM_PUBKEY,
  SOLANA_MAINNET,
  SOLANA_MAINNET_SERUM,
  TOKEN_METADATA_PROGRAM_ID,
  SOLANA_TRX_FEE, SOLSEA_PROGRAM_PUBKEY,

} from './config/constant';
import { AccountAndPubkey, Metadata, METADATA_SCHEMA } from "./types";
// import { SOLANA_MAINNET, TOKEN_METADATA_PROGRAM_ID } from './config/constant';

const DUMP_PATH = __dirname + '/../dumps';
const DEFAULT_SOL = 1000000000;

/**
 * Determine NFTs on wallet
 * 
 * Fetch only metadata for each NFT. Price and related transaction info is excepted
 * @param address Wallet address to determine
 * @returns Fetched NFT Accounts with data
 */
async function get_nft_api_rec(url: any, mint: any) {

  try {
    console.log(url);
    const response = await axios.get(url);
    // console.log(response.data.collection.name + '-' + response.status)
    if (response.status == 200) {
      let ColName = '';
      let collectionName = '';
      let familyName = '';
      if (response.data.collection) {
        if (typeof (response.data.collection) === 'string') {
          collectionName = response.data.collection;
        } else if (response.data.collection.name) {
          collectionName = response.data.collection.name;
        }
        if (response.data.collection.family) {
          familyName = response.data.collection.family;
        }
      }

      if (ColName == '') {
        const colArray = response.data.name.split(" #");
        ColName = colArray['0'];
      }

      const nftArray = response.data.name.split("#");
      let nftName = nftArray['1'] ? nftArray['1'] : response.data.name;

      return {
        mint: mint,
        projectname: ColName ? ColName : '',
        collectionname: collectionName,
        familyname: familyName,
        nftname: nftName,
        image: response.data.image,
        symbol: response.data.symbol,
        url: url
      };
    }
  } catch (error) {
    console.error(error);
  }

}
export const fetchWalletForNFTs = async (address: string) => {
  const wallet = new PublicKey(address);
  const connection = new Connection(SOLANA_MAINNET, "confirmed");
  const nftAccounts = await getParsedNftAccountsByOwner({ publicAddress: wallet, connection: connection });

  console.log(`\n${nftAccounts.length} nfts determined from this wallet`);

  const result = await nftAccounts.map(async nfts => {
    return await get_nft_api_rec(nfts.data.uri, nfts.mint);
  });

  return await Promise.all(result);

}

export const fetchWalletallForNFTs = async (address: string) => {
  const wallet = new PublicKey(address);
  const connection = new Connection(SOLANA_MAINNET, "confirmed");
  const nftAccounts = await getParsedNftAccountsByOwner({ publicAddress: wallet, connection: connection });

  console.log(`\n${nftAccounts.length} nfts determined from this wallet`);

  const result = await nftAccounts;

  return await Promise.all(result);

}

/**
 * Fetch price info and related transactions
 * 
 * This function load the NFT metadata from dump. If there isn't dump file for this NFT,
 * determine NFTs and then try again
 * @param address The wallet address
 * @param mint The mint address of NFT. To get prices and related transactions for all
 *             NFTs in dump, assign this param as undefined
 * @returns Price info for individual or all nft dumps
 */
export async function getTransactionData(address: string, mint: string | undefined) {
  const connection = new Connection(SOLANA_MAINNET, "confirmed");

  let dumpName = '',  // Dump file name to get price and transaction Info
    dumpList = [] as any, // All dump file names for fetch all
    result = [];  // For return

  // If mint param is undefined, read all dump files for nfts
  if (mint == undefined) {
    dumpList = fs.readdirSync(DUMP_PATH);
    if (dumpList.length == 0) return undefined;
  } else dumpName = mint;

  for (let dumpId = 0; mint != undefined || dumpId < dumpList.length; dumpId++) {
    if (mint == undefined) dumpName = dumpList[dumpId];
    else {
      if (dumpId != 0) break;
      dumpName = `${dumpName}.json`;
    }
    let dump = loadDump(dumpName);
    if (!dump) {
      console.log('Couldn\'t find nft metadata. Fetch NFTs and try again.');
      return false;
    }

    let fetchedNFTMetadata = undefined;
    /*
    Try to fetch NFT metadata from dump metadata uri
    Maximum try again is 5. All trying will failed if the metadata uri is invalid
    */
    for (let again = 0; again < 5; again++) {
      try {
        if (!dump.metadata.data.uri) break;
        console.log(dump.metadata.data.uri);
        const nftMetaData = await axios.get(dump.metadata.data.uri);
        if (nftMetaData.status == 200) {
          fetchedNFTMetadata = nftMetaData.data;
          break;
        };
      } catch (e) {
        console.log(`Metadata fetch from arweave is failed. Trying again`);
      }
    }

    // Continue if the metadata uri is exist but is invalid
    if (!fetchedNFTMetadata && !dump.metadata.data.uri) {
      console.log('Could\'t get NFT metadata. Fetch Nft again and then try again.');
      if (mint == undefined) continue;
      return false;
    }
    console.log('Get token nft metadata processed');

    // Fetch related transactions with this mint address
    let trxTracks = [] as any;
    while (1) {
      try {
        const result = await connection.getSignaturesForAddress(
          new PublicKey(dumpName.split('.')[0]),
          { limit: 100 }, // maximum fetch count is 100
          'confirmed'
        );
        trxTracks = result;
        console.log('--> Fetched related signature for address');
        break;
      } catch (e) {
        console.log(`--> Error while fetch signatures: ${e}`);
      };
    };

    // Try to extract purchase or mint price, and convert transaction time from unix to locale format
    let trxData = [] as any, purchasedDate = '', purchasedPrice = 0;
    for (let idx = 0; idx < trxTracks.length; idx++) {
      const time = (trxTracks[idx].blockTime ?? 0) * 1000;
      let date = new Date();
      date.setTime(time);
      // Purchased date is the most recent transaction date
      if (purchasedDate == '') purchasedDate = date.toLocaleString();

      trxData.push({
        signature: trxTracks[idx].signature,
        slot: trxTracks[idx].slot,
        blockTime: date.toLocaleString(),
      })

      // Extract trade info for this nft
      const result = await getPriceInfo(trxTracks[idx].signature, address, connection);
      const price = result == false ? 0 : result;
      if (purchasedPrice == 0 || purchasedPrice < price) purchasedPrice = price;
    };
    console.log(`--> Get purchased Price: ${purchasedPrice}`);

    // Update dump file for this mint
    saveDump(dumpName, {
      ...dump,
      nftMetadata: fetchedNFTMetadata,
      purchasedDate,
      purchasedPrice,
      transactionData: trxData,
    });

    let nft = {
      mint: dump.mint,
      purchasedPrice,
      purchasedDate,
    } as any;
    if (fetchedNFTMetadata) {
      const project = fetchedNFTMetadata.name.split('#');
      nft = {
        ...nft,
        projectName: project[0],
        nftNumber: project.length == 1 ? '' : `#${project[1]}`,
        symbol: fetchedNFTMetadata.symbol,
        family: fetchedNFTMetadata.collection ? fetchedNFTMetadata.collection.family : '',
      };
    }
    result.push(nft);
  }

  return result;
}


export const fetchOnlyPurchaseInfo = async (address: string, mint: string) => {
  var connection = new Connection(SOLANA_MAINNET, "confirmed");

  const nftAccounts = await getParsedNftAccountsByOwner({ publicAddress: new PublicKey(address), connection: connection });

  const walletTokenAccounts = await connection.getParsedTokenAccountsByOwner(new PublicKey(address), { programId: TOKEN_PROGRAM_ID });
  var holderAccountTemp = [];
  var holderAccount: any[] = [];

  for (let i = 0; i < walletTokenAccounts.value.length; i++) {
    for (let j = 0; j < nftAccounts.length; j++) {
      if (walletTokenAccounts.value[i].account.data.parsed.info.mint === nftAccounts[j].mint) {

        // let new_arr = await get_nft_api_rec(nftAccounts[j].data.uri, nftAccounts[j])
        holderAccountTemp.push({
          // ...new_arr,
          mint: nftAccounts[j].mint,
          account: walletTokenAccounts.value[i].pubkey.toBase58(),
          // nftname: nftAccounts[j].data.name,
          nftsymbol: nftAccounts[j].data.symbol,
          nfturi: nftAccounts[j].data.uri,
        });
        break;
      }
    }
  }

  await Promise.allSettled(
    holderAccountTemp.map(async (holder) => {
      try {
        let res = await get_nft_api_rec(holder.nfturi, holder.mint);
        holderAccount.push({
          ...res,
          account: holder.account,
          // nftname: nftAccounts[j].data.name,
          nftsymbol: holder.nftsymbol,
          nfturi: holder.nfturi,
        });

      } catch (e) {
        console.log(`   error occured ${e}`);
      };
    })
  );

  var globalSignLength = [];
  var globalSigns = [];
  var purchaseInfo = [];
  for (let i = 0; i < holderAccount.length; i++) {

    let sigs = await connection.getSignaturesForAddress(new PublicKey(holderAccount[i].account), { limit: 10 });
    globalSignLength.push(sigs.length);
    for (let j = 0; j < sigs.length; j++) {
      globalSigns.push(sigs[j].signature);
    }
  }

  connection = new Connection('https://solana--mainnet.datahub.figment.io/apikey/ba11960d832a6415baeb2ae7e5f6acd3', "confirmed");

  let testtxs = await connection.getParsedConfirmedTransactions(globalSigns, 'confirmed');
  if (testtxs.length > 0 && testtxs[0] === null) {
    console.log('null transaction occoured. retry...');
    testtxs = await connection.getParsedConfirmedTransactions(globalSigns, 'confirmed');
  }
  if (testtxs.length > 0 && testtxs[0] === null) {
    console.log('second null transaction occoured');
    testtxs = await connection.getParsedConfirmedTransactions(globalSigns, 'confirmed');
  }

  var stackedTxsLength = 0;
  for (let i = 0; i < globalSignLength.length; i++) {

    var price = 0;
    var market = '';
    var time = '';
    if (i > 0) stackedTxsLength += globalSignLength[i - 1];
    for (let j = 0; j < globalSignLength[i]; j++) {

      const trx = testtxs[stackedTxsLength + j];
      var signer = trx?.transaction.message.accountKeys[0].pubkey.toBase58();
      if (signer != address) continue;
      if (!trx?.meta) continue;

      let prebalance = trx?.meta?.preBalances[0] as number;
      let postBalances = trx?.meta?.postBalances[0] as number;

      if ((prebalance - postBalances - SOLANA_TRX_FEE) / LAMPORTS_PER_SOL < 0.005) continue;
      else price = (prebalance - postBalances - SOLANA_TRX_FEE) / LAMPORTS_PER_SOL;
      time = (new Date((trx.blockTime ?? 0) * 1000)).toLocaleString();


      var instructionlength = trx?.transaction.message.instructions.length as number;
      for (let k = 0; k < instructionlength; k++) {
        market = '';

        const parsedInstruction = trx?.transaction.message.instructions[k] as PartiallyDecodedInstruction;
        if (!parsedInstruction || !parsedInstruction.data) break;

        const program = parsedInstruction.programId.toBase58();

        //
        if (program == SOLANART_PROGRAM_PUBKEY.toBase58() && parsedInstruction.data.indexOf('54') == 0) {
          console.log(`--> Solanart NFT Sale - ${price} : ${time}`);
          market = 'solanart';
          break;
        } else if (program == MAGIC_EDEN_PROGRAM_PUBKEY.toBase58() && parsedInstruction.data.indexOf('3UjL') == 0) {
          console.log(`--> MagicEden NFT Sale - ${price} : ${time}`);
          market = 'magiceden';
          break;
        } else if (program == DIGITALEYES_PROGRAM_PUBKEY.toBase58() && parsedInstruction.data.indexOf('jz') == 0) {
          console.log(`--> DigitalEye NFT Sale - ${price} : ${time}`);
          market = 'digitaleye';
          break;
        } else if (program == DIGITALEYES_DIRECTSELL_PROGRAM_PUBKEY.toBase58() && parsedInstruction.data.indexOf('xc') == 0) {
          console.log(`--> DigitalEye NFT Direct Sale - ${price} : ${time}`);
          market = 'digitaleye';
        } else if (program == EXCHANGE_PROGRAM_PUBKEY.toBase58() && parsedInstruction.data.indexOf('jzD') == 0) {
          console.log(`--> ExchangeArt NFT Sale - ${price} : ${time}`);
          market = 'exchange';
        } else if (program == SOLSEA_PROGRAM_PUBKEY.toBase58() && parseInt(parsedInstruction.data, 16) > 234) {
          console.log(`--> Solsea NFT Sale - ${price} : ${time}`);
          market = 'solsea';
        } else {
          continue;
        }

      }

    }

    purchaseInfo.push({
      mint: holderAccount[i].mint,
      projectname: holderAccount[i].projectname,
      collectionname: holderAccount[i].collectionname,
      familyname: holderAccount[i].familyname,
      nftname: holderAccount[i].nftname,
      image: holderAccount[i].image,
      symbol: holderAccount[i].symbol,
      url: holderAccount[i].url,
      account: holderAccount[i].account,
      price: price == 0 ? '' : price,
      time: time == '' ? '' : time,
      market: market != '' ? market : '',

    });

  }
  console.log('', purchaseInfo.length);

  return (purchaseInfo);

}

/**
 * Get Purchase Price from signature
 * @param sig The signature of trasction
 * @param wallet The address of wallet
 * @param connection The solana web3 connection object
 * @returns The price of purchase or mint as sol
 */
const getPriceInfo = async (sig: string, wallet: string, connection: Connection) => {
  const parsedTrxDatas = await connection.getParsedConfirmedTransaction(sig, 'finalized');
  if (parsedTrxDatas == null) return false;

  let parsedData = parseTransactionData(parsedTrxDatas, sig);
  let transaferData = [], purchaser = '', price = 0;

  // Find mintAuthority and sol transfer
  for (const ins of parsedData.transaction.message.instructions) {
    if (ins.program == 'system' && ins.parsed.type == 'transfer') {
      if (ins.parsed.info.lamports % 10000 != 0) continue;
      transaferData.push(ins.parsed.info);
    }
    if (ins.program == 'spl-token' && ins.parsed.type == 'mintTo') {
      purchaser = ins.parsed.info.mintAuthority;
    }
  }

  // Find sol transfer for trade
  for (const ins of parsedData.meta.innerInstructions) {
    for (const innerIns of ins.instructions) {
      if (innerIns.program == 'system' && innerIns.parsed.type == 'transfer') {
        if (innerIns.parsed.info.lamports % 10000 != 0) continue;
        transaferData.push(innerIns.parsed.info);
      }
    }
  }

  // Sum all transfer amount for revenure royalties
  for (const data of transaferData)
    if (data.source == wallet || data.source == purchaser)
      price += data.lamports;

  console.log(`--> Parsed price: ${purchaser} - ${price / DEFAULT_SOL}`);
  return price / DEFAULT_SOL;
}

/**
 * Convert all PublicKeys in the transactions data as base58 string
 * @param raw Pared transaction data to convert
 * @param sig Will add the signature of this transaction in parsed data struct
 * @returns Formated transaction data
 */
export const parseTransactionData = (raw: ParsedConfirmedTransaction | null, sig: string) => {
  let parsedData = raw as any;
  parsedData.signature = sig;

  // Parse innerInstruction accounts
  let newInnerIns = [];
  for (const innerIns of raw?.meta?.innerInstructions ?? []) {
    let newIns = [];
    for (const ins of innerIns.instructions) {
      let newData = ins as any;
      newData.programId = ins.programId.toBase58();
      if (newData.accounts) {
        let newAccounts = [];

        // Convert innerInstructions account pubkey as string
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

  // Convert transaction account pubkeys as string
  for (const account of newTransaction?.message.accountKeys ?? [])
    newAccountKeys.push({
      ...account,
      pubkey: account.pubkey.toBase58(),
    })

  // Convert the account pubkeys in innerInstructions as string
  let newInstructions = [];
  for (const ins of newTransaction?.message.instructions) {
    let newIns = ins as any;
    if (newIns.accounts) {
      let newInsAccounts = [];
      for (const account of newIns.accounts as any) newInsAccounts.push(account.toBase58());
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

// Reduce the zero byte from parsed account metadata and convert creator address as string
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
  for (const creator of meta.data.creators ?? []) {
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

// Build the rpcRequest to get program account
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
  if (!fs.existsSync(cPath)) fs.mkdirSync(cPath, { recursive: true });
  switch (dumpType) {
    default:
      return path.join(cPath, dumpType);
  }
}