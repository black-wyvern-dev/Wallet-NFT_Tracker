# solana-wallet-nft-track

- Express backend for NFT tracking in the certain wallet.
- Webhook for scraping secondary marketplace information for particular NFT collection & marketplace name
- API for scraping NFT sale price and date for particular wallet.
- Web Socket for grabing floor price of certain NFT collections.

`yarn`
`yarn start`

## Usage

`http://localhost:3000/?address=<wallet address>`

This request will dump wallet nfts in the `dumps/` directory.
