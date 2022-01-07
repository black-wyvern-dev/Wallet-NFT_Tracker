import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import axios from 'axios';
import { loadDump, saveDump } from './wallet';

export const TEST_COLLECTION_LIST = [
    '111_solana_tattoos',
    'solana_monkey_business',
    'monkeyball',
]

const getHistorySolanart = (collection: string) => {
    return new Promise((resolve) => {
        axios.get(`https://qzlsklfacc.medianetwork.cloud/all_sold_per_collection_day?collection=${collection}`).then((res) => {
            res.data.then((data: any) => {
                resolve(data);
            }).catch(() => resolve([]));
        }).catch(() => resolve([]));
    });
};

const getListingSolanart = (collection: string) => {
    return new Promise((resolve) => {
        axios.get(`https://qzlsklfacc.medianetwork.cloud/nft_for_sale?collection=${collection}`).then((res) => {
            res.data.then((data: any) => {
                resolve(data);
            }).catch(() => resolve([]));
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
            $limit: 10
        })));
        axios.get(`https://api-mainnet.magiceden.io/rpc/getListedNFTsByQuery?q=${query}`).then((res) => res.data.results)
        .then((data: any) => {
            resolve(data);
        }).catch(() => resolve([]));
    });
};

const fetchMagicEdenNFT = (mint: string) => {
    return new Promise((resolve) => {
        axios.get(`https://api-mainnet.magiceden.io/rpc/getNFTByMintAddress/${mint}`).then((res) => res.data.results)
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
        axios.get(`https://api-mainnet.magiceden.io/rpc/getGlobalActivitiesByQuery?q=${query}`).then((res) => {
            res.data.then((data: any) => {
                resolve(data.results);
            }).catch(() => resolve([]));
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
            }
        }, 300);
    });
}

export const synchronizeSolanart = () => {
    // [
    //     'thetower'
    // ].forEach((collection) => {
    //     const latestSale = db.get(`last_sales_solanart_${collection}`);
    //     const latestListing = db.get(`last_listings_solanart_${collection}`);

    //     getListingSolanart(collection).then((listings) => {
            
    //         if (!listings.length) return;
            
    //         let newListings = [];
    //         const indexOfLastListingInNewArray = listings.findIndex((e) => e.name === latestListing);

    //         // if the last listing can not be found
    //         // (for example if the latest listing was deleted)
    //         if (indexOfLastListingInNewArray === -1) {
    //             newListings.push(listings[0]);
    //         } else {
    //             newListings = listings.slice(0, indexOfLastListingInNewArray);
    //         }

    //         if (newListings[0] || !latestListing) {
    //             db.set(`last_listings_solanart_${collection}`, newListings[0].name);
    //         }

    //         newListings.reverse().forEach((event) => {

    //             const embed = new Discord.MessageEmbed()
    //                 .setTitle(`${event.name} has been listed!`)
    //                 .setURL(`https://explorer.solana.com/address/${event.token_add}`)
    //                 .addField('Price', `**${event.price} SOL**`)
    //                 .setImage(event.link_img)
    //                 .setColor('DARK_AQUA')
    //                 .setTimestamp()
    //                 .setFooter('Solanart');

    //             client.channels.cache.get(process.env.SOLANART_LISTINGS_CHANNEL_ID).send({
    //                 embeds: [embed]
    //             }).catch(() => {});

    //         });

    //     });
        
    //     getHistorySolanart(collection).then((events) => {

    //         const sortedEvents = events
    //             .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    //         if (!sortedEvents.length) return;
            
    //         const newEvents = sortedEvents
    //             .filter((e) => new Date(e.date).getTime() > latestSale || !latestSale);

    //         db.set(`last_sales_solanart_${collection}`, new Date(sortedEvents[0].date).getTime());

    //         (latestSale ? newEvents.reverse() : [sortedEvents[0]]).forEach((event) => {

    //             const embed = new Discord.MessageEmbed()
    //                 .setTitle(`${event.name} has been sold out!`)
    //                 .setURL(`https://explorer.solana.com/address/${event.token_add}`)
    //                 .addField('Price', `**${event.price} SOL**`)
    //                 .addField('Buyer', event.buyerAdd)
    //                 .addField('Seller', event.seller_address)
    //                 .setImage(event.link_img)
    //                 .setTimestamp(new Date(event.date))
    //                 .setColor('DARK_AQUA')
    //                 .setFooter('Solanart');

    //             client.channels.cache.get(process.env.SOLANART_SALES_CHANNEL_ID).send({
    //                 embeds: [embed]
    //             }).catch(() => {});

    //         });

    //     });

    // });
};

