import express from 'express';
import http from 'http';
import cors from 'cors';
import fs from 'fs';
import { Server } from 'socket.io';
import { fetchWalletForNFTs,getTransactionData, fetchOnlyPurchaseInfo, fetchWalletallForNFTs, fetchNftList, fetchNftsDetailInfo, getNftPurchaseInfo } from './wallet';
import { attachCollectionFloorPriceListener, checkNewSales, checkNewOffers, attachMarketEventListener, addNftListener, getFloorPrices } from './market';
import { isAttachingListener, setAttachingListener, updateCollectionsForFloorPrice } from './config/constant';

const app = express();
const port = process.env.PORT || 3001;
// const index = fs.readFileSync('/home/solana-wallet-nft-track/public/test.html');
const index = fs.readFileSync(__dirname + '\\..\\public\\test.html');

app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Router - determine all nfts on the wallet and get full data
app.get('/', async (req, res) => {
  try {
    const address = req.query.address as string;//'9X3n2WPj8k7GB2wD7MxSxuL3VqC2e6YaafdcyPbr8xys';//
    console.log(`Requested wallet address ${address}`);
    const result = await fetchWalletForNFTs(address);
    res.send(JSON.stringify(result));
  } catch (e) {
    console.log(`Request isn't process: ${e}`);
    res.send(e);
  }
});

app.get('/alldata', async (req, res) => {
  try {
    const address = req.query.address as string;//'9X3n2WPj8k7GB2wD7MxSxuL3VqC2e6YaafdcyPbr8xys';//
    console.log(`Requested wallet address ${address}`);
    const result = await fetchWalletallForNFTs(address);
    res.send(JSON.stringify(result));
  } catch (e) {
    console.log(`Request isn't process: ${e}`);
    res.send(e);
  }
});

// Router - fetch full data for individual nft on the wallet
app.get('/nft', async (req, res) => {
  try {
    const address = req.query.address as string;//'9X3n2WPj8k7GB2wD7MxSxuL3VqC2e6YaafdcyPbr8xys';
    const mint = req.query.mint as string;//'HkaDezUF8eEHZRkDbMJGCCxNVuLuDfQ6ABpADahLw36M';
    console.log(`Requested wallet address ${address}, mint ${mint}`);
    // const result = await getTransactionData(address, mint);
    const result = await fetchOnlyPurchaseInfo(address, mint);
    console.log(`Request is processed`);
    res.send(result);
  } catch (e) {
    console.log(`Request isn't process: ${e}`);
    res.send(e);
  }
});

app.get('/nft_detail', async (req, res) => {
  try {
    const address = req.query.address as string;
    let page = req.query.page as string;
    let count = req.query.count as string;
    if (page == undefined || page == '') page = '0';
    if (count == undefined || count == '') count = '10';
    console.log(`Requested wallet address ${address}`);
    const result = await fetchNftsDetailInfo(address, parseInt(page), parseInt(count));
    console.log(`Request is processed`);
    res.send(result);
  } catch (e) {
    console.log(`Request isn't process: ${e}`);
    res.send(e);
  }
});

app.get('/nft_list', async (req, res) => {
  try {
    const address = req.query.address as string;
    console.log(`Requested wallet address ${address}`);
    var starttime = Date.now();
    const result = await fetchNftList(address);
    console.log('--------------------------------------process duration : ', (Date.now()-starttime)/1000)
    console.log(`Request is processed`);
    res.send(result);
  } catch (e) {
    console.log(`Request isn't process: ${e}`);
    res.send(e);
  }
});

app.get('/nft_purchase_info', async (req, res) => {
  try {
    const address = req.query.address as string;
    const mint = req.query.mint as string;
    if (address == undefined || address == '') res.send('address undefined');
    if (mint == undefined || mint == '') res.send('address undefined');
    console.log(`Requested wallet address ${address}`);
    const result = await getNftPurchaseInfo(address, mint);
    console.log(`Request is processed`);
    res.send(result);
  } catch (e) {
    console.log(`Request isn't process: ${e}`);
    res.send(e);
  }
});


app.get('/get_floor_price', async (req, res) => {
  const marketplace = (req.query.marketplace as string);
  const collections = (req.query.collections as string).split(',');
  console.log(`Request fetch floorPrices`);
  console.log(marketplace);
  console.log(collections);
  if (!marketplace || marketplace != 'solanart' && marketplace != 'magiceden' && marketplace != 'digitaleyes' && marketplace != 'alpha') {
    res.send({ err: "Don't support the marketplace atm" });
    return;
  }
  if (collections.length == 0) {
    res.send({ results: [] });
    return;
  }
  const result = await getFloorPrices(marketplace, collections);//, io);
  res.send({ results: result });
});

app.get('/clear_all_attach', (req, res) => {
  updateCollectionsForFloorPrice([]);
  setAttachingListener([]);
  console.log('Cleared all attach listeners');
  io.emit('msg', 'Cleared all attach listeners');
  res.send('Cleared all');
})

app.get('/set_offer_alert', (req, res) => {
  const nfts = (req.query.mint as string).split(',');
  console.log(`Request offer listener attach`);
  console.log(nfts);
  if (nfts.length == 0) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(index);
    return;
  }
  io.emit('msg', `New offer listeners attached: ${JSON.stringify(nfts)}`);
  if (isAttachingListener.length == 0) {
    addNftListener(nfts, true, false).then(() => {
      attachMarketEventListener([], io);
    });
  }
  else {
    addNftListener(nfts, true, false);
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(index);
})

app.get('/set_sale_alert', (req, res) => {
  const nfts = (req.query.mint as string).split(',');
  console.log(`Request sale listener attach`);
  console.log(nfts);
  if (nfts.length == 0) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(index);
    return;
  }
  io.emit('msg', `New sale listeners attached: ${JSON.stringify(nfts)}`);
  if (isAttachingListener.length == 0) {
    addNftListener(nfts, false, true).then(() => {
      attachMarketEventListener([], io);
    });
  }
  else {
    addNftListener(nfts, false, true);
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(index);
})


io.on('connection', async (socket) => {
  console.log("New Connection Established");

  socket.on('disconnect', () => {
    console.log("One socket is disonnected");
  });
})

server.listen(port, () => {
  console.log(`server is listening on ${port}`);
  attachCollectionFloorPriceListener(io);
  return;
});