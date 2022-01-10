import { Connection, LAMPORTS_PER_SOL, ParsedInnerInstruction, ParsedInstruction, PartiallyDecodedInstruction } from '@solana/web3.js';
import axios from 'axios';
import { Server } from 'socket.io';
import { isAttachingListener, MAGIC_EDEN_PROGRAM_PUBKEY, setAttachingListener, SOLANA_MAINNET, SOLANA_TRX_FEE } from './config/constant';
import { loadDump, saveDump } from './wallet';

const getHistorySolanart = (collection: string) => {
    return new Promise((resolve) => {
        axios.get(`https://qzlsklfacc.medianetwork.cloud/all_sold_per_collection_day?collection=${collection}`).then((res) => res.data).then((res) => {
            resolve(res);
        }).catch(() => resolve([]));
    });
};

const getListingSolanart = (collection: string, page: number) => {
    return new Promise((resolve) => {
        axios.get(`https://qzlsklfacc.medianetwork.cloud/get_nft?collection=${collection}&page=${page}&limit=100&order=&fits=any&trait=&search=&min=0&max=0&listed=true&ownedby=&attrib_count=&bid=all`).then((res) => {
            resolve(res.data);
        }).catch(() => resolve([]));
    });
};

const getCollectionInfoSolanart = (collection: string) => {
    return new Promise((resolve) => {
        axios.get(`https://qzlsklfacc.medianetwork.cloud/get_floor_price?collection=${collection}`).then((res) => res.data).then((res) => {
            resolve([res.floorPrice]);
        }).catch(() => resolve([]));
    });
};

const getCollectionInfoMagicEden = (collection: string) => {
    return new Promise((resolve) => {
        axios.get(`https://api-mainnet.magiceden.io/rpc/getCollectionEscrowStats/${collection}`).then((res) => res.data.results)
        .then((data: any) => {
            resolve([data.floorPrice / LAMPORTS_PER_SOL]);
        }).catch(() => resolve([]));
    });
};

const getListingMagicEden = (collection: string) => {
    return new Promise((resolve) => {
        const query = decodeURI(escape(JSON.stringify({
            $match: {
                collectionSymbol: collection
            },
            $sort:  {
                createdAt: -1
            },
            $skip: 0,
        })));
        axios.get(`https://api-mainnet.magiceden.io/rpc/getListedNFTsByQuery?q=${query}`).then((res) => res.data.results)
        .then((data: any) => {
            resolve(data);
        }).catch(() => resolve([]));
    });
};

const fetchMagicEdenNFT = (pubkey: string) => {
    return new Promise((resolve) => {
        const query = decodeURI(escape(JSON.stringify({
            $match: {
                escrowPubkey: pubkey
            },
            $sort:  {
                createdAt: -1
            },
            $skip: 0,
            $limit: 10
        })));
        axios.get(`https://api-mainnet.magiceden.io/rpc/getBiddingsByQuery?q=${query}`).then((res) => res.data)
        .then((data: any) => {
            resolve(data.results);
        }).catch(() => resolve([]));
    });
}

const getHistoryMagicEden = (collection: string) => {
    return new Promise((resolve) => {
        const query = decodeURI(escape(JSON.stringify({
            $match: {
                collection_symbol: collection,
                txType: 'exchange'
            },
            $sort: {
                blockTime: -1
            },
            $skip: 0,
            $limit: 10
        })));
        axios.get(`https://api-mainnet.magiceden.io/rpc/getGlobalActivitiesByQuery?q=${query}`).then((res) => res.data)
        .then((res) => {
            resolve(res.results);
        }).catch(() => resolve([]));
    });
}

export const fetchCollectionFloorPrices = async (listings: string[]) => {
    if (listings.length == 0) return [];
    return new Promise ((resolve, reject) => {
        const results: { [x: string]: {magiceden: number, solanart: number}} = {};
        let count = 0;
        listings.forEach((collection) => {
            console.log(`---> Start synchronize for ${collection} from MagicEden`);
            
            getCollectionInfoMagicEden(collection).then((floorPrice: any) => {
                if (!floorPrice.length) {
                    count++;
                    return;
                }
                // console.log(`${collection}: ${floorPrice[0]}`);
                results[collection] = {
                    ...results[collection],
                    magiceden: floorPrice[0],
                };
                count++;
            }).catch((e) => {
                console.log(e);
                count++;
            });

            getCollectionInfoSolanart(collection).then((floorPrice: any) => {
                if (!floorPrice.length) {
                    count++;
                    return;
                }
                // console.log(`${collection}: ${floorPrice[0]}`);
                results[collection] = {
                    ...results[collection],
                    solanart: floorPrice[0],
                };
                count++;
            }).catch((e) => {
                console.log(e);
                count++;
            });

        });

        const interval = setInterval(() => {
            if (count == listings.length * 2) {
                resolve(results);
                clearInterval(interval);
            }
        }, 300);
    });
}

