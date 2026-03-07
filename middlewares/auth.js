const jwt = require('jsonwebtoken');
const User = require('../models/User');


const authenticateToken = async (req, res, next) => {
  try {
    
    console.log('🔍 [AUTH] Headers reçus:', {
      'authorization': req.headers['authorization'] ? 'Présent' : 'Absent',
      'Authorization': req.headers['Authorization'] ? 'Présent' : 'Absent',
      'path': req.path,
      'method': req.method
    });
    
    
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) {
      console.error('❌ [AUTH] authenticateToken: Aucun token fourni pour', req.method, req.path);
      console.error('❌ [AUTH] Headers disponibles:', Object.keys(req.headers).filter(h => h.toLowerCase().includes('auth')));
      return res.status(401).json({ message: 'Token d\'accès requis' });
    }
    
    console.log('🔍 [AUTH] Token extrait (preview):', token.substring(0, 20) + '...');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('🔐 [AUTH] Token décodé avec succès. userId:', decoded.userId);
    
    
    const user = await User.findById(decoded.userId).select('-motDePasse -refreshToken');
    
    if (!user) {
      console.error('❌ [AUTH] authenticateToken: Utilisateur non trouvé pour userId:', decoded.userId);
      return res.status(401).json({ message: 'Utilisateur non trouvé' });
    }

    console.log('✅ [AUTH] Utilisateur authentifié:', user.email, 'Rôle:', user.role);
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      console.error('❌ [AUTH] authenticateToken: Token expiré');
      return res.status(401).json({ message: 'Token expiré' });
    }
    if (error.name === 'JsonWebTokenError') {
      console.error('❌ [AUTH] authenticateToken: Token invalide', error.message);
      return res.status(401).json({ message: 'Token invalide' });
    }
    console.error('❌ [AUTH] authenticateToken: Erreur inattendue', error);
    return res.status(500).json({ message: 'Erreur d\'authentification' });
  }
};


const requireProprietaire = (req, res, next) => {
  if (req.user.role !== 'proprietaire') {
    return res.status(403).json({ message: 'Accès réservé aux propriétaires' });
  }
  next();
};


const requireResident = (req, res, next) => {
  if (req.user.role !== 'resident') {
    return res.status(403).json({ message: 'Accès réservé aux résidents' });
  }
  next();
};


const requireAdmin = (req, res, next) => {
  
  if (!req.user) {
    console.error('❌ [AUTH] requireAdmin: req.user n\'est pas défini');
    return res.status(401).json({ message: 'Authentification requise' });
  }
  
  
  if (req.user.role !== 'admin' && req.user.role !== 'super-admin') {
    console.error('❌ [AUTH] requireAdmin: Rôle insuffisant. Rôle actuel:', req.user.role, 'Email:', req.user.email);
    return res.status(403).json({ 
      message: 'Accès réservé aux administrateurs',
      role: req.user.role,
      requiredRoles: ['admin', 'super-admin']
    });
  }
  
  console.log('✅ [AUTH] requireAdmin: Accès autorisé pour', req.user.email, 'avec le rôle', req.user.role);
  next();
};



const requirePasswordChange = (req, res, next) => {
  if (req.user.firstLogin) {
    return next();
  }
  return res.status(400).json({
    message: 'Cette opération n\'est pas nécessaire',
    firstLogin: false
  });
};


const authenticateRefreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token requis' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    const user = await User.findById(decoded.userId);
    
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: 'Refresh token invalide' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('❌ [AUTH] authenticateRefreshToken: Erreur', error.message);
    return res.status(401).json({ message: 'Refresh token invalide' });
  }
};

module.exports = {
  authenticateToken,
  requireProprietaire,
  requireResident,
  requireAdmin,
  requirePasswordChange,
  authenticateRefreshToken
};
