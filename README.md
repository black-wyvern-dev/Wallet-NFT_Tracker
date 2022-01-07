# solana-wallet-nft-track

Express backend for NFT tracking in the certain wallet.

`yarn`
`yarn start`

## Usage

Determine all nfts on the wallet. \
`http://localhost:3000/?address=<wallet address>`

Fetch the NFT metadata of the mint and track related transactions to calculate price and purchase date. \
`http://localhost:3000/nft/?address=<wallet address>&mint=<NFT mint address>`

Fetch the above data for all dumped nfts
`http://localhost:3000/nft/?address=<wallet address>`

This request will dump wallet nfts in the `dumps/` directory.
The file names are the mint address of each nft.
Dump files will overwite if the wallet address is changed.