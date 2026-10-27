const mongoose = require("mongoose");

const routineSchema = new mongoose.Schema({
  date:   { type: Date, default: Date.now },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name:   String,
  age:    Number,
  glucose: Number,
  breakfast: String,
  lunch: String,
  dinner: String,
  snacks: String,
  activity: String,
  meditation: String,
  stressNote: String
});

module.exports = mongoose.model("Routine", routineSchema);
