import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, `Username is missing `],
  },

  email: {
    type: String,
    required: [true, `Email is missing `],
  },

  password: {
    type: String,
    required: [true, `Password is missing `],
  },

  passHashKey: {
    type: String,
    required: [true, "Password Hash Key is Missing "],
  },

  passIv: {
    type: String,
    required: [true, "PassIv is Missing "],
  },

  type: {
    type: String,
    default: "JWT",
    enum: ["JWT", "OAuth"],
  },

  createdAt: {
    type: Date,
    default: new Date(),
  },

  updatedAt: {
    type: Date,
    default: new Date(),
  },
});

const userModel = mongoose.model("User", userSchema);

export default userModel;
