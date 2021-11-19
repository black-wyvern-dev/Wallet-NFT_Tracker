import express from 'express';
import { fetchWalletForNFTs } from './wallet';

const app = express();
const port = 3000;
app.get('/', async (req, res) => {
  const address = req.query.address as string;
  console.log(`Requested wallet address ${address}`);
  const result = await fetchWalletForNFTs(address);
  console.log(`Request is${result == false ? ' not' : ''} process`);
  res.send(`Requested wallet address ${address}<br>${JSON.stringify(result)}`);
});
app.listen(port, () => {
  return console.log(`server is listening on ${port}`);
});