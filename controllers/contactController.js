// Contrôleur pour gérer les messages de contact depuis le site web

const { sendContactEmail } = require('../utils/emailUtils');

// POST /contact - Envoyer un message de contact
const sendContactMessage = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Validation des champs requis
    if (!name || !email || !phone || !subject || !message) {
      return res.status(400).json({ 
        message: 'Tous les champs sont requis',
        errors: {
          name: !name ? 'Le nom est requis' : undefined,
          email: !email ? 'L\'email est requis' : undefined,
          phone: !phone ? 'Le téléphone est requis' : undefined,
          subject: !subject ? 'Le sujet est requis' : undefined,
          message: !message ? 'Le message est requis' : undefined,
        }
      });
    }

    // Validation de l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        message: 'Format d\'email invalide',
        errors: { email: 'Format d\'email invalide' }
      });
    }

    // Validation du téléphone (au moins 8 caractères)
    if (phone.replace(/[\s\-()]/g, '').length < 8) {
      return res.status(400).json({ 
        message: 'Format de téléphone invalide',
        errors: { phone: 'Le téléphone doit contenir au moins 8 chiffres' }
      });
    }

    // Validation de la longueur du message
    if (message.trim().length < 10) {
      return res.status(400).json({ 
        message: 'Le message est trop court',
        errors: { message: 'Le message doit contenir au moins 10 caractères' }
      });
    }

    // Envoyer l'email
    const result = await sendContactEmail({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      subject: subject.trim(),
      message: message.trim()
    });

    if (result.success) {
      console.log('✅ [CONTACT] Message de contact envoyé:', {
        name,
        email,
        subject,
        mode: result.mode
      });

      return res.status(200).json({
        message: 'Message envoyé avec succès',
        success: true,
        mode: result.mode
      });
    } else {
      console.error('❌ [CONTACT] Erreur lors de l\'envoi:', result.error);
      
      return res.status(500).json({
        message: 'Erreur lors de l\'envoi du message. Veuillez réessayer plus tard.',
        success: false,
        error: process.env.NODE_ENV === 'development' ? result.error : undefined
      });
    }
  } catch (error) {
    console.error('❌ [CONTACT] Erreur serveur:', error);
    
    return res.status(500).json({
      message: 'Erreur serveur. Veuillez réessayer plus tard.',
      success: false,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  sendContactMessage
};

