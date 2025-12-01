# 🏠 API Ecopower - Gestion de Consommation Électrique

API backend complète pour l'application Ecopower, permettant la gestion de la consommation d'électricité dans les maisons de location via des "additionneuses".

## 📋 Table des matières

- [Fonctionnalités](#-fonctionnalités)
- [Architecture](#-architecture)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Structure du projet](#-structure-du-projet)
- [API Endpoints](#-api-endpoints)
- [Authentification](#-authentification)
- [Messagerie temps réel](#-messagerie-temps-réel)
- [Tâches automatiques](#-tâches-automatiques)
- [Sécurité](#-sécurité)
- [Déploiement](#-déploiement)

## ✨ Fonctionnalités

### 🔐 Authentification & Gestion des utilisateurs
- **Inscription/Connexion** des propriétaires et résidents
- **JWT** avec refresh tokens
- **Rôles** : propriétaire et résident
- **Premier login** avec changement de mot de passe obligatoire

### 🏢 Gestion des propriétés
- **Création de maisons** par les propriétaires
- **Gestion des résidents** avec quota selon l'abonnement
- **Association** résidents ↔ maisons

### ⚡ Gestion de la consommation
- **Enregistrement** des kWh consommés par résident
- **Historique** des consommations
- **Calcul automatique** des montants

### 💰 Facturation
- **Génération automatique** de factures
- **Calcul des montants** basé sur la consommation
- **Statuts** : payée, non payée, en retard
- **Notifications** WhatsApp automatiques

### 📱 Abonnements
- **3 niveaux** : Basic, Premium, Enterprise
- **Gestion des quotas** de résidents
- **Renouvellement automatique**
- **Notifications d'expiration**

### 💬 Messagerie temps réel
- **Messages privés** entre utilisateurs
- **Messages de groupe** par maison
- **Notifications** en temps réel
- **Indicateurs de frappe**

### 🔔 Notifications
- **WhatsApp** pour les identifiants et factures
- **Notifications système** en temps réel
- **Rappels automatiques** de paiement

## 🏗️ Architecture

```
ecopower-api/
├── app.js                 # Point d'entrée principal
├── models/               # Modèles Mongoose
│   ├── User.js
│   ├── Abonnement.js
│   ├── Maison.js
│   ├── Consommation.js
│   ├── Facture.js
│   └── Message.js
├── controllers/          # Logique métier
│   ├── authController.js
│   ├── residentsController.js
│   ├── consommationsController.js
│   ├── facturesController.js
│   ├── abonnementsController.js
│   └── maisonsController.js
├── routes/              # Routes Express
│   ├── auth.js
│   ├── residents.js
│   ├── consommations.js
│   ├── factures.js
│   ├── abonnements.js
│   └── maisons.js
├── middlewares/         # Middlewares personnalisés
│   ├── auth.js
│   └── checkSubscription.js
├── sockets/             # Gestion Socket.io
│   └── socketManager.js
├── utils/               # Utilitaires
│   ├── passwordUtils.js
│   ├── whatsappUtils.js
│   ├── notifications.js
│   └── cronJobs.js
└── package.json
```

## 🚀 Installation

### Prérequis
- Node.js (v16 ou supérieur)
- MongoDB (v5 ou supérieur)
- npm ou yarn

### Étapes d'installation

1. **Cloner le projet**
```bash
git clone <repository-url>
cd ecologis-api
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configurer les variables d'environnement**
```bash
cp env.example .env
# Éditer le fichier .env avec vos configurations
```

4. **Démarrer MongoDB**
```bash
# Assurez-vous que MongoDB est en cours d'exécution
mongod
```

5. **Lancer l'application**
```bash
# Développement
npm run server

# Production
npm start
```

## ⚙️ Configuration

### Variables d'environnement (.env)

```env
# Configuration MongoDB
MONGODB_URI=mongodb://localhost:27017/ecopower

# Configuration JWT
JWT_SECRET=votre_secret_jwt_tres_securise_ici
JWT_REFRESH_SECRET=votre_refresh_secret_tres_securise_ici
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Configuration Email (SMTP)
# Pour activer l'envoi d'emails réels, configurez ces variables :
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=votre_email@gmail.com
SMTP_PASSWORD=votre_mot_de_passe_application

# Note: Pour Gmail, vous devez utiliser un "Mot de passe d'application" 
# généré depuis votre compte Google (pas votre mot de passe principal)

# Configuration WhatsApp (pour plus tard)
WHATSAPP_API_KEY=votre_whatsapp_api_key
WHATSAPP_PHONE_NUMBER=votre_numero_whatsapp

# Configuration serveur
PORT=3000
NODE_ENV=development

# Configuration notifications (pour plus tard)
FIREBASE_SERVER_KEY=votre_firebase_server_key
```

## 📡 API Endpoints

### 🔐 Authentification
```
POST /auth/register          # Créer un compte propriétaire
POST /auth/login             # Connexion
POST /auth/refresh           # Rafraîchir le token
POST /auth/logout            # Déconnexion
POST /auth/reset-password    # Changement mot de passe (premier login)
POST /auth/change-password   # Changement mot de passe normal
```

### 👥 Résidents
```
POST /residents              # Ajouter un résident
GET /residents               # Lister les résidents
GET /residents/:id           # Obtenir un résident
PUT /residents/:id           # Mettre à jour un résident
DELETE /residents/:id        # Supprimer un résident
```

### ⚡ Consommations
```
POST /consommations                          # Enregistrer une consommation
GET /consommations/resident/:residentId      # Historique d'un résident
GET /consommations/maison/:maisonId          # Consommations d'une maison
PUT /consommations/:id                       # Mettre à jour une consommation
DELETE /consommations/:id                    # Supprimer une consommation
```

### 💰 Factures
```
POST /factures/generer/:residentId           # Générer une facture
GET /factures/resident/:residentId           # Factures d'un résident
GET /factures/maison/:maisonId               # Factures d'une maison
GET /factures/:id                            # Obtenir une facture
PUT /factures/:id/payer                      # Marquer comme payée
```

### 📱 Abonnements
```
GET /abonnements                             # Liste des offres (public)
POST /abonnements/souscrire                  # Souscrire à un abonnement
POST /abonnements/renouveler                 # Renouveler un abonnement
GET /abonnements/actuel                      # Abonnement actuel
POST /abonnements/annuler                    # Annuler un abonnement
GET /abonnements/historique                  # Historique des abonnements
```

### 🏠 Maisons
```
POST /maisons                                # Créer une maison
GET /maisons                                 # Lister les maisons
GET /maisons/:id                             # Obtenir une maison
PUT /maisons/:id                             # Mettre à jour une maison
DELETE /maisons/:id                          # Supprimer une maison
POST /maisons/residents/ajouter              # Ajouter un résident
POST /maisons/residents/retirer              # Retirer un résident
```

## 🔐 Authentification

### JWT Tokens
L'API utilise des JWT tokens pour l'authentification :

```javascript
// Headers requis
Authorization: Bearer <access_token>

// Refresh token
{
  "refreshToken": "<refresh_token>"
}
```

### Rôles et permissions
- **Propriétaire** : Accès complet à ses propriétés et résidents
- **Résident** : Accès limité à ses propres données

## 💬 Messagerie temps réel

### Connexion Socket.io
```javascript
const socket = io('http://localhost:3000');

// Authentification
socket.emit('authenticate', { token: 'user_id' });

// Écouter les événements
socket.on('authenticated', (data) => {
  console.log('Connecté:', data);
});
```

### Événements disponibles
```javascript
// Messages privés
socket.emit('send_private_message', {
  receiverId: 'user_id',
  contenu: 'Message privé',
  maisonId: 'maison_id'
});

// Messages de groupe
socket.emit('send_group_message', {
  maisonId: 'maison_id',
  contenu: 'Message de groupe',
  type: 'text'
});

// Marquer comme lu
socket.emit('mark_as_read', { messageId: 'message_id' });

// Indicateurs de frappe
socket.emit('typing_start', { receiverId: 'user_id' });
socket.emit('typing_stop', { receiverId: 'user_id' });
```

## ⏰ Tâches automatiques

### Tâches cron configurées
- **2h00** : Vérification des abonnements expirés
- **3h00** : Vérification des factures en retard
- **6h00** : Génération des statistiques quotidiennes
- **9h00** : Notifications d'expiration d'abonnement
- **10h00** : Notifications de factures en retard
- **4h00 (dimanche)** : Nettoyage des anciens messages
- **Toutes les heures** : Vérification de la santé de la DB

### Exécution manuelle
```javascript
const { runTaskManually } = require('./utils/cronJobs');

// Exécuter une tâche manuellement
await runTaskManually('checkExpiredSubscriptions');
```

## 🔒 Sécurité

### Mesures implémentées
- **Rate limiting** sur les routes sensibles
- **Hash bcrypt** pour les mots de passe
- **JWT tokens** avec expiration
- **Validation** des données d'entrée
- **Autorisations** basées sur les rôles
- **HTTPS** recommandé en production

### Bonnes pratiques
- Utilisez des secrets forts pour JWT
- Activez HTTPS en production
- Surveillez les logs d'erreur
- Mettez à jour régulièrement les dépendances

## 🚀 Déploiement

### Production
1. **Variables d'environnement**
   - Configurez `NODE_ENV=production`
   - Utilisez une base MongoDB sécurisée
   - Configurez les secrets JWT

2. **Process Manager**
   ```bash
   npm install -g pm2
   pm2 start app.js --name ecologis-api
   ```

3. **Reverse Proxy (Nginx)**
   ```nginx
   server {
       listen 80;
       server_name votre-domaine.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

### Docker (optionnel)
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 📊 Monitoring

### Logs
L'application génère des logs détaillés :
- Connexions utilisateurs
- Erreurs d'authentification
- Notifications envoyées
- Tâches cron exécutées

### Métriques
- Nombre d'utilisateurs connectés
- Statistiques de consommation
- Taux de paiement des factures
- Performance de la base de données

## 🤝 Contribution

1. Fork le projet
2. Créez une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## 📄 Licence

Ce projet est sous licence ISC.

## 📞 Support

Pour toute question ou problème :
- Ouvrez une issue sur GitHub
- Contactez l'équipe de développement

---

**Ecologis API** - Gestion intelligente de la consommation électrique 🏠⚡
