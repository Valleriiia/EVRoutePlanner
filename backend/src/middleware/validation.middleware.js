const Joi = require('joi');

const routeRequestSchema = Joi.object({
  startPoint: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lon: Joi.number().min(-180).max(180).required(),
    address: Joi.string().allow('').optional()
  }).required(),

  endPoint: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lon: Joi.number().min(-180).max(180).required(),
    address: Joi.string().allow('').optional()
  }).required(),

  batteryLevel: Joi.number().min(0).max(100).required(),

  vehicle: Joi.object({
    batteryCapacity: Joi.number().min(10).max(200).optional(),
    consumptionPerKm: Joi.number().min(0.05).max(1).optional()
  }).optional()
});

exports.validateRouteRequest = (req, res, next) => {
  const { error, value } = routeRequestSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    return res.status(400).json({
      success: false,
      error: 'Помилка валідації даних',
      details: errors
    });
  }

  req.body = value;
  next();
};

const coordinatesSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lon: Joi.number().min(-180).max(180).required()
});

exports.validateCoordinates = (req, res, next) => {
  const { lat, lon } = req.query;
  
  const { error } = coordinatesSchema.validate({ 
    lat: parseFloat(lat), 
    lon: parseFloat(lon) 
  });

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'Невірні координати'
    });
  }

  next();
};