import { Connection, LAMPORTS_PER_SOL, ParsedInnerInstruction, ParsedInstruction, PartiallyDecodedInstruction } from '@solana/web3.js';
import axios from 'axios';
import { Server } from 'socket.io';
import {
    isAttachingListener,
    MAGIC_EDEN_PROGRAM_PUBKEY,
    MEMO_V2_PROGRAM_PUBKEY,
    setAttachingListener,
    sleep,
    SOLANART_PROGRAM_PUBKEY,
    SOLANA_MAINNET_SERUM,
    SOLANA_TRX_FEE,
} from './config/constant';
import { loadDump, saveDump } from './util';

/// Solanart info fetching through API

const getCollectionInfoSolanart = () => {
    return new Promise((resolve) => {
        axios.get(`https://qzlsklfacc.medianetwork.cloud/query_volume_all`).then((res) => res.data).then((res) => {
            resolve(res.map((info: any) => {
                return {
                    collection: info.collection,
                    floorPrice: info.floorPrice,
                }
            }));
        }).catch(() => resolve([]));
    });
};

const updateSolanartFloorPrices = async () => {
    return new Promise(async (resolve, reject) => {
        console.log('--> Start fetching Solanart FloorPrice for all collection');
        let newInfos = loadDump(`/solanart/floor_prices.json`), i = 0, start_time = Math.floor(Date.now() / 1000);
        if (!newInfos) newInfos = {};
        for (const name of Object.keys(newInfos)) {
            if (start_time - 60 < newInfos[name].last_updated) {
                i++;
                continue;
            }
            axios.get(`https://qzlsklfacc.medianetwork.cloud/get_floor_price?collection=${name}`).then(res => res.data).then(data => {
                if (!data) return;
                newInfos[name] = {
                    price: data.floorPrice,
                    last_updated: Math.floor(Date.now() / 1000),
                };
                saveDump(`/solanart/floor_prices.json`, newInfos);
                i++;
            }).catch((e) => {
                i++;
            }).finally(() => {
                if (i == Object.keys(newInfos).length) {
                    console.log('--> Fetched Solanart FloorPrice for all collection');
                    resolve(true);
                }
            });
            await sleep(100);
        }
    })
};

/// MagicEden info fetching through API
const getCollectionInfoMagicEden = (last_time: number, listing: boolean) => {
    return new Promise(async (resolve) => {
        try {
            const query = decodeURI(escape(JSON.stringify({
                $match: {
                    txType: listing ? 'initializeEscrow' : 'cancelEscrow',
                    blockTime: {$gt: last_time},
                },
                $sort: {
                    blockTime: -1
                },
            })));
            axios.get(`https://api-mainnet.magiceden.io/rpc/getGlobalActivitiesByQuery?q=${query}`).then((res) => res.data)
            .then((res) => {
                resolve (res.results.map((result: any) => {
                    return {
                        ...result.parsedList,
                        ...result.parsedUnlist,
                        blockTime: result.blockTime,
                    }
                }));
            }).catch(() => resolve([]));
        } catch (e) {
            console.log('--> Error fetching new Listing from MagicEden ', (new Date(last_time * 1000)).toLocaleString());
            resolve([]);
        }
    });
};

const getFloorPricesMagicEden = async (collections?: string[]) => {
    if (!collections || collections.length == 0) {
        return [];
    }
    return new Promise(async (resolve, reject) => {
        let cnt = 1, result: any[] = [];
        await Promise.allSettled(
            collections.map(async (name: any) => {
                try {
                    const ret: any = await axios.get(`https://api-mainnet.magiceden.io/rpc/getCollectionEscrowStats/${name}`);
                    result.push({
                        collection: name,
                        price: ret.data.results.floorPrice / LAMPORTS_PER_SOL,
                    })
                    cnt++;
                } catch (e) {
                    console.log(`   ${cnt++}: Error get floorPrice  ${name} from Magiceden`);
                }
            })
        );
        resolve(result);
    });
}

