const Message = require('../models/Message');
const User = require('../models/User');
const { uploadBufferToCloudinary, cloudinary } = require('../middlewares/upload');
const notifications = require('../utils/notifications');


exports.createFileMessage = async (req, res) => {
  try {
    const { receiverId, contenu, maisonId } = req.body;
    const senderId = req.user._id;

    
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

    
    const cloudinaryResult = await uploadBufferToCloudinary(req.file);

    
    const destinataireId = receiverId && receiverId.trim() !== '' 
      ? receiverId 
      : senderId;

    
    const sujet = req.file.originalname;

    
    const fileType = req.file.mimetype.startsWith('image/') 
      ? 'image' 
      : req.file.mimetype.startsWith('video/') 
        ? 'video' 
        : req.file.mimetype.startsWith('audio/') 
          ? 'audio' 
          : 'file';

    
    const messageType = 'chat';

    
    const message = new Message({
      expediteur: senderId,
      destinataire: destinataireId,
      sujet: sujet,
      contenu: contenu || req.file.originalname,
      type: messageType, 
      statut: 'envoye',
      dateEnvoi: new Date(),
      metadata: {
        maisonId: maisonId,
        receiverId: receiverId || null, 
        fileType: fileType, 
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


exports.proxyFile = async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ message: 'url manquante' });
    }
    if (!url.includes('res.cloudinary.com')) {
      return res.status(400).json({ message: 'URL non autorisée' });
    }

    
    let target = url;
    if (target.includes('/image/upload/') && (target.endsWith('.pdf') || target.includes('application/pdf'))) {
      target = target.replace('/image/upload/', '/raw/upload/');
    }

    const fetch = require('node-fetch');
    let response = await fetch(target);

    
    if (![200].includes(response.status)) {
      try {
        const u = new URL(url);
        const pathParts = u.pathname.split('/');
        const resourceTypeInUrl = pathParts.includes('image') ? 'image' : (pathParts.includes('raw') ? 'raw' : null);
        const uploadIndex = pathParts.findIndex((p) => p === 'upload');
        if (uploadIndex !== -1 && uploadIndex + 1 < pathParts.length) {
          let afterUpload = pathParts.slice(uploadIndex + 1); 
          
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
            
            const primaryResource = isPdf ? 'raw' : (resourceTypeInUrl || 'image');
            const altResource = primaryResource === 'raw' ? 'image' : 'raw';

            
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
        
      }
    }

    if (!response.ok) {
      return res.status(response.status).send(await response.text());
    }

    
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


exports.createMessage = async (req, res) => {
  try {
    const { receiverId, contenu, maisonId } = req.body;
    const senderId = req.user._id;

    
    if (!contenu || contenu.trim().length === 0) {
      return res.status(400).json({ message: 'Le contenu du message est requis' });
    }

    if (!maisonId) {
      return res.status(400).json({ message: 'L\'ID de la maison est requis' });
    }

    
    
    const destinataireId = receiverId && receiverId.trim() !== '' 
      ? receiverId 
      : senderId; 

    
    const sujet = contenu.trim().length > 50 
      ? contenu.trim().substring(0, 50) + '...' 
      : contenu.trim();

    
    const message = new Message({
      expediteur: senderId,
      destinataire: destinataireId,
      sujet: sujet,
      contenu: contenu.trim(),
      type: 'chat', 
      statut: 'envoye',
      dateEnvoi: new Date(),
      metadata: {
        maisonId: maisonId,
        receiverId: receiverId || null, 
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


exports.getHouseHistory = async (req, res) => {
  try {
    const maisonId = req.params.maisonId;
    
    
    const messages = await Message.find({ 
      'metadata.maisonId': maisonId,
      expediteur: { $ne: null }, 
    })
      .sort({ dateEnvoi: 1 })
      .lean();
    res.json({ messages });
  } catch (error) {
    console.error('💥 [API] getHouseHistory error:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de l\'historique' });
  }
};