export const checkNewOffers = (listings: string[]) => {
    return new Promise((resolve, reject) => {
        if (listings.length == 0) resolve([]);
        let result = [] as any, count = 0;
        listings.forEach(async (collection) => {
            console.log(`---> Start synchronize for ${collection} from MagicEden`);
            const latestOffer = loadDump(`/magiceden/last_offers_magiceden_${collection}`);
                    
            getListingMagicEden(collection).then((listings: any) => {
                console.log(`---> Fetched Listings for ${collection} from MagicEden`);
                if (!listings.length){
                    count++;
                    return;
                }
                const list = listings.map((res: any) => res.escrowPubkey);                
                let index = 0, newOffers = [] as any;

                list.reverse().forEach((pubkey: string) => {
                    fetchMagicEdenNFT(pubkey).then((res: any) => {
                        if (res.length > 0) {
                            for (const data of res)
                                newOffers.push(data);
                        }
                        index++;
                    }).catch((e) => {
                        index++;
                    });
                });
                const itvl = setInterval(() => {console.log(index);
                    if (index == list.length) {
                        console.log(`---> Fetched New Offers for ${collection} from MagicEden`);
                        const sortedOffers = newOffers
                        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                        if (sortedOffers.length > 0) {
                            const newOffers = sortedOffers
                            .filter((e: any) => new Date(e.createdAt).getTime() > latestOffer || !latestOffer);
            
                            if (new Date(sortedOffers[0].createdAt).getTime() > latestOffer || !latestOffer) {
                                saveDump(`/magiceden/last_offers_magiceden_${collection}`, new Date(sortedOffers[0].createdAt).getTime());
                            }

                            for (const data of newOffers)
                                result.push({
                                    collection,
                                    escrow: data.escrowPubkey,
                                    buyer: data.bidderPubkey,
                                    seller: data.initializerKey,
                                    bid_price: data.bidderAmountLamports / LAMPORTS_PER_SOL,
                                    market: 'magiceden',
                                });
                        }
                        count++;
                        clearInterval(itvl);
                    }
                }, 200);
            }).catch(e => {
                console.log(e);
                count++;
            });

            console.log(`---> Start synchronize for ${collection} from Solanart`);
            const latestOffers = loadDump(`/solanart/last_offers_solanart_${collection}`);
            let offerResults = [] as any, page = 0;
            while (1) {
                try {
                    const response: any = await getListingSolanart(collection, page);
                    const offers = response.items
                    .filter((offer: any) => offer.currentBid != null);
                    offerResults.push(...offers)
                    if (response.pagination.currentPage == response.pagination.maxPages) {
                        console.log(`---> Fetched for ${collection} from Solanart`);
                        const newOffers = offerResults.filter((offer: any) => {
                            if (!latestOffers) return true;
                            for (const listing of latestOffers) {
                                if (listing.id == offer.id) {
                                    if (listing.bidder_address != offer.bidder_address || listing.currentBid != offer.currentBid) return true;
                                    return false;
                                }
                            }
                            return true;
                        });
                        result.push(...newOffers.map((offer: any) => {
                            return {
                                collection: offer.type,
                                escrow: offer.escrowAdd,
                                buyer: offer.bidder_address,
                                seller: offer.seller_address,
                                bid_price: offer.currentBid,
                                market: 'solanart',
                            }
                        }));
                        count++;
                        saveDump(`/solanart/last_offers_solanart_${collection}`, offerResults);
                        break;
                    }
                    page++;
                } catch (error) {
                    console.log(error);
                    count++;
                }
            }

        });
        
        const interval = setInterval(() => {
            if (count == listings.length * 2) {
                saveDump(`/last_offers_result`, result);
                resolve(result);
                clearInterval(interval);
            }
        }, 200);
    });
};

