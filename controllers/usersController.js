const User = require('../models/User');


const makeAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: 'Utilisateur non trouvé' });
        }

        if (user.role === 'admin') {
            return res.status(200).json({ message: 'Utilisateur déjà admin', user });
        }

        user.role = 'admin';
        await user.save();

        res.json({ message: 'Utilisateur promu admin avec succès', user });
    } catch (error) {
        console.error('Erreur lors de la promotion en admin:', error);
        res.status(500).json({ message: 'Erreur lors de la promotion en admin' });
    }
};

module.exports = {
    makeAdmin
};


