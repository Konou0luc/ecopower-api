const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs');


cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});


const storage = multer.memoryStorage();


const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, 
  },
  fileFilter: (req, file, cb) => {
    
    const allowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'video/mp4',
      'audio/mpeg',  
      'audio/mp3',   
      'audio/wav',
      'audio/x-wav', 
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé'), false);
    }
  }
});


const uploadFile = upload.single('file');


const uploadFileMiddleware = (req, res, next) => {
  uploadFile(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          message: 'Fichier trop volumineux. Taille maximale: 10MB' 
        });
      }
      return res.status(400).json({ 
        message: 'Erreur lors de l\'upload du fichier',
        error: err.message 
      });
    } else if (err) {
      return res.status(400).json({ 
        message: err.message 
      });
    }
    next();
  });
};


function mimeToResourceType(mime) {
  if (!mime) return 'raw';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'raw';
  
  return 'raw';
}


const uploadBufferToCloudinary = async (file, folder = 'ecopower/messages') => {
  try {
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: mimeToResourceType(file.mimetype),
      type: 'upload',
      access_mode: 'public',
      overwrite: true,
      quality: 'auto',
      
      
    });
    return result;
  } catch (error) {
    console.error('Erreur upload Cloudinary (buffer):', error);
    throw error;
  }
};


const uploadToCloudinary = async (filePath, folder = 'ecopower/messages', mimetype) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: mimeToResourceType(mimetype),
      type: 'upload',
      access_mode: 'public',
      overwrite: true,
      quality: 'auto',
      
      
    });
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return result;
  } catch (error) {
    console.error('Erreur upload Cloudinary (filePath):', error);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
    throw error;
  }
};

module.exports = {
  uploadFileMiddleware,
  uploadToCloudinary,
  uploadBufferToCloudinary,
  cloudinary
};
