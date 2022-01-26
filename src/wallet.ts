import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, LAMPORTS_PER_SOL, PartiallyDecodedInstruction, PublicKey, ParsedConfirmedTransaction } from "@solana/web3.js";
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
  SOLANA_TRX_FEE, SOLSEA_PROGRAM_PUBKEY,

} from './config/constant';
import axios from "axios";
import { Data } from "@nfteyez/sol-rayz/dist/config/metaplex";
/**
 * Determine NFTs on wallet
 * 
 * Fetch only metadata for each NFT. Price and related transaction info is excepted
 * @param address Wallet address to determine
 * @returns Fetched NFT Accounts with data
 */
export const fetchWalletForNFTs = async (address: string, page: number) => {
  const wallet = new PublicKey(address);
  const connection = new Connection(SOLANA_MAINNET, "confirmed");
  const nftAccounts = await getParsedNftAccountsByOwner({ publicAddress: wallet, connection: connection });
  console.log(`\n${nftAccounts.length} nfts determined from this wallet`);

  // Reduce nftInfos by pagination
  if (nftAccounts.length < page * 10) return {
    total: nftAccounts.length,
    page,
    nfts: []
  };
  let start = page * 10, end: number | undefined = (page + 1) * 10;
  if (end > nftAccounts.length) end = undefined;
  let processingAccounts = nftAccounts.sort((nft_a, nft_b) => { return nft_a.mint > nft_b.mint ? 1 : -1 }).slice(start, end);
  console.log(processingAccounts.map((nft) => nft.mint));

  // Get all token accounts of wallet to get the Token Account for particular mint
  const walletTokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet, { programId: TOKEN_PROGRAM_ID });
  const holderAccount = walletTokenAccounts.value.map(token => {
    return {
      mint: token.account.data.parsed.info.mint,
      account: token.pubkey.toBase58(),
    }
  });

  // Track purchased data parallel
  let result: any[] = [];
  await Promise.allSettled(
    processingAccounts.map(nft => {
      return new Promise(async (resolve, reject) => {
        const purchaseInfo = await trackPurchasedData(address, holderAccount.filter(holder => holder.mint == nft.mint)[0].account);
        result.push({
          ...nft,
          purchase: purchaseInfo,
        });
        resolve(true);
      });
    })
  );

  return ({
    total: nftAccounts.length,
    page,
    nfts: result,
  });
}

/**
 * Get the purchased info for particular nft in wallet
 * @param address user wallet address
 * @param mint nft mint address
 * @returns purchase price and date
 */
export const fetchOnlyPurchaseInfo = async (address: string, mint: string) => {
  const connection = new Connection(SOLANA_MAINNET, "confirmed");

  const nftAccounts = await getParsedNftAccountsByOwner({ publicAddress: new PublicKey(address), connection: connection });

  const walletTokenAccounts = await connection.getParsedTokenAccountsByOwner(new PublicKey(address), { programId: TOKEN_PROGRAM_ID });
  console.log(walletTokenAccounts.value[0].account.data.parsed);
  var holderAccountTemp = [];
  for (let i = 0; i < walletTokenAccounts.value.length; i++) {
    for (let j = 0; j < nftAccounts.length; j++) {
      if (walletTokenAccounts.value[i].account.data.parsed.info.mint === nftAccounts[j].mint) {
        holderAccountTemp.push({
          mint: nftAccounts[j].mint,
          account: walletTokenAccounts.value[i].pubkey.toBase58(),
          nftname: nftAccounts[j].data.name,
          nftsymbol: nftAccounts[j].data.symbol,
          nfturi: nftAccounts[j].data.uri,
        });
        break;
      }
    }
  }

  var purchaseInfo = [];

  for (let i = 0; i < holderAccountTemp.length; i++) {
    let onepurchaseInfo = { price: '', time: '', market: '', mint: '', nftname: '', nftsymbol: '', nfturi: '', account: '' };
    let onepurchaseInfotemp = await trackPurchasedData(address, holderAccountTemp[i].account);
    if (onepurchaseInfotemp !== null && onepurchaseInfotemp !== undefined) {
      onepurchaseInfo.price = onepurchaseInfotemp.price.toString();
      onepurchaseInfo.time = onepurchaseInfotemp.time;
      onepurchaseInfo.market = onepurchaseInfotemp.market;
      onepurchaseInfo.mint = holderAccountTemp[i].mint;
      onepurchaseInfo.nftname = holderAccountTemp[i].nftname;
      onepurchaseInfo.nftsymbol = holderAccountTemp[i].nftsymbol;
      onepurchaseInfo.nfturi = holderAccountTemp[i].nfturi;
      onepurchaseInfo.account = holderAccountTemp[i].account;
      purchaseInfo.push(onepurchaseInfo);
    } else {
      onepurchaseInfo.price = 'unknown';
      onepurchaseInfo.time = 'unknown';
      onepurchaseInfo.market = 'unknown';
      onepurchaseInfo.mint = holderAccountTemp[i].mint;
      onepurchaseInfo.nftname = holderAccountTemp[i].nftname;
      onepurchaseInfo.nftsymbol = holderAccountTemp[i].nftsymbol;
      onepurchaseInfo.nfturi = holderAccountTemp[i].nfturi;
      onepurchaseInfo.account = holderAccountTemp[i].account;
      purchaseInfo.push(onepurchaseInfo);
    }
  }

  return ({
    purchase: purchaseInfo,
  });
}

