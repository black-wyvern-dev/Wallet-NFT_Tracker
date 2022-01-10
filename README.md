# solana-wallet-nft-track

Express backend for NFT tracking in the certain wallet.

`yarn`
`yarn start`

## Usage

Determine all nfts on the wallet. \
`http://localhost:3000/?address=<wallet address>`

Fetch the NFT metadata of the mint and track related transactions to calculate price and purchase date. \
`http://localhost:3000/nft/?address=<wallet address>&mint=<NFT mint address>`

Fetch the above data for all dumped nfts \
`http://localhost:3000/nft/?address=<wallet address>`

This request will dump wallet nfts in the `dumps/` directory.
The file names are the mint address of each nft.
Dump files will overwite if the wallet address is changed.


Get floor prices from magiceden and solanart \
`http://localhost:3000/get_floor_price?collections=<colletion1>,<...>`

Get new sales after timestamp save in `last_sales_magiceden_<collection>` and `last_sales_solanart_<collection>` \
`http://localhost:3000/check_new_sales?collections=<colletion1>,<...>`

Get new offers after timestamp save in `last_offers_magiceden_<collection>` and `last_offers_solanart_<collection>` \
`http://localhost:3000/check_new_offers?collections=<colletion1>,<...>`

Attach new listener for the new offers and sales of magiceden \
`http://localhost:3000/set_magiceden_attach?collections=<colletion1>,<...>`

Clear all attached listener for new offers and sales \
`http://localhost:3000/clear_all_attach`
