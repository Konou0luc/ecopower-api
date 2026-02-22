const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://localhost:5174',
      /^https:\/\/.*\.vercel\.app$/,
      /^https:\/\/.*\.netlify\.app$/,
    ];
    
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return origin === allowed;
      } else if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 heures
};

app.use(cors(corsOptions));

app.options(/.*/, cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 30,
  message: 'Trop de tentatives, réessayez plus tard',
  standardHeaders: true,
  legacyHeaders: false,
});

const residentLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 10,
  message: 'Trop de requêtes, réessayez plus tard',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
    return res.status(200).end();
  }
  next();
});

app.use('/auth', authLimiter, require('./routes/auth'));
app.use('/residents', residentLimiter, require('./routes/residents'));
app.use('/consommations', require('./routes/consommations'));
app.use('/factures', require('./routes/factures'));
app.use('/abonnements', require('./routes/abonnements'));
app.use('/maisons', require('./routes/maisons'));
app.use('/messages', require('./routes/messages'));
app.use('/admin', require('./routes/admin'));

// Exposer config pour le frontend
app.get('/config', (req, res) => {
  res.json({ freeMode: process.env.FREE_MODE === 'true' });
});

// Infos de contact dynamiques (À propos - email, téléphone, site web)
const appInfoController = require('./controllers/appInfoController');
app.get('/app-info', appInfoController.getAppInfo);

app.get('/', (req, res) => {
  res.json({ message: 'API Ecopower - Gestion de consommation électrique' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Erreur interne du serveur' });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route non trouvée' });
});

const connectDB = async () => {
  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Mongo connecté');
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

const start = async () => {
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
  });

  const io = require('socket.io')(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  require('./sockets/socketManager')(io);

  const { initCronJobs } = require('./utils/cronJobs');
  initCronJobs();
};

start();

module.exports = app;
