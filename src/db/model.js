const config = require('../config');
module.exports = config.DATABASE_MODE === 'sqlite'
  ? require('./sqlite').model
  : require('mongoose').model.bind(require('mongoose'));
