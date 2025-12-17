const Message = require('../models/Message');
const User = require('../models/User');
const { uploadBufferToCloudinary, cloudinary } = require('../middlewares/upload');
const notifications = require('../utils/notifications');

// POST /messages/file -> créer un message avec fichier
exports.createFileMessage = async (req, res) => {
  try {
    const { receiverId, contenu, maisonId } = req.body;
    const senderId = req.user._id;

    // Validation des données
    if (!req.file) {
      return res.status(400).json({ message: 'Aucun fichier fourni' });
    }

    if (!maisonId) {
      return res.status(400).json({ message: 'L\'ID de la maison est requis' });
    }

    console.log('📁 [API] Upload de fichier:', {
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      storage: 'memory'
    });

    // Upload vers Cloudinary depuis le buffer (compat. serverless)
    const cloudinaryResult = await uploadBufferToCloudinary(req.file);

    // Pour les messages de groupe (receiverId null/vide), utiliser senderId comme destinataire par défaut
    const destinataireId = receiverId && receiverId.trim() !== '' 
      ? receiverId 
      : senderId;

    // Générer un sujet à partir du nom du fichier
    const sujet = req.file.originalname;

    // Déterminer le type réel du fichier pour les metadata (image, video, audio, file)
    const fileType = req.file.mimetype.startsWith('image/') 
      ? 'image' 
      : req.file.mimetype.startsWith('video/') 
        ? 'video' 
        : req.file.mimetype.startsWith('audio/') 
          ? 'audio' 
          : 'file';

    // Pour l'enum MongoDB, toujours utiliser 'chat' pour les messages de chat
    const messageType = 'chat';

    // Créer le message avec fichier en utilisant les champs du schéma MongoDB
    const message = new Message({
      expediteur: senderId,
      destinataire: destinataireId,
      sujet: sujet,
      contenu: contenu || req.file.originalname,
      type: messageType, // 'chat' pour l'enum
      statut: 'envoye',
      dateEnvoi: new Date(),
      metadata: {
        maisonId: maisonId,
        receiverId: receiverId || null, // Garder pour compatibilité
        fileType: fileType, // Type réel du fichier
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileMimeType: req.file.mimetype,
        fileUrl: cloudinaryResult.secure_url,
        thumbnailUrl: cloudinaryResult.format === 'jpg' || cloudinaryResult.format === 'png' 
          ? cloudinaryResult.secure_url 
          : null
      }
    });

    await message.save();

    console.log('✅ [API] Message avec fichier créé:', {
      id: message._id,
      expediteur: message.expediteur,
      destinataire: message.destinataire,
      sujet: message.sujet,
      type: message.type,
      fileName: message.metadata.fileName,
      fileUrl: message.metadata.fileUrl,
      maisonId: maisonId,
    });

    // Notification push uniquement si c'est le gérant qui envoie au résident
    if (req.user.role === 'proprietaire' && receiverId && receiverId.trim() !== '') {
      try {
        const receiver = await User.findById(receiverId);
        if (receiver && receiver.role === 'resident') {
          const fileTypeLabel = fileType === 'image' ? 'une image' : 
                               fileType === 'video' ? 'une vidéo' : 
                               fileType === 'audio' ? 'un audio' : 'un fichier';
          await notifications.envoyer(receiverId, `Nouveau message de ${req.user.nomComplet || req.user.prenom + ' ' + req.user.nom}: ${fileTypeLabel}`);
          console.log(`✅ Notification message fichier API envoyée au résident ${receiverId}`);
        }
      } catch (e) {
        console.error('Notif push (message fichier API) échouée:', e?.message || e);
      }
    }

    res.status(201).json({
      message: 'Message avec fichier envoyé avec succès',
      data: message,
    });
  } catch (error) {
    console.error('💥 [API] createFileMessage error:', error);
    res.status(500).json({ message: 'Erreur lors de l\'envoi du message avec fichier' });
  }
};