export const synchronizeMagicEden = (listings: string[]) => {
    TEST_COLLECTION_LIST.forEach((collection) => {
        console.log(`---> Start synchronize for ${collection} from MagicEden`);
        const latestSale = loadDump(`/magiceden/last_sales_magiceden`);
        const latestListing = loadDump(`/magiceden/last_listings_magiceden`);
        
        getCollectionInfoMagicEden(collection).then((floorPrice: any) => {
            console.log(`${collection}: ${floorPrice}`);
            if (!floorPrice.length) return;
            // if (newListings[0] || !latestListing) {
            //     saveDump(`/magiceden/last_listings_magiceden_${collection}`, newListings[0].title);
            // }
        });

        // getListingMagicEden(collection).then((listings: any) => {
        //     console.dir(listings, {depth: null});
        //     if (!listings.length) return;
            
        //     let newListings = [];
        //     const indexOfLastListingInNewArray = listings.findIndex((e: any) => e.title === latestListing);

        //     // if the last listing can not be found
        //     // (for example if the latest listing was deleted)
        //     if (indexOfLastListingInNewArray === -1) {
        //         newListings.push(listings[0]);
        //     } else {
        //         newListings = listings.slice(0, indexOfLastListingInNewArray);
        //     }

        //     if (newListings[0] || !latestListing) {
        //         saveDump(`/magiceden/last_listings_magiceden_${collection}`, newListings[0].title);
        //     }

        //     newListings.reverse().forEach((event: any) => {

        //         setTimeout(async () => {
        //             const nft: any = await fetchMagicEdenNFT(event.mintAddress);
                    
        //             console.log(`${nft.title} has been listed!`)
        //             console.log(`https://explorer.solana.com/address/${nft.mintAddress}`)
        //             console.log('Price', `**${nft.price} SOL**`)
        //             console.log(nft.img)
        //             console.log(new Date(event.createdAt))
        //             console.log('DARK_AQUA')
        //             console.log('Magic Eden');
        //         }, 5000);
        //     });

        // });
        
        // getHistoryMagicEden(collection).then((events: any) => {

        //     const sortedEvents = events
        //         .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        //     if (!sortedEvents.length) return;
            
        //     const newEvents = sortedEvents
        //         .filter((e: any) => new Date(e.createdAt).getTime() > latestSale || !latestSale);

        //     if (new Date(sortedEvents[0].createdAt).getTime() > latestSale || !latestSale) {
        //         saveDump(`/magiceden/last_sales_magiceden_${collection}`, new Date(sortedEvents[0].createdAt).getTime());
        //     }

        //     (latestSale ? newEvents.reverse() : [sortedEvents[0]]).forEach(async (event: any) => {

        //         if (!event.parsedTransaction) return;

        //         const nft: any = await fetchMagicEdenNFT(event.parsedTransaction.mint);

        //         console.log(`${nft.title} has been sold out!`)
        //         console.log(`https://explorer.solana.com/tx/${event.transaction_id}`)
        //         console.log('Price', `**${(event.parsedTransaction.total_amount / 10E8).toFixed(2)} SOL**`)
        //         console.log('Buyer', event.parsedTransaction.buyer_address)
        //         console.log('Seller', event.seller_address)
        //         console.log(nft.img)
        //         console.log(new Date(event.createdAt))
        //         console.log('DARK_AQUA')
        //         console.log('Magic Eden');
        //     });

        // });

    });
};