import express from 'express';
import http from 'http';
import cors from 'cors';
import fs from 'fs';
import { Server } from 'socket.io';
import { fetchOnlyPurchaseInfo, fetchWalletForNFTs } from './wallet';
import { attachCollectionFloorPriceListener, attachMarketEventListener, addNftListener, getFloorPrices } from './market';
import { isAttachingListener, setAttachingListener, updateCollectionsForFloorPrice } from './config/constant';

const app = express();
const port = process.env.PORT || 3000;
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
    const address = req.query.address as string;
    let page = req.query.page as string;
    if (page == undefined || page == '') page = '0';
    console.log(`Requested wallet address ${address}`);
    const result = await fetchWalletForNFTs(address, parseInt(page));
    console.log(`--> Fetched ${result.nfts.length} nfts for ${address}: page ${page}`);
    res.send(`Requested wallet address ${address}<br><br>${JSON.stringify(result)}`);
  } catch (e) {
    console.log(`Request isn't process: ${e}`);
    res.send(e);
  }
});

// Router - fetch purchase data for individual nft on the wallet
app.get('/nft', async (req, res) => {
  try {
    const address = req.query.address as string;
    const mint = req.query.mint as string;
    console.log(`Requested wallet address ${address}, mint ${mint}`);
    const result = await fetchOnlyPurchaseInfo(address, mint);
    console.log(`Request is processed`);
    res.send(`Requested wallet address ${address} mint ${mint}<br>${JSON.stringify(result)}`);
  } catch (e) {
    console.log(`Request isn't process: ${e}`);
    res.send(e);
  }
});

// Get floor price for 4 market places: query - <marketplace>, <collections>=..., ...
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
  const result = await getFloorPrices(marketplace, collections);
  res.send({ results: result });
});

app.get('/clear_all_attach', (req, res) => {
  updateCollectionsForFloorPrice([]);
  setAttachingListener([]);
  console.log('Cleared all attach listeners');
  io.emit('msg', 'Cleared all attach listeners');
  res.send('Cleared all');
})

// Set socket alert for new offers: query - <mint>
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

// Set socket alert for new sales: query - <mint>
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