type CustomPartiallyDecodedInstruction = {
  /** Program id called by this instruction */
  programIdIndex: number;
  /** Public keys of accounts passed to this instruction */
  accounts: Array<PublicKey>;
  /** Raw base-58 instruction data */
  data: string;
}


/**
 * Track related transactions with the holder account of particular nft for this wallet
 * @param address user wallet address
 * @param holder nft holding account address
 * @returns purchase info or undefined
 */
const trackPurchasedData = async (address: string, holder: string): Promise<{
  price: number,
  time: string,
  market: string,
} | undefined> => {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(`  -> Start purchase track for ${holder}`);
      const connection = new Connection(SOLANA_MAINNET, "confirmed");
      let sigs = await connection.getSignaturesForAddress(new PublicKey(holder), { limit: 10 });
      const sigList = sigs.filter((sig) => sig.err == null).map((info) => {
        return info.signature;
      });
      console.log(`  -> ${sigList.length} sigs are fetched`);

      if (sigList.length == 0) {
        resolve(undefined);
        return undefined;
      }

      for (let i = 0; i < sigList.length; i++) {
        const res = await axios.post(SOLANA_MAINNET, {
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          "params": [
            sigList[i],
            "json"
          ]
        });


        const trx = res?.data.result;
        const signer = new PublicKey(trx?.transaction.message.accountKeys[0]).toBase58();
        if (signer != address) continue;

        (trx?.transaction.message.instructions as CustomPartiallyDecodedInstruction[]).map((transaction) => {
          const parsedTrx = transaction;
          if (!parsedTrx || !parsedTrx.data || !trx.meta) return;
          const price = (trx.meta?.preBalances[0] - trx.meta?.postBalances[0] - SOLANA_TRX_FEE) / LAMPORTS_PER_SOL;
          if (price < 0.005) return;

          const time = (new Date((trx.blockTime ?? 0) * 1000)).toLocaleString();
          const program = new PublicKey(trx?.transaction.message.accountKeys[transaction.programIdIndex]).toBase58();
          let result = {
            price,
            time,
            market: '',
          };

          if (program == MAGIC_EDEN_PROGRAM_PUBKEY.toBase58() && parsedTrx.data.indexOf('3UjL') == 0) {
            console.log(`--> MagicEden NFT Sale - ${price} : ${time}`);
            result.market = 'magiceden';
          } else if (program == SOLSEA_PROGRAM_PUBKEY.toBase58() && parseInt(parsedTrx.data, 16) > 234) {
            console.log(`--> Solsea NFT Sale - ${price} : ${time}`);
            result.market = 'solsea';
          } else if (program == DIGITALEYES_PROGRAM_PUBKEY.toBase58() && parsedTrx.data.indexOf('jz') == 0) {
            console.log(`--> DigitalEye NFT Sale - ${price} : ${time}`);
            result.market = 'digitaleye';
          } else if (program == DIGITALEYES_DIRECTSELL_PROGRAM_PUBKEY.toBase58() && parsedTrx.data.indexOf('xc') == 0) {
            console.log(`--> DigitalEye NFT Direct Sale - ${price} : ${time}`);
            result.market = 'digitaleye';
          } else if (program == SOLANART_PROGRAM_PUBKEY.toBase58() && parsedTrx.data.indexOf('54') == 0) {
            console.log(`--> Solanart NFT Sale - ${price} : ${time}`);
            result.market = 'solanart';
          } else if (program == EXCHANGE_PROGRAM_PUBKEY.toBase58() && parsedTrx.data.indexOf('jzD') == 0) {
            console.log(`--> ExchangeArt NFT Sale - ${price} : ${time}`);
            result.market = 'exchange';
          } else {
            // return;
            console.log(`--> unknown market NFT Sale - ${price} : ${time}`);
            result.market = 'unknown';
          }

          console.log(result);
          resolve(result);
          return;
        });

      }

      resolve(undefined);
    } catch (e) {
      console.log(e);
      resolve(undefined);
    }
  })
};


