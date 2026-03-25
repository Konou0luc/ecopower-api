const Maison = require('../models/Maison');
const User = require('../models/User');


const getMaisonById = async (req, res) => {
  try {
    const { id } = req.params;
    const maison = await Maison.findById(id)
      .populate('listeResidents')
      .populate('proprietaireId');
    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    const maisonObj = maison.toObject();
    if (maisonObj.listeResidents) {
      maisonObj.listeResidents = maisonObj.listeResidents.filter(r => r !== null && typeof r === 'object' && (r.email || r.nom));
    }

    res.json(maisonObj);
  } catch (error) {
    console.error('💥 [API] getMaisonById error:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de la maison' });
  }
};


const createMaison = async (req, res) => {
  try {
    const { nomMaison, adresse, description, tarifKwh, nbResidentsMax } = req.body;

    
    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent créer des maisons' });
    }

    
    const maison = new Maison({
      nomMaison,
      proprietaireId: req.user._id,
      adresse,
      description,
      tarifKwh: tarifKwh !== undefined ? Number(tarifKwh) : undefined,
      nbResidentsMax:
        nbResidentsMax !== undefined ? Number(nbResidentsMax) : undefined
    });

    await maison.save();

    res.status(201).json({
      message: 'Maison créée avec succès',
      maison
    });
  } catch (error) {
    console.error('Erreur lors de la création de la maison:', error);
    res.status(500).json({ message: 'Erreur lors de la création de la maison' });
  }
};


