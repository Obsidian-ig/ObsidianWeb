const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    lowercase: true,
  },
  id: {
    type: Number,
    required: true,
    min: 0,
  },
  password: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
  },
  createdAt: {
    type: Date,
    default: () => {
      Date.now();
    },
    immutable: true,
  },
  updatedAt: {
    type: Date,
    default: () => {
      Date.now();
    },
  },
});

userSchema.virtual("namePassword").get(function () {
  return `${this.name}:${this.password}`;
});

userSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("User", userSchema);