const checkMagicEdenFloorPrices = async (collections: string[]) => {
    const reply = loadDump(`/magiceden/floor_prices.json`);
    let result = !reply ? {} : reply;
    for (let i = 0; i < collections.length; i++) {
        let name = collections[i];
        if (result[name]) continue;
        const start_time = Math.floor(Date.now() / 1000);
        const data: any = await getFloorPricesMagicEden([name]);
        if (data.length == 0) {
            console.log(`     ${i+1}: error all fetching for ${name} collection from MagicEden`);
            continue;
        }
        result[name] = {
            price: data[0].price,
            last_updated: start_time,
        }
        saveDump(`/magiceden/floor_prices.json`, result);
        console.log(`     ${i+1}: all fetching ${data[0].price}: ${name} collection from MagicEden`);
        await sleep(200);
    }
};

const getNFTInfoFromMagicEden = (nft: string) => {
    return new Promise((resolve) => {
        axios.get(`https://api-mainnet.magiceden.io/rpc/getNFTByMintAddress/${nft}`).then((res) => res.data.results)
        .then((data: any) => {
            resolve(data);
        }).catch(() => resolve(undefined));
    });
};

/// Alpha info fetching through API
const getFloorPricesAlpha = (collections: string[]) => {
    return new Promise(async (resolve) => {
        console.log(`--> Start Fetching floorPrices ${collections.length} collections from Alpha `, (new Date()).toLocaleString());
        let subNames = [], results = {} as any, cnt = 1;
        for (let i = 0; i < collections.length; i++) {
            subNames.push(collections[i]);
            if (i < collections.length - 1 && i % 100 < 99) {
                continue;
            }
            // let name = collections[i];
            await Promise.allSettled(
                subNames.map(async (name: any) => {
                    try {
                        let start_time = (new Date()).toLocaleString();
                        const ret: any = await axios.get(`https://apis.alpha.art/api/v1/collection/${name}`);
                        if (!ret.data) {
                            console.log(`     ${cnt++}: error fetching for ${name} collection from Alpha`);
                            return;
                        }console.log(ret.data.floorPrice / LAMPORTS_PER_SOL);
                        results[name] = {
                            price: ret.data.floorPrice / LAMPORTS_PER_SOL,
                            last_updated: start_time,
                        }
                        console.log(`     ${cnt++}: fetching ${ret.data.floorPrice / LAMPORTS_PER_SOL}: ${name} collection from Alpha`);
                    } catch (e) {
                        console.log(`     ${cnt++}: error fetching for ${name} collection from Alpha`);
                    };
                })
            );
            subNames = [];
            await sleep(200);
        }
        console.log('--> Fetched all NFTs from Alpha');
        resolve(results);
    });
};

const getFloorPricesDigitalEyes = (collections: string[]) => {
    return new Promise(async (resolve) => {
        console.log(`--> Start Fetching floorPrices ${collections.length} collections from DigitalEyes `, (new Date()).toLocaleString());
        let subNames = [], results = {} as any, cnt = 1;
        for (let i = 0; i < collections.length; i++) {
            subNames.push(collections[i]);
            if (i < collections.length - 1 && i % 100 < 99) {
                continue;
            }
            // let name = collections[i];
            await Promise.allSettled(
                subNames.map(async (name: any) => {
                    try {
                        let start_time = (new Date()).toLocaleString();
                        const ret: any = await axios.get(`https://us-central1-digitaleyes-prod.cloudfunctions.net/offers-retriever?collection=${name}`);
                        if (!ret.data) {
                            console.log(`     ${cnt++}: error fetching for ${name} collection from DigitalEyes`);
                            return;
                        }console.log(ret.data.price_floor / LAMPORTS_PER_SOL);
                        results[name] = {
                            price: ret.data.price_floor / LAMPORTS_PER_SOL,
                            last_updated: start_time,
                        }
                        console.log(`     ${cnt++}: fetching ${ret.data.price_floor / LAMPORTS_PER_SOL}: ${name} collection from DigitalEyes`);
                    } catch (e) {
                        console.log(`     ${cnt++}: error fetching for ${name} collection from DigitalEyes`);
                    };
                })
            );
            subNames = [];
            await sleep(200);
        }
        console.log('--> Fetched all NFTs from DigitalEyes');
        resolve(results);
    });
};

