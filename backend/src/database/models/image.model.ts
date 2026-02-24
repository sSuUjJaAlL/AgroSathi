import mongoose from "mongoose"
const imageSchema = new mongoose.Schema({
  image: {
    type: String,
    required: [true, `Username is missing `],
 }
}
)

const imageModel = mongoose.model('Image',imageSchema)
export default imageModel