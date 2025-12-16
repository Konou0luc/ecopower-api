const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const mongoosePaginate = require("mongoose-paginate-v2");

const userSchema = new mongoose.Schema(
  {
    nom: {
      type: String,
      required: true,
      trim: true,
    },
    prenom: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    telephone: {
      type: String,
      required: true,
      trim: true,
    },
    motDePasse: {
      type: String,
      required: false, // Rendre optionnel pour permettre Google Sign-In
      default: null,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true, // Permet plusieurs null
      default: null,
    },
    authMethod: {
      type: String,
      enum: ['google', 'email'],
      default: 'email',
    },
    role: {
      type: String,
      enum: ["proprietaire", "resident", "admin"],
      required: true,
    },
    idProprietaire: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    abonnementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Abonnement",
      default: null,
    },
    maisonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Maison",
      default: null,
    },
    firstLogin: {
      type: Boolean,
      default: false,
    },
    refreshToken: {
      type: String,
      default: null,
    },
    deviceToken: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Validation personnalisée : au moins googleId ou motDePasse doit être présent
// Exception : les résidents avec authMethod: 'google' peuvent être créés sans googleId
// (ils seront créés par le propriétaire avant leur première connexion Google)
userSchema.pre("validate", function (next) {
  // Si c'est un résident avec authMethod: 'google', permettre la création sans googleId
  // Le googleId sera ajouté lors de la première connexion Google
  if (this.role === 'resident' && this.authMethod === 'google' && !this.googleId && !this.motDePasse) {
    return next(); // Autoriser la création
  }
  
  // Pour les autres cas, au moins googleId ou motDePasse doit être présent
  if (!this.googleId && !this.motDePasse) {
    const error = new Error('Au moins une méthode d\'authentification est requise (Google ou mot de passe)');
    return next(error);
  }
  next();
});

// Hash du mot de passe avant sauvegarde (seulement si motDePasse est fourni)
userSchema.pre("save", async function (next) {
  // Si c'est une authentification Google, pas besoin de hasher le mot de passe
  if (this.authMethod === 'google' || !this.motDePasse) {
    return next();
  }

  if (!this.isModified("motDePasse")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.motDePasse = await bcrypt.hash(this.motDePasse, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Méthode pour comparer les mots de passe
userSchema.methods.comparePassword = async function (candidatePassword) {
  // Si l'utilisateur utilise Google Sign-In, pas de comparaison de mot de passe
  if (this.authMethod === 'google' || !this.motDePasse) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.motDePasse);
};

// Méthode pour obtenir le nom complet
userSchema.virtual("nomComplet").get(function () {
  return `${this.prenom} ${this.nom}`;
});

// Configuration pour inclure les virtuals dans les réponses JSON
userSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    delete ret.motDePasse;
    delete ret.refreshToken;
    return ret;
  },
});

// Ajouter le plugin de pagination
userSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("User", userSchema);