/// Update dump cache and local temp
const getFloorPricesFromDump = (collections: string[], marketplace: string) => {
    let solanartInfos = loadDump(`/solanart/floor_prices.json`);
    let magicedenInfos = loadDump(`/magiceden/floor_prices.json`);
    if (!solanartInfos) solanartInfos = {};
    if (!magicedenInfos) magicedenInfos = {};

    let result: {[collection: string]: {
        price: number,
        last_updated: string,
    }} = {};
    for (const collection of collections) {
        let floorPrice = {
            magiceden: magicedenInfos[collection] ? {price: magicedenInfos[collection].price, updated_time: (new Date(magicedenInfos[collection].last_updated * 1000)).toLocaleString()} : undefined,
            solanart: solanartInfos[collection] ? {price: solanartInfos[collection].price, updated_time: (new Date(solanartInfos[collection].last_updated * 1000)).toLocaleString()} : undefined,
        } as any;
        result[collection] = (!marketplace || !floorPrice[marketplace]) ? floorPrice : {
            price: floorPrice[marketplace].price,
            last_updated: floorPrice[marketplace].updated_time,
        };
    };
    return result;
}

const updateCollectionsInfoSolanart = async () => {
    console.log('--> Start fetching Solanart collections for floorPrice');
    await getCollectionInfoSolanart().then((infos: any) => {
        if (infos.length == 0) return;
        let newInfos = loadDump(`/solanart/floor_prices.json`);
        if (!newInfos) newInfos = {};
        infos.map((info: any) => {
            if (!newInfos || !newInfos[info.collection]) newInfos[info.collection] = {
                price: info.floorPrice,
                last_updated: Math.floor(Date.now() / 1000),
            };
        });
        console.log(`--> Fetched ${Object.keys(newInfos).length} Solanart collections for floorPrice`);
        saveDump(`/solanart/floor_prices.json`, newInfos);
    })
}

const getListingsMagicEden = (nfts: string[]) => {
    return new Promise((resolve, reject) => {
        let result = [] as any, count = 0;
        nfts.forEach((nft) => {
            getNFTInfoFromMagicEden(nft).then((res: any) => {
                if (!res){
                    return;
                }
                result.push(res);
            }).catch((e) => {
            }).finally(() => {
                count++;
            })
        })
        const itvl = setInterval(() => {
            if (count == nfts.length) {
                resolve(result);
                clearInterval(itvl);
            }
        }, 300);
    });
}

/// Extenal interfaces
export const getFloorPrices = async (marketplace: string, collections: string[]) => {
    if (marketplace == 'alpha') return await getFloorPricesAlpha(collections);
    if (marketplace == 'digitaleyes') return await getFloorPricesDigitalEyes(collections);
    if (marketplace == 'magiceden') await checkMagicEdenFloorPrices(collections);
    return getFloorPricesFromDump(collections, marketplace);
}

