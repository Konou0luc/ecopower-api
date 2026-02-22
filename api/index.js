// Point d'entrée pour Vercel (serverless)
// Ne pas initialiser MongoDB, Socket.io ou le serveur HTTP ici
// Vercel gère cela différemment

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Requis derrière un proxy (Vercel) pour que req.ip soit correct
app.set('trust proxy', 1);

// Configuration CORS améliorée
const corsOptions = {
  origin: function (origin, callback) {
    // Autoriser les requêtes sans origine (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Liste des origines autorisées
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://localhost:5174',
      'https://ecologis-web.vercel.app',
      'https://www.ecologis-web.vercel.app',
      /^https:\/\/.*\.vercel\.app$/,
      /^https:\/\/.*\.netlify\.app$/,
    ];
    
    // Vérifier si l'origine est autorisée
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
      console.log('⚠️ [CORS] Origine bloquée:', origin);
      callback(null, true); // Autoriser temporairement pour debug
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 heures
};

app.use(cors(corsOptions));

// Gérer explicitement les requêtes OPTIONS (preflight)
app.options(/.*/, cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 tentatives par IP
  message: 'Trop de tentatives, réessayez plus tard',
  standardHeaders: true,
  legacyHeaders: false,
});

const residentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requêtes par IP
  message: 'Trop de requêtes, réessayez plus tard',
  standardHeaders: true,
  legacyHeaders: false,
});

// Gérer les requêtes OPTIONS (preflight CORS) AVANT tout autre middleware
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    console.log('✅ [CORS] Preflight request reçue:', req.path);
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
    return res.status(200).end();
  }
  next();
});

// Middleware de logging pour debug
app.use((req, res, next) => {
  if (req.path.startsWith('/auth')) {
    console.log(`📥 [REQUEST] ${req.method} ${req.path}`);
  }
  next();
});

// Connexion MongoDB lazy (se connecte seulement quand nécessaire)
// Sur Vercel, la connexion est réutilisée entre les invocations
const mongoose = require('mongoose');

const connectDB = async () => {
  // Vérifier si déjà connecté
  if (mongoose.connection.readyState === 1) {
    return;
  }
  
  // Si en cours de connexion, attendre
  if (mongoose.connection.readyState === 2) {
    return new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
    });
  }
  
  try {
    mongoose.set('strictQuery', false);
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI ou MONGODB_URI doit être défini dans les variables d\'environnement');
    }
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000, // Timeout plus court pour Vercel
    });
    console.log('✅ [VERCEL] MongoDB connecté');
  } catch (error) {
    console.error('❌ [VERCEL] Erreur connexion MongoDB:', error);
    throw error;
  }
};

// Middleware pour s'assurer que MongoDB est connecté
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('❌ [VERCEL] Erreur MongoDB:', error);
    res.status(500).json({ 
      message: 'Erreur de connexion à la base de données',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Routes
app.use('/auth', authLimiter, require('../routes/auth'));
app.use('/residents', residentLimiter, require('../routes/residents'));
app.use('/consommations', require('../routes/consommations'));
app.use('/factures', require('../routes/factures'));
app.use('/abonnements', require('../routes/abonnements'));
app.use('/maisons', require('../routes/maisons'));
app.use('/messages', require('../routes/messages'));
app.use('/admin', require('../routes/admin'));
app.use('/contact', require('../routes/contact'));

// Route pour servir le logo (pour les emails)
const path = require('path');
const fs = require('fs');
app.get('/logo.png', (req, res) => {
  try {
    const logoPath = path.join(__dirname, '../image/app/logo.png');
    
    // Vérifier si le fichier existe
    if (!fs.existsSync(logoPath)) {
      return res.status(404).json({ message: 'Logo non trouvé' });
    }
    
    // Lire le fichier et le servir
    const logoBuffer = fs.readFileSync(logoPath);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache 1 an
    res.send(logoBuffer);
  } catch (error) {
    console.error('❌ [LOGO] Erreur lors de la lecture du logo:', error);
    res.status(500).json({ message: 'Erreur lors de la lecture du logo' });
  }
});

// Exposer config pour le frontend
app.get('/config', (req, res) => {
  res.json({ freeMode: process.env.FREE_MODE === 'true' });
});

// Infos de contact dynamiques (À propos - email, téléphone, site web)
const appInfoController = require('../controllers/appInfoController');
app.get('/app-info', appInfoController.getAppInfo);

app.get('/', (req, res) => {
  res.json({ message: 'API Ecopower - Gestion de consommation électrique (Vercel)' });
});

// Gestion des erreurs
app.use((err, req, res, _next) => {
  console.error('❌ [VERCEL] Erreur:', err.stack);
  res.status(500).json({ message: 'Erreur interne du serveur' });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route non trouvée' });
});

// Export pour Vercel (pas de démarrage de serveur)
module.exports = app;