export const checkNewSales = (listings: string[]) => {
    return new Promise((resolve, reject) => {
        if (listings.length == 0) resolve([]);
        let result = [] as any, count = 0;
        listings.forEach((collection) => {
            console.log(`---> Start synchronize for ${collection} from MagicEden`);
            const latestSale = loadDump(`/magiceden/last_sales_magiceden_${collection}`);
            
            getHistoryMagicEden(collection).then((events: any) => {
                console.log(`---> Fetched for ${collection} from MagicEden`);
                count++;
                const sortedEvents = events
                .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                if (!sortedEvents.length) return;
                const newEvents = sortedEvents
                .filter((e: any) => new Date(e.createdAt).getTime() > latestSale || !latestSale);

                if (new Date(sortedEvents[0].createdAt).getTime() > latestSale || !latestSale) {
                    saveDump(`/magiceden/last_sales_magiceden_${collection}`, new Date(sortedEvents[0].createdAt).getTime());
                }
                (latestSale ? newEvents.reverse() : sortedEvents).forEach(async (event: any) => {
                    if (!event.parsedTransaction) return;

                    const nft = event.parsedTransaction;
                    result.push({
                        collection,
                        mint: nft.mint,
                        buyer: nft.buyer_address,
                        seller: nft.seller_address,
                        price: nft.total_amount / LAMPORTS_PER_SOL,
                        time: event.createdAt,
                        market: event.source,
                    });
                });

            }).catch(e => {
                console.log(e);
                count++;
            });

            console.log(`---> Start synchronize for ${collection} from Solanart`);
            
            const latestSaleArt = loadDump(`/solanart/last_sales_solanart_${collection}`);
            
            getHistorySolanart(collection).then((events: any) => {
                console.log(`---> Fetched for ${collection} from Solanart`);
                count++;
                const sortedEvents = events
                    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                if (!sortedEvents.length) return;
                const newEvents = sortedEvents
                .filter((e: any) => new Date(e.date).getTime() > latestSaleArt || !latestSaleArt);

                if (new Date(sortedEvents[0].date).getTime() > latestSaleArt || !latestSaleArt) {
                    saveDump(`/solanart/last_sales_solanart_${collection}`, new Date(sortedEvents[0].date).getTime());
                }

                (latestSaleArt ? newEvents.reverse() : sortedEvents).forEach(async (event: any) => {
                    result.push({
                        collection,
                        mint: event.token_add,
                        buyer: event.buyerAdd,
                        seller: event.seller_address,
                        price: event.price,
                        time: event.date,
                        market: 'solanart',
                    });
                });
            }).catch(e => {
                console.log(e);
                count++;
            });
        });

        const interval = setInterval(() => {
            if (count == listings.length * 2) {
                saveDump(`/last_sales_result`, result);
                resolve(result);
                clearInterval(interval);
            }
        }, 200);
    })
};

const getListingsMagicEden = (collections: string[]) => {
    return new Promise((resolve, reject) => {
        let result = [] as any, count = 0;
        collections.forEach((collection) => {
            getListingMagicEden(collection).then((res: any) => {
                if (!res.length){
                    return;
                }
                result.push(...res);
            }).catch((e) => {
            }).finally(() => {
                count++;
            })
        })
        const itvl = setInterval(() => {
            if (count == collections.length) {
                resolve(result);
                clearInterval(itvl);
            }
        }, 300);
    });
}

export const attachMarketEventListener = async (collections: string[], io: Server) => {
    const connection = new Connection(SOLANA_MAINNET, "confirmed");
    let related_sigs: any = [], listings = [] as any, newActs = [] as any;
    connection.onLogs(MAGIC_EDEN_PROGRAM_PUBKEY, async (logs, ctx) => {
        related_sigs.push(logs.signature);
    });

    listings = await getListingsMagicEden(collections);
    setAttachingListener(true);

    while (isAttachingListener) {
        const newTrack = async () => {
            if (related_sigs.length == 0) return;
            const sigs = related_sigs;
            related_sigs = [];
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
                let collection = 'unknown', seller = 'unknown', mint = 'unknown';
                if (value.ins.indexOf('kdL8') == 0) {
                    const escrow_Add = value.accounts[3].toBase58();
                    for (const listing of listings) {
                        if (listing.escrowPubkey == escrow_Add) {
                            collection = listing.collectionName;
                            mint = listing.mintAddress;
                            seller = listing.owner;
                            break;
                        }
                    }
                    return {
                        sig: value.sig,
                        type: 'offer',
                        collection,
                        mint,
                        seller,
                        bidder: value.accounts[0].toBase58(),
                        escrow: escrow_Add,
                        price: value.data.parsed.info.lamports / LAMPORTS_PER_SOL,
                        time: new Date(value.time).getTime(),
                        market: 'magiceden',
                    }
                }
                const token_Add = value.data.parsed.info.account;
                for (const listing of listings) {
                    if (listing.id == token_Add) {
                        collection = listing.collectionName;
                        mint = listing.mintAddress;
                        seller = listing.owner;
                        break;
                    }
                }
                return {
                    sig: value.sig,
                    type: 'sale',
                    collection,
                    mint,
                    seller,
                    buyer: value.accounts[0].toBase58(),
                    account: token_Add,
                    price: (value.balance_change - SOLANA_TRX_FEE) / LAMPORTS_PER_SOL,
                    time: value.time,
                    market: 'magiceden',
                }
            });
            newActs = [];
            newActs.push(...result.filter((res) => res.collection != 'unknown'));
            console.dir(newActs, {depth: null});
            console.log(`${result.length} new acts fetched`);
            console.log('---------');
            io.emit('new_acts', {
                raw_tracked_counts: result.length,
                new_actions: newActs,
            });
            const newListings = await getListingsMagicEden(collections);
            listings = newListings;
            console.log('updated listings');
        };
        await newTrack();
        await new Promise((resolve, reject) => {
            setTimeout(() => {resolve(1);
        }, 10000)});
    }
}