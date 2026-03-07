const Message = require('../models/Message');
const User = require('../models/User');
const Maison = require('../models/Maison');

const socketManager = (io) => {
  
  const connectedUsers = new Map();

  io.on('connection', (socket) => {
    console.log(`Nouvelle connexion: ${socket.id}`);

    
    socket.on('authenticate', async (data) => {
      try {
        const { token } = data;
        
        
        
        if (!token) {
          socket.emit('auth_error', { message: 'Token manquant' });
          return;
        }

        
        
        const userId = token; 
        
        
        const user = await User.findById(userId);
        if (!user) {
          socket.emit('auth_error', { message: 'Utilisateur non trouvé' });
          return;
        }

        
        socket.userId = user._id;
        socket.userRole = user.role;
        socket.userNom = user.nomComplet;

        
        connectedUsers.set(user._id.toString(), {
          socketId: socket.id,
          user: user
        });

        
        socket.join(`user:${user._id}`);

        
        if (user.role === 'resident') {
          const maisons = await Maison.find({ listeResidents: user._id });
          maisons.forEach(maison => {
            socket.join(`maison:${maison._id}`);
          });
        } else if (user.role === 'proprietaire') {
          
          const maisons = await Maison.find({ proprietaireId: user._id });
          maisons.forEach(maison => {
            socket.join(`maison:${maison._id}`);
          });
        }

        socket.emit('authenticated', {
          message: 'Authentification réussie',
          user: {
            id: user._id,
            nom: user.nomComplet,
            role: user.role
          }
        });

        console.log(`✅ [Socket] Utilisateur authentifié: ${user.nomComplet} (${user.role}) - ID: ${user._id}`);
      } catch (error) {
        console.error('Erreur d\'authentification socket:', error);
        socket.emit('auth_error', { message: 'Erreur d\'authentification' });
      }
    });

    
    socket.on('send_private_message', async (data) => {
      try {
        console.log('🔵 [Socket] Reçu send_private_message:', data);
        const { receiverId, contenu, maisonId } = data;

        if (!socket.userId) {
          console.log('🔴 [Socket] Utilisateur non authentifié');
          socket.emit('error', { message: 'Non authentifié' });
          return;
        }

        
        const sujet = contenu.trim().length > 50 
          ? contenu.trim().substring(0, 50) + '...' 
          : contenu.trim();

        
        const message = new Message({
          expediteur: socket.userId,
          destinataire: receiverId,
          sujet: sujet,
          contenu: contenu.trim(),
          type: 'chat',
          statut: 'envoye',
          dateEnvoi: new Date(),
          metadata: {
            maisonId: maisonId,
            receiverId: receiverId, 
          },
        });

        await message.save();
        console.log('✅ [Socket] Message sauvegardé en base:', message._id);

        
        const receiverSocket = connectedUsers.get(receiverId);
        if (receiverSocket) {
          io.to(receiverSocket.socketId).emit('new_private_message', {
            message: {
              ...message.toObject(),
              sender: {
                id: socket.userId,
                nom: socket.userNom
              }
            }
          });
        }
        
        
        if (socket.userRole === 'proprietaire') {
          try {
            
            const receiver = await User.findById(receiverId);
            if (receiver && receiver.role === 'resident') {
              const notifications = require('../utils/notifications');
              const messagePreview = contenu.trim().length > 50 
                ? contenu.trim().substring(0, 50) + '...' 
                : contenu.trim();
              await notifications.envoyer(receiverId, `Nouveau message de ${socket.userNom}: ${messagePreview}`);
              console.log(`✅ Notification message privé envoyée au résident ${receiverId}`);
            }
          } catch (e) {
            console.error('Notif push (privé) échouée:', e?.message || e);
          }
        }

        
        socket.emit('message_sent', {
          message: 'Message envoyé',
          messageId: message._id
        });

      } catch (error) {
        console.error('Erreur lors de l\'envoi du message privé:', error);
        socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
      }
    });

    
    socket.on('send_group_message', async (data) => {
      try {
        const { maisonId, contenu, type = 'text' } = data;

        if (!socket.userId) {
          socket.emit('error', { message: 'Non authentifié' });
          return;
        }

        
        const maison = await Maison.findById(maisonId);
        if (!maison) {
          socket.emit('error', { message: 'Maison non trouvée' });
          return;
        }

        const isInHouse = socket.userRole === 'proprietaire' 
          ? maison.proprietaireId.equals(socket.userId)
          : maison.listeResidents.includes(socket.userId);

        if (!isInHouse) {
          socket.emit('error', { message: 'Accès non autorisé à cette maison' });
          return;
        }

        
        const destinataireId = socket.userId;

        
        const sujet = contenu.trim().length > 50 
          ? contenu.trim().substring(0, 50) + '...' 
          : contenu.trim();

        
        const message = new Message({
          expediteur: socket.userId,
          destinataire: destinataireId,
          sujet: sujet,
          contenu: contenu.trim(),
          type: 'chat', 
          statut: 'envoye',
          dateEnvoi: new Date(),
          metadata: {
            maisonId: maisonId,
            receiverId: null, 
          },
        });

        await message.save();

        
        io.to(`maison:${maisonId}`).emit('new_group_message', {
          message: {
            ...message.toObject(),
            sender: {
              id: socket.userId,
              nom: socket.userNom
            }
          }
        });

        
        if (socket.userRole === 'proprietaire') {
          try {
            const notifications = require('../utils/notifications');
            
            if (Array.isArray(maison.listeResidents)) {
              const messagePreview = contenu.trim().length > 50 
                ? contenu.trim().substring(0, 50) + '...' 
                : contenu.trim();
              for (const residentId of maison.listeResidents) {
                const residentIdStr = residentId.toString();
                if (residentIdStr !== socket.userId.toString()) {
                  await notifications.envoyer(residentIdStr, `Nouveau message de ${socket.userNom}: ${messagePreview}`);
                }
              }
              console.log(`✅ Notifications message groupe envoyées aux résidents de la maison ${maisonId}`);
            }
          } catch (e) {
            console.error('Notif push (groupe) échouée:', e?.message || e);
          }
        }

        
        socket.emit('message_sent', {
          message: 'Message envoyé',
          messageId: message._id
        });

      } catch (error) {
        console.error('Erreur lors de l\'envoi du message de groupe:', error);
        socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
      }
    });

    
    socket.on('mark_as_read', async (data) => {
      try {
        const { messageId } = data;

        if (!socket.userId) {
          socket.emit('error', { message: 'Non authentifié' });
          return;
        }

        const message = await Message.findById(messageId);
        if (!message) {
          socket.emit('error', { message: 'Message non trouvé' });
          return;
        }

        
        if (!message.receiverId.equals(socket.userId)) {
          socket.emit('error', { message: 'Accès non autorisé' });
          return;
        }

        await message.marquerCommeLu();

        
        const senderSocket = connectedUsers.get(message.senderId.toString());
        if (senderSocket) {
          io.to(senderSocket.socketId).emit('message_read', {
            messageId: message._id,
            readBy: socket.userId,
            readAt: message.dateLecture
          });
        }

        socket.emit('message_marked_read', {
          messageId: message._id
        });

      } catch (error) {
        console.error('Erreur lors du marquage comme lu:', error);
        socket.emit('error', { message: 'Erreur lors du marquage' });
      }
    });

    
    socket.on('join_house', async (data) => {
      try {
        const { maisonId } = data;

        if (!socket.userId) {
          socket.emit('error', { message: 'Non authentifié' });
          return;
        }

        
        const maison = await Maison.findById(maisonId);
        if (!maison) {
          socket.emit('error', { message: 'Maison non trouvée' });
          return;
        }

        const isInHouse = socket.userRole === 'proprietaire' 
          ? maison.proprietaireId.equals(socket.userId)
          : maison.listeResidents.includes(socket.userId);

        if (!isInHouse) {
          socket.emit('error', { message: 'Accès non autorisé' });
          return;
        }

        socket.join(`maison:${maisonId}`);
        socket.emit('joined_house', { maisonId });

      } catch (error) {
        console.error('Erreur lors de la jointure de maison:', error);
        socket.emit('error', { message: 'Erreur lors de la jointure' });
      }
    });

    
    socket.on('leave_house', (data) => {
      const { maisonId } = data;
      socket.leave(`maison:${maisonId}`);
      socket.emit('left_house', { maisonId });
    });

    
    socket.on('typing_start', (data) => {
      const { receiverId, maisonId } = data;
      
      if (receiverId) {
        
        const receiverSocket = connectedUsers.get(receiverId);
        if (receiverSocket) {
          io.to(receiverSocket.socketId).emit('user_typing', {
            userId: socket.userId,
            userName: socket.userNom
          });
        }
      } else if (maisonId) {
        
        socket.to(`maison:${maisonId}`).emit('user_typing', {
          userId: socket.userId,
          userName: socket.userNom
        });
      }
    });

    socket.on('typing_stop', (data) => {
      const { receiverId, maisonId } = data;
      
      if (receiverId) {
        const receiverSocket = connectedUsers.get(receiverId);
        if (receiverSocket) {
          io.to(receiverSocket.socketId).emit('user_stopped_typing', {
            userId: socket.userId
          });
        }
      } else if (maisonId) {
        socket.to(`maison:${maisonId}`).emit('user_stopped_typing', {
          userId: socket.userId
        });
      }
    });

    
    socket.on('disconnect', () => {
      console.log(`Déconnexion: ${socket.id}`);
      
      if (socket.userId) {
        connectedUsers.delete(socket.userId.toString());
      }
    });
  });

  
  const sendSystemNotification = async (userId, message, type = 'system') => {
    try {
      const userSocket = connectedUsers.get(userId.toString());
      if (userSocket) {
        io.to(userSocket.socketId).emit('system_notification', {
          message,
          type,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi de notification système:', error);
    }
  };

  
  const sendFactureNotification = async (userId, factureData) => {
    try {
      const userSocket = connectedUsers.get(userId.toString());
      if (userSocket) {
        io.to(userSocket.socketId).emit('facture_notification', {
          facture: factureData,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi de notification facture:', error);
    }
  };

  return {
    sendSystemNotification,
    sendFactureNotification,
    connectedUsers
  };
};

module.exports = socketManager;
