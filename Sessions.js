const mongoose = require("mongoose");

const sessionsSchema = new mongoose.Schema({
  tokens: [String],
  user: mongoose.SchemaTypes.ObjectId,
  expiration: {
    type: Date,
    default: () => Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
  },
  ips: [String],
});

module.exports = mongoose.model("Sessions", sessionsSchema);
