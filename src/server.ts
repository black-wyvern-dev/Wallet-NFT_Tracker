import express from 'express';
import http from 'http';
import cors from 'cors';
import fs from 'fs';
import { Server } from 'socket.io';
import { fetchWalletForNFTs, getTransactionData } from './wallet';
import { fetchCollectionFloorPrices, checkNewSales, checkNewOffers, attachMarketEventListener} from './market';
import { setAttachingListener } from './config/constant';

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
    const address = req.query.address as string;//'9X3n2WPj8k7GB2wD7MxSxuL3VqC2e6YaafdcyPbr8xys';//
    console.log(`Requested wallet address ${address}`);
    const result = await fetchWalletForNFTs(address);
    res.send(`Requested wallet address ${address}<br><br>${JSON.stringify(result)}`);
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
    const result = await getTransactionData(address, mint);
    console.log(`Request is processed`);
    res.send(`Requested wallet address ${address} mint ${mint}<br>${JSON.stringify(result)}`);
  } catch (e) {
    console.log(`Request isn't process: ${e}`);
    res.send(e);
  }
});

app.get('/get_floor_price', async (req, res) => {
  const collections = (req.query.collections as string).split(',');
  console.log(`Request fetch floorPrices`);
  console.log(collections);
  if (collections.length == 0) {
    res.send([]);
    return;
  }
  fetchCollectionFloorPrices(collections).then((result) => {
    console.log('---------');
    console.dir(result, {depth: null});
    res.send(result);
  });
});

app.get('/check_new_sales', async (req, res) => {
  const collections = (req.query.collections as string).split(',');
  console.log(`Request check new sales`);
  console.log(collections);
  if (collections.length == 0) {
    res.send([]);
    return;
  }
  checkNewSales(collections).then((result) => {
    console.log('---------');
    console.dir(result, {depth: null});
    res.send(result);
  });
});

app.get('/check_new_offers', async (req, res) => {
  const collections = (req.query.collections as string).split(',');
  console.log(`Request check new offers`);
  console.log(collections);
  if (collections.length == 0) {
    res.send([]);
    return;
  }
  checkNewOffers(collections).then((result) => {
    console.log('---------');
    console.dir(result, {depth: null});
    res.send(result);
  });
});

app.get('/clear_all_attach', (req, res) => {
  setAttachingListener(false);
  console.log('Cleared all attach listeners');
  io.emit('msg', 'Cleared all attach listeners');
  res.send('Cleared all');
})

app.get('/set_magiceden_attach', (req, res) => {
  const collections = (req.query.collections as string).split(',');
  console.log(`Request magiceden listener attach`);
  console.log(collections);
  if (collections.length == 0) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(index);
    return;
  }
  setAttachingListener(false);
  io.emit('msg', `New magiceden listeners attached: ${JSON.stringify(collections)}`);
  attachMarketEventListener(collections, io);
  res.writeHead(200, {'Content-Type': 'text/html'});
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
  // attachMarketEventListener(['monkeyball']);
  return ;
});