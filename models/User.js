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
      required: false,
      default: null,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      default: undefined,
    },
    authMethod: {
      type: String,
      enum: ["google", "email"],
      default: "email",
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
    homeLatitude: {
      type: Number,
      default: null,
    },
    homeLongitude: {
      type: Number,
      default: null 
    },
    homeCity: { 
      type: String, 
      default: null 
    },
    homeCountry: {
      type: String, 
      default: null 
    },
    homeLocationSource: {
      type: String,
      enum: ["gps", "manual"],
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

userSchema.pre("validate", function (next) {

  if (
    this.role === "resident" &&
    this.authMethod === "google" &&
    !this.googleId &&
    !this.motDePasse
  ) {
    return next();
  }

  if (!this.googleId && !this.motDePasse) {
    const error = new Error(
      "Au moins une méthode d'authentification est requise (Google ou mot de passe)",
    );
    return next(error);
  }
  next();
});

userSchema.pre("save", async function (next) {
  if (this.authMethod === "google" || !this.motDePasse) {
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

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (this.authMethod === "google" || !this.motDePasse) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.motDePasse);
};

userSchema.virtual("nomComplet").get(function () {
  return `${this.prenom} ${this.nom}`;
});

userSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    delete ret.motDePasse;
    delete ret.refreshToken;
    return ret;
  },
});

userSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("User", userSchema);
