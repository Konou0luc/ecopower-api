// Utilitaires pour l'envoi d'emails
// Utilise nodemailer pour l'envoi d'emails réels

const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

// Obtenir l'URL ou le chemin du logo
const getLogoUrl = () => {
  // Option 1: URL publique du logo (recommandé pour la production)
  if (process.env.EMAIL_LOGO_URL) {
    return process.env.EMAIL_LOGO_URL;
  }
  
  // Option 2: URL automatique basée sur l'API (pour Vercel)
  // Si on est sur Vercel, utiliser l'URL de l'API
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/logo.png`;
  }
  
  // Option 3: URL de l'API si configurée
  if (process.env.API_URL) {
    return `${process.env.API_URL}/logo.png`;
  }
  
  // Option 4: Chemin local du logo (pour développement local)
  const logoPath = path.join(__dirname, '../image/app/logo.png');
  if (fs.existsSync(logoPath)) {
    // Si le logo existe localement, on peut l'utiliser comme CID (Content-ID) pour l'inclure inline
    return logoPath;
  }
  
  // Option 5: Pas de logo configuré
  return null;
};

// Créer un transporteur email (peut être configuré avec Gmail, SMTP, etc.)
const createTransporter = () => {
  // Configuration depuis les variables d'environnement
  const emailConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true pour 465, false pour autres ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  };

  // Si les credentials ne sont pas configurés, utiliser un transporteur de test
  if (!emailConfig.auth.user || !emailConfig.auth.pass) {
    console.warn('⚠️ [EMAIL] Configuration SMTP non trouvée. Utilisation du mode test (emails ne seront pas envoyés).');
    console.warn('⚠️ [EMAIL] Configurez SMTP_USER, SMTP_PASSWORD, SMTP_HOST dans votre .env');
    
    // Retourner null pour indiquer qu'on ne peut pas envoyer d'emails
    return null;
  }

  try {
    return nodemailer.createTransport(emailConfig);
  } catch (error) {
    console.error('❌ [EMAIL] Erreur lors de la création du transporteur:', error);
    return null;
  }
};

// Envoyer un email avec un mot de passe temporaire
const sendPasswordResetEmail = async (email, motDePasseTemporaire, fullName) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      // Mode développement : afficher dans la console
      console.log('📧 [EMAIL SIMULÉ] Email de réinitialisation de mot de passe:');
      console.log(`   Destinataire: ${email}`);
      console.log(`   Nom: ${fullName || 'Utilisateur'}`);
      console.log(`   Mot de passe temporaire: ${motDePasseTemporaire}`);
      console.log('   ⚠️ Pour activer l\'envoi réel, configurez SMTP_USER et SMTP_PASSWORD dans .env');
      
      return {
        success: true,
        messageId: `email_sim_${Date.now()}`,
        sentAt: new Date(),
        to: email,
        mode: 'simulation'
      };
    }

    const logoUrl = getLogoUrl();
    const logoHtml = logoUrl 
      ? `<img src="${logoUrl.startsWith('http') ? logoUrl : `cid:logo`}" alt="Ecopower Logo" style="max-width: 120px; height: auto; margin-bottom: 15px;" />`
      : '';
    
    const attachments = [];
    // Si le logo est un chemin local, l'ajouter comme pièce jointe inline
    if (logoUrl && !logoUrl.startsWith('http')) {
      attachments.push({
        filename: 'logo.png',
        path: logoUrl,
        cid: 'logo' // Content-ID pour référence dans le HTML
      });
    }

    const mailOptions = {
      from: `"Ecopower" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Réinitialisation de votre mot de passe Ecopower',
      attachments: attachments.length > 0 ? attachments : undefined,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #FFA800 0%, #E69500 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .credentials { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #FFA800; }
            .password { font-size: 24px; font-weight: bold; color: #FFA800; letter-spacing: 2px; text-align: center; padding: 10px; background: #f0f0f0; border-radius: 5px; }
            .warning { background: #FFF8E1; border-left: 4px solid #FFD700; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              ${logoHtml}
              <h1 style="margin-top: ${logoHtml ? '10px' : '0'}; margin-bottom: 0;">Réinitialisation de mot de passe</h1>
            </div>
            <div class="content">
              <p>Bonjour ${fullName || 'Utilisateur'},</p>
              <p>Vous avez demandé la réinitialisation de votre mot de passe pour votre compte Ecopower.</p>
              
              <div class="credentials">
                <p><strong>Votre nouveau mot de passe temporaire :</strong></p>
                <div class="password">${motDePasseTemporaire}</div>
              </div>

              <div class="warning">
                <p><strong>⚠️ IMPORTANT :</strong></p>
                <p>Pour des raisons de sécurité, veuillez changer ce mot de passe lors de votre première connexion dans l'application Ecopower.</p>
              </div>

              <p><strong>Pour vous connecter :</strong></p>
              <ol>
                <li>Ouvrez l'application Ecopower</li>
                <li>Entrez votre email : <strong>${email}</strong></li>
                <li>Entrez le mot de passe temporaire ci-dessus</li>
                <li>Vous serez invité à définir un nouveau mot de passe</li>
              </ol>

              <p>Si vous n'avez pas demandé cette réinitialisation, veuillez ignorer cet email ou contacter le support.</p>

              <div class="footer">
                <p>© ${new Date().getFullYear()} Ecopower - Gestion de consommation électrique</p>
                <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Bonjour ${fullName || 'Utilisateur'},

Vous avez demandé la réinitialisation de votre mot de passe pour votre compte Ecopower.

Votre nouveau mot de passe temporaire : ${motDePasseTemporaire}

⚠️ IMPORTANT : Pour des raisons de sécurité, veuillez changer ce mot de passe lors de votre première connexion dans l'application Ecopower.

Pour vous connecter :
1. Ouvrez l'application Ecopower
2. Entrez votre email : ${email}
3. Entrez le mot de passe temporaire ci-dessus
4. Vous serez invité à définir un nouveau mot de passe

Si vous n'avez pas demandé cette réinitialisation, veuillez ignorer cet email ou contacter le support.

© ${new Date().getFullYear()} Ecopower
      `.trim(),
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ [EMAIL] Email de réinitialisation envoyé avec succès:', info.messageId);
    
    return {
      success: true,
      messageId: info.messageId,
      sentAt: new Date(),
      to: email,
      mode: 'production'
    };
  } catch (error) {
    console.error('❌ [EMAIL] Erreur lors de l\'envoi de l\'email:', error);
    
    // En cas d'erreur, afficher dans la console pour le développement
    console.log('📧 [EMAIL FALLBACK] Mot de passe temporaire pour développement:');
    console.log(`   Email: ${email}`);
    console.log(`   Mot de passe: ${motDePasseTemporaire}`);
    
    return {
      success: false,
      error: error.message,
      mode: 'error_fallback'
    };
  }
};

// Envoyer les identifiants de connexion (pour nouveaux résidents)
const sendCredentialsEmail = async (email, motDePasseTemporaire, fullName) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      // Mode développement : afficher dans la console
      console.log('📧 [EMAIL SIMULÉ] Email d\'identifiants:');
      console.log(`   Destinataire: ${email}`);
      console.log(`   Nom: ${fullName || 'Utilisateur'}`);
      console.log(`   Mot de passe temporaire: ${motDePasseTemporaire}`);
      console.log('   ⚠️ Pour activer l\'envoi réel, configurez SMTP_USER et SMTP_PASSWORD dans .env');
      
      return {
        success: true,
        messageId: `email_sim_${Date.now()}`,
        sentAt: new Date(),
        to: email,
        mode: 'simulation'
      };
    }

    const logoUrl = getLogoUrl();
    const logoHtml = logoUrl 
      ? `<img src="${logoUrl.startsWith('http') ? logoUrl : `cid:logo`}" alt="Ecopower Logo" style="max-width: 120px; height: auto; margin-bottom: 15px;" />`
      : '';
    
    const attachments = [];
    // Si le logo est un chemin local, l'ajouter comme pièce jointe inline
    if (logoUrl && !logoUrl.startsWith('http')) {
      attachments.push({
        filename: 'logo.png',
        path: logoUrl,
        cid: 'logo' // Content-ID pour référence dans le HTML
      });
    }

    const mailOptions = {
      from: `"Ecopower" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Bienvenue sur Ecopower - Vos identifiants de connexion',
      attachments: attachments.length > 0 ? attachments : undefined,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #FFA800 0%, #E69500 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .credentials { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #FFA800; }
            .password { font-size: 24px; font-weight: bold; color: #FFA800; letter-spacing: 2px; text-align: center; padding: 10px; background: #f0f0f0; border-radius: 5px; }
            .warning { background: #FFF8E1; border-left: 4px solid #FFD700; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              ${logoHtml}
              <h1 style="margin-top: ${logoHtml ? '10px' : '0'}; margin-bottom: 0;">Bienvenue sur Ecopower</h1>
            </div>
            <div class="content">
              <p>Bonjour ${fullName || 'Utilisateur'},</p>
              <p>Votre compte Ecopower a été créé avec succès. Voici vos identifiants de connexion :</p>
              
              <div class="credentials">
                <p><strong>📧 Email :</strong> ${email}</p>
                <p><strong>🔑 Mot de passe temporaire :</strong></p>
                <div class="password">${motDePasseTemporaire}</div>
              </div>

              <div class="warning">
                <p><strong>⚠️ IMPORTANT :</strong></p>
                <p>Pour des raisons de sécurité, veuillez changer ce mot de passe lors de votre première connexion dans l'application Ecopower.</p>
              </div>

              <p><strong>Pour vous connecter :</strong></p>
              <ol>
                <li>Ouvrez l'application Ecopower</li>
                <li>Entrez votre email et le mot de passe temporaire ci-dessus</li>
                <li>Vous serez invité à définir un nouveau mot de passe</li>
              </ol>

              <div class="footer">
                <p>© ${new Date().getFullYear()} Ecopower - Gestion de consommation électrique</p>
                <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Bonjour ${fullName || 'Utilisateur'},

Votre compte Ecopower a été créé avec succès. Voici vos identifiants de connexion :

📧 Email : ${email}
🔑 Mot de passe temporaire : ${motDePasseTemporaire}

⚠️ IMPORTANT : Pour des raisons de sécurité, veuillez changer ce mot de passe lors de votre première connexion dans l'application Ecopower.

Pour vous connecter :
1. Ouvrez l'application Ecopower
2. Entrez votre email et le mot de passe temporaire ci-dessus
3. Vous serez invité à définir un nouveau mot de passe

© ${new Date().getFullYear()} Ecopower
      `.trim(),
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ [EMAIL] Email d\'identifiants envoyé avec succès:', info.messageId);
    
    return {
      success: true,
      messageId: info.messageId,
      sentAt: new Date(),
      to: email,
      mode: 'production'
    };
  } catch (error) {
    console.error('❌ [EMAIL] Erreur lors de l\'envoi de l\'email:', error);
    
    // En cas d'erreur, afficher dans la console pour le développement
    console.log('📧 [EMAIL FALLBACK] Identifiants pour développement:');
    console.log(`   Email: ${email}`);
    console.log(`   Mot de passe: ${motDePasseTemporaire}`);
    
    return {
      success: false,
      error: error.message,
      mode: 'error_fallback'
    };
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendCredentialsEmail
};


