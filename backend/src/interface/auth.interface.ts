interface ISignup {
  username: String;
  email: String;
  password: String;
}

interface ILogin {
  username: String;
  password: string;
}
interface IUpdatePassword {
  currentpassword: String;
  newpassword: string;
}


export type { ISignup, ILogin, IUpdatePassword};
