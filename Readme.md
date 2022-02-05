# solana-wallet-nft-track

Express backend for NFT tracking in the certain wallet.

`yarn`
`yarn start`

## Usage

Determine all nfts on the wallet. \
`http://localhost:3000/?address=<wallet address>`

Fetch the NFT metadata of the mint and track related transactions to calculate price and purchase date. \
`http://localhost:3000/nft/?address=<wallet address>&mint=<NFT mint address>`
example \
`http://localhost:3000/nft?address=AuVHHaKWu7jUmeNP1eJn25ogbY3CQ1gxe9T9neMkhTTU&mint=AiS9sAe9zzQ6YfRY6VQF75P7rMUVU2r88zoJvpEAeaCm`

Fetch the above data for all dumped nfts \
`http://localhost:3000/nft/?address=<wallet address>`

This request will dump wallet nfts in the `dumps/` directory.
The file names are the mint address of each nft.
Dump files will overwite if the wallet address is changed.

Updated api from track one nft to track all nfts in one wallet \
`http://localhost:3000/?address<wallet address>`

Pipe floor prices from magiceden and solanart \
`http://localhost:3000/get_floor_price?collections=<colletion1>,<...>`

Set new sales alert for magiceden and solanart \
`http://localhost:3000/set_sale_alert?mint=<nft1>,<...>`

Set new offers alert for magiceden and solanart \
`http://localhost:3000/set_offer_alert?mint=<nft1>,<...>`

Clear all attached listener for new offers/sales and floor prices \
`http://localhost:3000/clear_all_attach`
