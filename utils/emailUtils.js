


const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');


const getLogoUrl = () => {
  
  if (process.env.EMAIL_LOGO_URL) {
    return process.env.EMAIL_LOGO_URL;
  }
  
  
  
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/logo.png`;
  }
  
  
  if (process.env.API_URL) {
    return `${process.env.API_URL}/logo.png`;
  }
  
  
  const logoPath = path.join(__dirname, '../image/app/logo.png');
  if (fs.existsSync(logoPath)) {
    
    return logoPath;
  }
  
  
  return null;
};


const createTransporter = () => {
  
  const emailConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', 
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  };

  
  if (!emailConfig.auth.user || !emailConfig.auth.pass) {
    console.warn('⚠️ [EMAIL] Configuration SMTP non trouvée. Utilisation du mode test (emails ne seront pas envoyés).');
    console.warn('⚠️ [EMAIL] Configurez SMTP_USER, SMTP_PASSWORD, SMTP_HOST dans votre .env');
    
    
    return null;
  }

  try {
    return nodemailer.createTransport(emailConfig);
  } catch (error) {
    console.error('❌ [EMAIL] Erreur lors de la création du transporteur:', error);
    return null;
  }
};


const sendPasswordResetEmail = async (email, motDePasseTemporaire, fullName) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      
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
      ? `<img src="${logoUrl.startsWith('http') ? logoUrl : `cid:logo`}" alt="Ecopower Logo" style="max-width: 120px; height: auto; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;" width="120" height="auto" />`
      : '';
    
    const attachments = [];
    
    if (logoUrl && !logoUrl.startsWith('http')) {
      attachments.push({
        filename: 'logo.png',
        path: logoUrl,
        cid: 'logo' 
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


const sendCredentialsEmail = async (email, motDePasseTemporaire, fullName) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      
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
      ? `<img src="${logoUrl.startsWith('http') ? logoUrl : `cid:logo`}" alt="Ecopower Logo" style="max-width: 120px; height: auto; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;" width="120" height="auto" />`
      : '';
    
    const attachments = [];
    
    if (logoUrl && !logoUrl.startsWith('http')) {
      attachments.push({
        filename: 'logo.png',
        path: logoUrl,
        cid: 'logo' 
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


const sendGoogleInvitationEmail = async (email, fullName, maisonName) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      
      console.log('📧 [EMAIL SIMULÉ] Invitation Google Sign-In:');
      console.log(`   Destinataire: ${email}`);
      console.log(`   Nom: ${fullName || 'Utilisateur'}`);
      console.log(`   Maison: ${maisonName || 'N/A'}`);
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
      ? `<img src="${logoUrl.startsWith('http') ? logoUrl : `cid:logo`}" alt="Ecopower Logo" style="max-width: 120px; height: auto; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;" width="120" height="auto" />`
      : '';
    
    const attachments = [];
    if (logoUrl && !logoUrl.startsWith('http')) {
      attachments.push({
        filename: 'logo.png',
        path: logoUrl,
        cid: 'logo'
      });
    }

    const mailOptions = {
      from: `"Ecopower" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Invitation Ecopower - Connectez-vous avec Google',
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
            .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4285F4; }
            .steps { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .step { padding: 10px 0; border-bottom: 1px solid #eee; }
            .step:last-child { border-bottom: none; }
            .step-number { display: inline-block; width: 30px; height: 30px; background: #4285F4; color: white; border-radius: 50%; text-align: center; line-height: 30px; font-weight: bold; margin-right: 10px; }
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
              <p>Vous avez été ajouté comme résident${maisonName ? ` pour la maison "${maisonName}"` : ''} sur Ecopower.</p>
              
              <div class="info-box">
                <p><strong>📧 Email de connexion :</strong> ${email}</p>
                <p><strong>🔐 Méthode de connexion :</strong> Google Sign-In</p>
              </div>

              <div class="steps">
                <p><strong>Pour vous connecter :</strong></p>
                <div class="step">
                  <span class="step-number">1</span>
                  <strong>Ouvrez l'application Ecopower</strong>
                </div>
                <div class="step">
                  <span class="step-number">2</span>
                  <strong>Cliquez sur "Se connecter avec Google"</strong>
                </div>
                <div class="step">
                  <span class="step-number">3</span>
                  <strong>Sélectionnez votre compte Google : ${email}</strong>
                </div>
                <div class="step">
                  <span class="step-number">4</span>
                  <strong>Vous serez automatiquement connecté !</strong>
                </div>
              </div>

              <p style="margin-top: 20px;"><strong>💡 Astuce :</strong> Assurez-vous d'utiliser le compte Google associé à l'email ${email}.</p>

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

Vous avez été ajouté comme résident${maisonName ? ` pour la maison "${maisonName}"` : ''} sur Ecopower.

📧 Email de connexion : ${email}
🔐 Méthode de connexion : Google Sign-In

Pour vous connecter :
1. Ouvrez l'application Ecopower
2. Cliquez sur "Se connecter avec Google"
3. Sélectionnez votre compte Google : ${email}
4. Vous serez automatiquement connecté !

💡 Astuce : Assurez-vous d'utiliser le compte Google associé à l'email ${email}.

© ${new Date().getFullYear()} Ecopower
      `.trim(),
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ [EMAIL] Invitation Google Sign-In envoyée avec succès:', info.messageId);
    
    return {
      success: true,
      messageId: info.messageId,
      sentAt: new Date(),
      to: email,
      mode: 'production'
    };
  } catch (error) {
    console.error('❌ [EMAIL] Erreur lors de l\'envoi de l\'invitation:', error);
    
    return {
      success: false,
      error: error.message,
      mode: 'error_fallback'
    };
  }
};


const sendContactEmail = async (contactData) => {
  try {
    const { name, email, phone, subject, message } = contactData;
    const transporter = createTransporter();
    
    if (!transporter) {
      
      console.log('📧 [EMAIL SIMULÉ] Email de contact:');
      console.log(`   Nom: ${name}`);
      console.log(`   Email: ${email}`);
      console.log(`   Téléphone: ${phone}`);
      console.log(`   Sujet: ${subject}`);
      console.log(`   Message: ${message}`);
      console.log('   ⚠️ Pour activer l\'envoi réel, configurez SMTP_USER et SMTP_PASSWORD dans .env');
      
      return {
        success: true,
        messageId: `email_sim_${Date.now()}`,
        sentAt: new Date(),
        to: process.env.CONTACT_EMAIL || process.env.SMTP_USER,
        mode: 'simulation'
      };
    }

    const logoUrl = getLogoUrl();
    const logoHtml = logoUrl 
      ? `<img src="${logoUrl.startsWith('http') ? logoUrl : `cid:logo`}" alt="Ecopower Logo" style="max-width: 120px; height: auto; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;" width="120" height="auto" />`
      : '';
    
    const attachments = [];
    
    if (logoUrl && !logoUrl.startsWith('http')) {
      attachments.push({
        filename: 'logo.png',
        path: logoUrl,
        cid: 'logo' 
      });
    }

    
    const subjectLabels = {
      'demande-info': 'Demande d\'information',
      'devis': 'Demande de devis',
      'support': 'Support technique',
      'partenariat': 'Partenariat',
      'autre': 'Autre'
    };
    const subjectLabel = subjectLabels[subject] || subject;

    const recipientEmail = process.env.CONTACT_EMAIL || process.env.SMTP_USER;

    const mailOptions = {
      from: `"Ecopower Contact" <${process.env.SMTP_USER}>`,
      to: recipientEmail,
      replyTo: email, 
      subject: `[Contact Ecopower] ${subjectLabel} - ${name}`,
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
            .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #FFA800; }
            .info-row { margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #eee; }
            .info-row:last-child { border-bottom: none; }
            .info-label { font-weight: bold; color: #666; display: inline-block; width: 120px; }
            .message-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4CAF50; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              ${logoHtml}
              <h1 style="margin-top: ${logoHtml ? '10px' : '0'}; margin-bottom: 0;">Nouveau message de contact</h1>
            </div>
            <div class="content">
              <p>Vous avez reçu un nouveau message depuis le formulaire de contact du site Ecopower.</p>
              
              <div class="info-box">
                <div class="info-row">
                  <span class="info-label">📧 Email :</span>
                  <span>${email}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">👤 Nom :</span>
                  <span>${name}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">📱 Téléphone :</span>
                  <span>${phone}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">📋 Sujet :</span>
                  <span>${subjectLabel}</span>
                </div>
              </div>

              <div class="message-box">
                <h3 style="margin-top: 0; color: #4CAF50;">💬 Message :</h3>
                <p style="white-space: pre-wrap; margin: 0;">${message}</p>
              </div>

              <p style="margin-top: 30px;">
                <strong>💡 Pour répondre :</strong> Répondez directement à cet email. L'adresse de réponse est configurée pour ${email}.
              </p>

              <div class="footer">
                <p>© ${new Date().getFullYear()} Ecopower - Gestion de consommation électrique</p>
                <p>Cet email a été envoyé automatiquement depuis le formulaire de contact du site web.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Nouveau message de contact - Ecopower

Vous avez reçu un nouveau message depuis le formulaire de contact du site Ecopower.

📧 Email : ${email}
👤 Nom : ${name}
📱 Téléphone : ${phone}
📋 Sujet : ${subjectLabel}

💬 Message :
${message}

---
Pour répondre, répondez directement à cet email.
© ${new Date().getFullYear()} Ecopower
      `.trim(),
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ [EMAIL] Email de contact envoyé avec succès:', info.messageId);
    
    return {
      success: true,
      messageId: info.messageId,
      sentAt: new Date(),
      to: recipientEmail,
      mode: 'production'
    };
  } catch (error) {
    console.error('❌ [EMAIL] Erreur lors de l\'envoi de l\'email de contact:', error);
    
    
    console.log('📧 [EMAIL FALLBACK] Message de contact pour développement:');
    console.log(`   Nom: ${contactData.name}`);
    console.log(`   Email: ${contactData.email}`);
    console.log(`   Téléphone: ${contactData.phone}`);
    console.log(`   Sujet: ${contactData.subject}`);
    console.log(`   Message: ${contactData.message}`);
    
    return {
      success: false,
      error: error.message,
      mode: 'error_fallback'
    };
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendCredentialsEmail,
  sendGoogleInvitationEmail,
  sendContactEmail
};


