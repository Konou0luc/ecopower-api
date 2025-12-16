# Guide de test des notifications FCM

Ce guide vous explique comment tester l'envoi de notifications push sur des appareils physiques.

## Prérequis

1. **Appareil physique** avec l'application Ecopower installée
2. **Compte utilisateur** connecté sur l'appareil (le deviceToken sera automatiquement enregistré)
3. **Backend** en cours d'exécution

## Méthode 1 : Script Node.js (Recommandé)

### Étape 1 : Lister les utilisateurs avec deviceToken

```bash
cd ecologis-api
npm run test-notification
```

Cela affichera tous les utilisateurs qui ont un deviceToken enregistré.

### Étape 2 : Envoyer une notification de test

```bash
npm run test-notification <userId> [message]
```

**Exemple :**
```bash
npm run test-notification 507f1f77bcf86cd799439011 "Bonjour, ceci est un test de notification"
```

Si vous ne spécifiez pas de message, un message par défaut sera utilisé.

## Méthode 2 : Via l'endpoint API (Postman/curl)

### Étape 1 : Obtenir votre token d'admin

Connectez-vous via l'API pour obtenir votre token d'authentification :

```bash
POST /auth/login
{
  "email": "admin@ecopower.com",
  "password": "votre-mot-de-passe"
}
```

Copiez le `accessToken` de la réponse.

### Étape 2 : Lister les utilisateurs avec deviceToken

```bash
GET /admin/users
Authorization: Bearer <votre-access-token>
```

Cherchez les utilisateurs qui ont un `deviceToken` non null.

### Étape 3 : Envoyer une notification de test

```bash
POST /admin/test/notification
Authorization: Bearer <votre-access-token>
Content-Type: application/json

{
  "userId": "507f1f77bcf86cd799439011",
  "message": "Bonjour, ceci est un test de notification"
}
```

**Paramètres :**
- `userId` (requis) : L'ID de l'utilisateur à qui envoyer la notification
- `message` (optionnel) : Le message de la notification. Si non fourni, un message par défaut sera utilisé.

### Exemple avec curl

```bash
curl -X POST https://ecopower-api.vercel.app/admin/test/notification \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "507f1f77bcf86cd799439011",
    "message": "Test de notification depuis curl"
  }'
```

## Vérification

### Sur l'appareil

1. Assurez-vous que l'application est ouverte ou en arrière-plan
2. La notification devrait apparaître dans la barre de notifications
3. En cliquant sur la notification, l'application devrait s'ouvrir

### Dans les logs du backend

Si la notification est envoyée avec succès, vous verrez :
```
✅ Notification envoyée avec succès
```

Si une erreur se produit, vous verrez :
```
❌ Erreur lors de l'envoi de la notification
```

## Dépannage

### L'utilisateur n'a pas de deviceToken

**Problème :** L'erreur indique que l'utilisateur n'a pas de deviceToken enregistré.

**Solution :**
1. Assurez-vous que l'utilisateur s'est connecté à l'application mobile
2. Le deviceToken est automatiquement enregistré lors de la connexion
3. Vérifiez que l'endpoint `/auth/device-token` est appelé correctement

### Erreur "SenderId mismatch"

**Problème :** Le deviceToken a été généré avec un autre projet Firebase.

**Solution :**
1. Vérifiez que le `google-services.json` dans l'app correspond au projet Firebase du backend
2. Réinstallez l'application sur l'appareil
3. Reconnectez-vous pour générer un nouveau deviceToken

### La notification n'arrive pas

**Vérifications :**
1. L'appareil est connecté à Internet
2. Les notifications sont activées pour l'application dans les paramètres de l'appareil
3. Le deviceToken est valide et non expiré
4. Le projet Firebase est correctement configuré

## Notes importantes

- Les notifications fonctionnent même si l'application est fermée (si les services de notification sont activés)
- Le deviceToken peut changer si l'application est réinstallée
- Les notifications peuvent prendre quelques secondes à arriver

