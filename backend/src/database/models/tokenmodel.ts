import mongoose from "mongoose";

const tokenSchema = new mongoose.Schema({
  accessToken: {
    type: String,
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

  logoutAt: {
    type: Date,
  },

  
  x_correlation_id: {
    type: String,
  },
});

const tokenModel = mongoose.model("Token", tokenSchema);

export default tokenModel;