// Proxy/stream d'un fichier Cloudinary pour contourner les blocages publics
exports.proxyFile = async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ message: 'url manquante' });
    }
    if (!url.includes('res.cloudinary.com')) {
      return res.status(400).json({ message: 'URL non autorisée' });
    }

    // Petites sécurités: forcer raw si pdf/doc
    let target = url;
    if (target.includes('/image/upload/') && (target.endsWith('.pdf') || target.includes('application/pdf'))) {
      target = target.replace('/image/upload/', '/raw/upload/');
    }

    const fetch = require('node-fetch');
    let response = await fetch(target);

    // Si échec d'accès direct (401/403/404), tenter variantes + URL signées Cloudinary
    if (![200].includes(response.status)) {
      try {
        const u = new URL(url);
        const pathParts = u.pathname.split('/');
        const resourceTypeInUrl = pathParts.includes('image') ? 'image' : (pathParts.includes('raw') ? 'raw' : null);
        const uploadIndex = pathParts.findIndex((p) => p === 'upload');
        if (uploadIndex !== -1 && uploadIndex + 1 < pathParts.length) {
          let afterUpload = pathParts.slice(uploadIndex + 1); // e.g. ['v1760...', 'ecopower', 'messages', 'file.pdf']
          // Retirer la version si présente (v123456789)
          if (afterUpload.length && /^v\d+$/.test(afterUpload[0])) {
            afterUpload = afterUpload.slice(1);
          }
          const publicWithExt = afterUpload.join('/');
          const last = publicWithExt.split('/').pop();
          const hasDot = last && last.includes('.');
          const ext = hasDot ? last.split('.').pop() : undefined;
          const publicId = hasDot
            ? publicWithExt.substring(0, publicWithExt.lastIndexOf('.'))
            : publicWithExt;

          const isPdf = ((ext || '').toLowerCase() === 'pdf');
          // 1) Essayer l'autre resource_type (toggle image/raw) sur l'URL directe
          if (isPdf) {
            const toggled = url.includes('/image/upload/')
              ? url.replace('/image/upload/', '/raw/upload/')
              : url.replace('/raw/upload/', '/image/upload/');
            const r2 = await fetch(toggled);
            if (r2.ok) {
              response = r2;
            }
          }

          if (!response.ok) {
            // 2) Générer une URL signée via cloudinary.url (sign_url)
            const primaryResource = isPdf ? 'raw' : (resourceTypeInUrl || 'image');
            const altResource = primaryResource === 'raw' ? 'image' : 'raw';

            // Essai URL signée principale
            const signedUrlPrimary = cloudinary.url(publicId, {
              resource_type: primaryResource,
              type: 'upload',
              secure: true,
              sign_url: true,
              flags: 'attachment',
              format: ext || undefined,
            });
            let r3 = await fetch(signedUrlPrimary);
            if (r3.ok) {
              response = r3;
            } else {
              // Essai URL signée alternative (toggle resource_type)
              const signedUrlAlt = cloudinary.url(publicId, {
                resource_type: altResource,
                type: 'upload',
                secure: true,
                sign_url: true,
                flags: 'attachment',
                format: ext || undefined,
              });
              r3 = await fetch(signedUrlAlt);
              if (r3.ok) {
                response = r3;
              }
            }
          }
        }
      } catch (e) {
        // Ignorer, on tombera sur l'erreur initiale
      }
    }

    if (!response.ok) {
      return res.status(response.status).send(await response.text());
    }

    // Propager content-type et dispo si dispo
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentDisposition = response.headers.get('content-disposition');
    res.setHeader('Content-Type', contentType);
    if (contentDisposition) {
      res.setHeader('Content-Disposition', contentDisposition);
    }

    response.body.pipe(res);
  } catch (err) {
    console.error('❌ [FILE PROXY] Erreur:', err);
    res.status(500).json({ message: 'Erreur proxy fichier' });
  }
};