/**
 * Track related transactions with the holder account of particular nft for this wallet
 * @param address user wallet address
 * @param holder nft holding account address
 * @returns purchase info or undefined
 */
const trackPurchasedDatas = async (address: string): Promise<{
  price: number,
  time: string,
  market: string,
} | undefined> => {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(`  -> Start purchase track for ${address}`);

      const connection = new Connection(SOLANA_MAINNET, "confirmed");

      let sigs = await connection.getSignaturesForAddress(new PublicKey(address), { limit: 10 });
      const sigList = sigs.filter((sig) => sig.err == null).map((info) => {
        return info.signature;
      });
      console.log(`  -> ${sigList.length} sigs are fetched`);

      if (sigList.length == 0) {
        resolve(undefined);
        return undefined;
      }
      console.log('---------------request transaction ------------>');
      for (let i = 0; i < sigList.length; i++) {
        const res = await axios.post(SOLANA_MAINNET, {
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          "params": [
            sigList[i],
            "json"
          ]
        });
        const trx = res?.data.result;
        const signer = new PublicKey(trx?.transaction.message.accountKeys[0]).toBase58();
        if (signer != address) continue;
        (trx?.transaction.message.instructions as CustomPartiallyDecodedInstruction[]).map((transaction) => {
          const parsedTrx = transaction;
          if (!parsedTrx || !parsedTrx.data || !trx.meta) return;
          const price = (trx.meta?.preBalances[0] - trx.meta?.postBalances[0] - SOLANA_TRX_FEE) / LAMPORTS_PER_SOL;
          if (price < 0.005) return;
          const time = (new Date((trx.blockTime ?? 0) * 1000)).toLocaleString();
          const program = new PublicKey(trx?.transaction.message.accountKeys[transaction.programIdIndex]).toBase58();
          let result = {
            price,
            time,
            market: '',
          };
          if (program == DIGITALEYES_PROGRAM_PUBKEY.toBase58() && parsedTrx.data.indexOf('jz') == 0) {
            console.log(`--> DigitalEye NFT Sale - ${price} : ${time}`);
            result.market = 'digitaleye';
          } else if (program == DIGITALEYES_DIRECTSELL_PROGRAM_PUBKEY.toBase58() && parsedTrx.data.indexOf('xc') == 0) {
            console.log(`--> DigitalEye NFT Direct Sale - ${price} : ${time}`);
            result.market = 'digitaleye';
          } else if (program == SOLANART_PROGRAM_PUBKEY.toBase58() && parsedTrx.data.indexOf('54') == 0) {
            console.log(`--> Solanart NFT Sale - ${price} : ${time}`);
            result.market = 'solanart';
          } else if (program == EXCHANGE_PROGRAM_PUBKEY.toBase58() && parsedTrx.data.indexOf('jzD') == 0) {
            console.log(`--> ExchangeArt NFT Sale - ${price} : ${time}`);
            result.market = 'exchange';
          } else if (program == MAGIC_EDEN_PROGRAM_PUBKEY.toBase58() && parsedTrx.data.indexOf('3UjL') == 0) {
            console.log(`--> MagicEden NFT Sale - ${price} : ${time}`);
            result.market = 'magiceden';
          } else if (program == SOLSEA_PROGRAM_PUBKEY.toBase58() && parseInt(parsedTrx.data, 16) > 234) {
            console.log(`--> Solsea NFT Sale - ${price} : ${time}`);
            result.market = 'solsea';
          } else {
            return;
          }
          resolve(result);
          return;
        });

      }

      resolve(undefined);
    } catch (e) {
      console.log(e);
      resolve(undefined);
    }
  })
};
