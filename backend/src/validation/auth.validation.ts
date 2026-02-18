import zod from "zod";

const signupSchema = zod.object({
  username: zod
    .string()
    .min(3, {
      message: `The Username Must be At Least 3 Character Long`,
    })
    .max(100, {
      message: `The Username must be Maximum 100 Character`,
    }),

  email: zod.string().email({
    message: `Please Enter the Correct Format Email`,
  }),

  password: zod.string().min(8, {
    message: `The Password Must be At Least 8 Character Long`,
  }),
});
const loginSchema = zod.object({
  username: zod.string().optional(),

  password: zod.string().min(8, {
    message: `The Password Must be At Least 8 Character Long`,
  }),
});
const updatePasswordSchema = zod.object({
  currentpassword: zod.string().min(8, {
    message: `The Password Must be At Least 8 Character Long`,
  }),
  newpassword: zod.string().min(8, {
    message: `The new-password Must be At Least 8 Character Long`,
  }),
});

const forgetPasswordSchema = zod.object({
  email: zod.string().email({
    message: `Please Enter the Correct Format Email`,
  }),
});

const resetPasswordSchema = zod.object({
  newPassword: zod.string().min(8, {
    message: `The New Password Must be At Least 8 Character Long`,
  }),
});

export {
  signupSchema,
  loginSchema,
  updatePasswordSchema,
};