export const attachCollectionFloorPriceListener = async (io: Server) => {
    let listing = true;
    let lastTime = Math.floor(Date.now() / 1000) - 100;
    
    await updateCollectionsInfoSolanart();
    
    const newFetch = async () => {
        if (!listing) {
            if (Date.now() % 3600 < 60) await updateCollectionsInfoSolanart();
            await updateSolanartFloorPrices();
        }
        console.log('--> Start fetching new Listing from Magiceden for FloorPrice: ', (new Date()).toLocaleString());
        getCollectionInfoMagicEden(lastTime, listing).then((infos: any) => {
            console.log(`--> Fetched ${infos.length} new Listing from Magiceden for FloorPrice`);
            if (infos.length == 0) return;
            console.log('  -> Start fetching updated floorPrices from Magiceden: ', (new Date()).toLocaleString());
            const names = infos.map((info: any) => info.collection_symbol), updated_time = Math.floor(Date.now() / 1000);
            getFloorPricesMagicEden(names.filter((elem: string, pos: number) => {
                return names.indexOf(elem) == pos;
            })).then((results: any) => {
                if (!results || results.length == 0) return;
                const dumpInfo = loadDump(`/magiceden/floor_prices.json`);
                if (!dumpInfo) {
                    let newInfo = {} as any;
                    for (const info of results) newInfo[info.collection] = {
                        price: info.price,
                        last_updated: updated_time,
                    }
                    saveDump(`/magiceden/floor_prices.json`, newInfo);
                } else {
                    let newInfo: {
                        [collection: string]: {
                            price: number,
                            last_updated: number,
                        }
                    } =  dumpInfo;
                    for (const result of results) {
                        if (!newInfo[result.collection] || newInfo[result.collection].last_updated < updated_time) newInfo[result.collection] = {
                            price: result.price,
                            last_updated: updated_time,
                        };
                    }
                    saveDump(`/magiceden/floor_prices.json`, newInfo);
                }
                console.log('  -> Fetched updated floorPrices from Magiceden: ', (new Date()).toLocaleString());
            });
        })

        lastTime += 20;
        listing = !listing;
    };
    newFetch();
    const interval = setInterval(newFetch, 20000);
}

export const addNftListener = async (nfts: string[], offer: boolean, sale: boolean) => {
    if (nfts.length == 0 || (!offer && !sale)) return;
    let listings = [] as any, attachList = nfts.map((nft: string) => {
        return {
            mint: nft,
            token_Add: '',
            escrow_Add: '',
        };
    });
    listings = await getListingsMagicEden(nfts);
    if (listings.length > 0) {
         for (const listing of listings) {
             for (let idx = 0; idx < attachList.length; idx++) {
                if (attachList[idx].mint == listing.mintAddress) {
                    attachList[idx].token_Add = listing.id;
                    attachList[idx].escrow_Add = listing.escrowPubkey;
                    break;
                }
             }
         }
    }
    if (offer)
        setAttachingListener([...isAttachingListener, ...attachList.map((nft: any) => ({
            ...nft,
            event: 'offer',
        }))]);
    if (sale)
        setAttachingListener([...isAttachingListener, ...attachList.map((nft: any) => ({
            ...nft,
            event: 'sale',
        }))]);
}