const getMaisons = async (req, res) => {
  try {
    let maisons;

    if (req.user.role === 'proprietaire') {
      
      maisons = await Maison.find({ proprietaireId: req.user._id })
        .populate('listeResidents', 'nom prenom email telephone')
        .sort({ createdAt: -1 });
    } else {
      
      // Recherche de la maison où le résident est présent dans listeResidents
      // On utilise $in pour être sûr de bien chercher l'ID
      maisons = await Maison.find({ 
        $or: [
          { listeResidents: req.user._id },
          { listeResidents: req.user._id.toString() }
        ]
      })
        .populate('proprietaireId', 'nom prenom email')
        .populate('listeResidents', 'nom prenom email telephone')
        .sort({ createdAt: -1 });
    }

    // Filtrage pour s'assurer que les résidents populés sont valides (non nulls et bien des objets)
    maisons = maisons.map(maison => {
      const maisonObj = (typeof maison.toObject === 'function') ? maison.toObject() : maison;
      if (maisonObj.listeResidents) {
        // On ne garde que les résidents qui ont été populés avec succès (objets avec un email ou un nom)
        maisonObj.listeResidents = maisonObj.listeResidents.filter(r => r !== null && typeof r === 'object' && (r.email || r.nom));
      }
      return maisonObj;
    });

    res.json({
      maisons,
      count: maisons.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des maisons:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des maisons' });
  }
};


const getMaison = async (req, res) => {
  try {
    const { id } = req.params;

    let maison;
    if (req.user.role === 'proprietaire') {
      maison = await Maison.findOne({
        _id: id,
        proprietaireId: req.user._id
      }).populate('listeResidents', 'nom prenom email telephone');
    } else {
      maison = await Maison.findOne({
        _id: id,
        $or: [
          { listeResidents: req.user._id },
          { listeResidents: req.user._id.toString() }
        ]
      }).populate('proprietaireId', 'nom prenom email')
        .populate('listeResidents', 'nom prenom email telephone');
    }

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    const maisonObj = (typeof maison.toObject === 'function') ? maison.toObject() : maison;
    if (maisonObj.listeResidents) {
      maisonObj.listeResidents = maisonObj.listeResidents.filter(r => r !== null && typeof r === 'object' && (r.email || r.nom));
    }

    res.json({ maison: maisonObj });
  } catch (error) {
    console.error('Erreur lors de la récupération de la maison:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de la maison' });
  }
};


const updateMaison = async (req, res) => {
  try {
    const { id } = req.params;
    const { nomMaison, adresse, description, tarifKwh, nbResidentsMax } = req.body;

    
    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent modifier des maisons' });
    }

    
    const maison = await Maison.findOne({
      _id: id,
      proprietaireId: req.user._id
    });

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    
    if (nomMaison) maison.nomMaison = nomMaison;
    if (adresse) maison.adresse = adresse;
    if (description !== undefined) maison.description = description;
    if (tarifKwh !== undefined) {
      if (Number.isNaN(Number(tarifKwh)) || Number(tarifKwh) < 0) {
        return res.status(400).json({ message: 'tarifKwh invalide' });
      }
      maison.tarifKwh = Number(tarifKwh);
    }
    if (nbResidentsMax !== undefined) {
      if (Number.isNaN(Number(nbResidentsMax)) || Number(nbResidentsMax) < 1) {
        return res.status(400).json({ message: 'nbResidentsMax invalide' });
      }
      maison.nbResidentsMax = Number(nbResidentsMax);
    }

    await maison.save();

    res.json({
      message: 'Maison mise à jour avec succès',
      maison
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la maison:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour de la maison' });
  }
};


const updateMaisonConfiguration = async (req, res) => {
  try {
    const { id } = req.params;
    const { tarifKwh, nbResidentsMax } = req.body;

    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent modifier la configuration' });
    }

    if (tarifKwh === undefined && nbResidentsMax === undefined) {
      return res.status(400).json({
        message: 'Veuillez fournir au moins tarifKwh ou nbResidentsMax'
      });
    }

    if (tarifKwh !== undefined && (Number.isNaN(Number(tarifKwh)) || Number(tarifKwh) < 0)) {
      return res.status(400).json({ message: 'tarifKwh invalide' });
    }

    if (
      nbResidentsMax !== undefined &&
      (Number.isNaN(Number(nbResidentsMax)) || Number(nbResidentsMax) < 1)
    ) {
      return res.status(400).json({ message: 'nbResidentsMax invalide' });
    }

    const maison = await Maison.findOne({ _id: id, proprietaireId: req.user._id });
    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    if (tarifKwh !== undefined) {
      maison.tarifKwh = Number(tarifKwh);
    }
    if (nbResidentsMax !== undefined) {
      maison.nbResidentsMax = Number(nbResidentsMax);
    }

    await maison.save();

    return res.json({
      message: 'Configuration de la maison mise à jour avec succès',
      maison: {
        _id: maison._id,
        tarifKwh: maison.tarifKwh,
        nbResidentsMax: maison.nbResidentsMax
      }
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la configuration:', error);
    return res.status(500).json({ message: 'Erreur lors de la mise à jour de la configuration' });
  }
};


const deleteMaison = async (req, res) => {
  try {
    const { id } = req.params;

    
    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent supprimer des maisons' });
    }

    
    const maison = await Maison.findOne({
      _id: id,
      proprietaireId: req.user._id
    });

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    
    if (maison.listeResidents.length > 0) {
      return res.status(400).json({ 
        message: 'Impossible de supprimer une maison qui a des résidents' 
      });
    }

    await Maison.findByIdAndDelete(id);

    res.json({ message: 'Maison supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de la maison:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression de la maison' });
  }
};


const updateMaisonTarif = async (req, res) => {
  try {
    const { id } = req.params;
    const { tarifKwh } = req.body;

    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent modifier le tarif' });
    }

    if (tarifKwh === undefined || Number.isNaN(Number(tarifKwh)) || Number(tarifKwh) < 0) {
      return res.status(400).json({ message: 'tarifKwh invalide' });
    }

    const maison = await Maison.findOne({ _id: id, proprietaireId: req.user._id });
    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    maison.tarifKwh = Number(tarifKwh);
    await maison.save();

    res.json({ message: 'Tarif mis à jour avec succès', maison: { _id: maison._id, tarifKwh: maison.tarifKwh } });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du tarif:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour du tarif' });
  }
};


const addResidentToMaison = async (req, res) => {
  try {
    const { maisonId, residentId } = req.body;

    
    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent ajouter des résidents' });
    }

    
    const maison = await Maison.findOne({
      _id: maisonId,
      proprietaireId: req.user._id
    });

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    
    const resident = await User.findOne({
      _id: residentId,
      idProprietaire: req.user._id,
      role: 'resident'
    });

    if (!resident) {
      return res.status(404).json({ message: 'Résident non trouvé' });
    }

    if (
      typeof maison.nbResidentsMax === 'number' &&
      maison.nbResidentsMax > 0 &&
      maison.listeResidents.length >= maison.nbResidentsMax
    ) {
      return res.status(400).json({
        message: `Nombre maximal de résidents atteint pour cette maison (${maison.nbResidentsMax})`
      });
    }

    
    await maison.ajouterResident(residentId);

    res.json({
      message: 'Résident ajouté à la maison avec succès',
      maison
    });
  } catch (error) {
    console.error('Erreur lors de l\'ajout du résident:', error);
    res.status(500).json({ message: 'Erreur lors de l\'ajout du résident' });
  }
};


const removeResidentFromMaison = async (req, res) => {
  try {
    const { maisonId, residentId } = req.body;

    
    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent retirer des résidents' });
    }

    
    const maison = await Maison.findOne({
      _id: maisonId,
      proprietaireId: req.user._id
    });

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    
    await maison.retirerResident(residentId);

    res.json({
      message: 'Résident retiré de la maison avec succès',
      maison
    });
  } catch (error) {
    console.error('Erreur lors du retrait du résident:', error);
    res.status(500).json({ message: 'Erreur lors du retrait du résident' });
  }
};

module.exports = {
  createMaison,
  getMaisons,
  getMaison,
  updateMaison,
  updateMaisonConfiguration,
  deleteMaison,
  addResidentToMaison,
  removeResidentFromMaison,
  updateMaisonTarif,
  getMaisonById
};