// POST /messages -> créer un message
exports.createMessage = async (req, res) => {
  try {
    const { receiverId, contenu, maisonId } = req.body;
    const senderId = req.user._id;

    // Validation des données
    if (!contenu || contenu.trim().length === 0) {
      return res.status(400).json({ message: 'Le contenu du message est requis' });
    }

    if (!maisonId) {
      return res.status(400).json({ message: 'L\'ID de la maison est requis' });
    }

    // Pour les messages de groupe (receiverId null/vide), utiliser senderId comme destinataire par défaut
    // ou rendre destinataire optionnel. Ici, on utilise senderId comme fallback.
    const destinataireId = receiverId && receiverId.trim() !== '' 
      ? receiverId 
      : senderId; // Pour messages de groupe, destinataire = expéditeur (tous les membres voient le message)

    // Générer un sujet à partir du contenu (premiers 50 caractères)
    const sujet = contenu.trim().length > 50 
      ? contenu.trim().substring(0, 50) + '...' 
      : contenu.trim();

    // Créer le message avec les champs du schéma MongoDB
    const message = new Message({
      expediteur: senderId,
      destinataire: destinataireId,
      sujet: sujet,
      contenu: contenu.trim(),
      type: 'chat', // Utiliser 'chat' au lieu de 'text' car c'est dans l'enum
      statut: 'envoye',
      dateEnvoi: new Date(),
      metadata: {
        maisonId: maisonId,
        receiverId: receiverId || null, // Garder pour compatibilité
      },
    });

    await message.save();

    console.log('✅ [API] Message créé:', {
      id: message._id,
      expediteur: message.expediteur,
      destinataire: message.destinataire,
      sujet: message.sujet,
      type: message.type,
      contenu: message.contenu.substring(0, 50) + '...',
      maisonId: maisonId,
    });

    // Notification push uniquement si c'est le gérant qui envoie au résident
    if (req.user.role === 'proprietaire' && receiverId && receiverId.trim() !== '') {
      try {
        const receiver = await User.findById(receiverId);
        if (receiver && receiver.role === 'resident') {
          const messagePreview = contenu.trim().length > 50 
            ? contenu.trim().substring(0, 50) + '...' 
            : contenu.trim();
          await notifications.envoyer(receiverId, `Nouveau message de ${req.user.nomComplet || req.user.prenom + ' ' + req.user.nom}: ${messagePreview}`);
          console.log(`✅ Notification message API envoyée au résident ${receiverId}`);
        }
      } catch (e) {
        console.error('Notif push (message API) échouée:', e?.message || e);
      }
    }

    res.status(201).json({
      message: 'Message envoyé avec succès',
      data: message,
    });
  } catch (error) {
    console.error('💥 [API] createMessage error:', error);
    res.status(500).json({ message: 'Erreur lors de l\'envoi du message' });
  }
};

// GET /messages/private/:otherUserId -> historique messages privés (bidirectionnels)
exports.getPrivateHistory = async (req, res) => {
  try {
    const myId = req.user._id;
    const otherUserId = req.params.otherUserId;

    const messages = await Message.find({
      $or: [
        { expediteur: myId, destinataire: otherUserId },
        { expediteur: otherUserId, destinataire: myId },
      ],
    })
      .sort({ dateEnvoi: 1 })
      .lean();

    res.json({ messages });
  } catch (error) {
    console.error('💥 [API] getPrivateHistory error:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de l\'historique' });
  }
};

// GET /messages/house/:maisonId -> historique messages de groupe (maison)
exports.getHouseHistory = async (req, res) => {
  try {
    const maisonId = req.params.maisonId;
    // Pour les messages de groupe, destinataire = expediteur (tous les membres voient)
    // On filtre par maisonId dans metadata
    const messages = await Message.find({ 
      'metadata.maisonId': maisonId,
      expediteur: { $ne: null }, // S'assurer qu'il y a un expéditeur
    })
      .sort({ dateEnvoi: 1 })
      .lean();
    res.json({ messages });
  } catch (error) {
    console.error('💥 [API] getHouseHistory error:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de l\'historique' });
  }
};