export const attachMarketEventListener = async (nfts: string[], io: Server) => {
    const connection = new Connection(SOLANA_MAINNET_SERUM, "confirmed");
    let me_related_sigs: any = [], sn_related_sigs: any = [], newActs = [] as any;
    
    await addNftListener(nfts, true, true);
    console.dir(isAttachingListener);
    connection.onLogs(MAGIC_EDEN_PROGRAM_PUBKEY, async (logs, ctx) => {
        me_related_sigs.push(logs.signature);
    });
    
    connection.onLogs(SOLANART_PROGRAM_PUBKEY, async (logs, ctx) => {
        if (logs.logs.indexOf('Program log: Instruction: CreateOffer') != -1 || logs.logs.indexOf('Program log: Instruction: Sell ') != -1)
            sn_related_sigs.push(logs.signature);
    });

    while (isAttachingListener.length != 0) {
        newActs = [];

        const newMETrack = async () => {
            if (me_related_sigs.length == 0) return;
            const sigs = me_related_sigs;
            me_related_sigs = [];
            const trxs = await connection.getParsedConfirmedTransactions(sigs);
            const result = trxs.map((trx, idx) => {
                if (trx?.meta?.err != null) return {ins: ''};
                const instruction = trx?.transaction.message.instructions[0] as PartiallyDecodedInstruction;
                const innerIns = trx?.meta?.innerInstructions as ParsedInnerInstruction[];
                if (!instruction || !innerIns) return {ins: ''};
                return {
                    sig: trx?.transaction.signatures[0],
                    ins: instruction.data,
                    data: innerIns[0].instructions[innerIns[0].instructions.length - 1] as ParsedInstruction,
                    accounts: instruction.accounts,
                    time: trx?.blockTime as number,
                    balance_change: (trx?.meta?.preBalances[0] as number) - (trx?.meta?.postBalances[0] as number),
                    trx: trx?.meta,
                };
            }).filter((value: any) => {
                return value.ins.indexOf('3UjL') == 0 || value.ins.indexOf('kdL8') == 0;
            }).map((value: any) => {
                let mint = 'unknown';
                if (value.ins.indexOf('kdL8') == 0) {
                    const escrow_Add = value.accounts[3].toBase58();
                    for (const listing of isAttachingListener) {
                        if (listing.escrow_Add == escrow_Add) {
                            if (listing.event == 'offer') mint = listing.mint;
                            break;
                        }
                    }
                    return {
                        sig: value.sig,
                        type: 'offer',
                        mint,
                        bidder: value.accounts[0].toBase58(),
                        escrow: escrow_Add,
                        price: value.data.parsed.info.lamports / LAMPORTS_PER_SOL,
                        time: new Date(value.time).getTime(),
                        market: 'magiceden',
                    }
                }
                const token_Add = value.data.parsed.info.account;
                for (const listing of isAttachingListener) {
                    if (listing.token_Add == token_Add) {
                        if (listing.event == 'sale') mint = listing.mint;
                        break;
                    }
                }
                return {
                    sig: value.sig,
                    type: 'sale',
                    mint,
                    buyer: value.accounts[0].toBase58(),
                    account: token_Add,
                    price: (value.balance_change - SOLANA_TRX_FEE) / LAMPORTS_PER_SOL,
                    time: value.time,
                    market: 'magiceden',
                }
            });
            newActs.push(...result.filter((res) => res.mint && res.mint != 'unknown'));
            console.log(`${result.length} new acts fetched from magiceden`);
        };

        await newMETrack();
        await sleep(5000);

        const newSNTrack = async () => {
            if (sn_related_sigs.length == 0) return;
            const sigs = sn_related_sigs;
            sn_related_sigs = [];
            const trxs = await connection.getParsedConfirmedTransactions(sigs);
            const result = trxs.map((trx, idx) => {
                if (trx?.meta?.err != null) return {ins: ''};
                const ins_cnt = trx?.transaction.message.instructions.length as number;
                const ins = trx?.transaction.message.instructions[ins_cnt - 1] as any;
                if (!ins) return {ins: ''};
                if (ins.programId.toString() == MEMO_V2_PROGRAM_PUBKEY.toBase58()) {
                    const info = JSON.parse(ins.parsed);
                    let mint = 'unknown';
                    for (const listing of isAttachingListener) {
                        if (listing.mint == info.token_add) {
                            mint = info.token_add;
                            break;
                        }
                    }
                    return {
                        sig: trx?.transaction.signatures[0],
                        type: 'sale',
                        mint,
                        price: info.price_sol,
                        buyer: trx?.transaction.message.accountKeys[0].pubkey.toBase58(),
                        time: trx?.blockTime as number,
                        market: 'solanart',
                    };    
                } else {
                    const innerIns = trx?.meta?.innerInstructions as ParsedInnerInstruction[];
                    const instruction = innerIns[innerIns.length - 1].instructions as ParsedInstruction[];
                    const price = instruction[instruction.length - 1].parsed.info.lamports / LAMPORTS_PER_SOL;
                    const token = (ins as PartiallyDecodedInstruction).accounts[4].toBase58();
                    let mint = 'unknown';
                    for (const listing of isAttachingListener) {
                        if (listing.mint == token) {
                            mint = token;
                            break;
                        }
                    }
                    return {
                        sig: trx?.transaction.signatures[0],
                        type: 'offer',
                        mint,
                        price,
                        offer: trx?.transaction.message.accountKeys[0].pubkey.toBase58(),
                        time: trx?.blockTime as number,
                        market: 'solanart',
                    };    
                }
            });
            newActs.push(...result.filter((res) => res.mint && res.mint != 'unknown'));
            console.log(`${result.length} new acts fetched from solanart`);
        };
        await newSNTrack();

        console.dir(newActs, {depth: null});
        console.log('---------');
        io.emit('new_acts', {
            new_actions: newActs,
        });

        await sleep(3000);
    }
}