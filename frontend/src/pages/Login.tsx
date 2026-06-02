import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid email or password.");
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-visual">
          <div className="auth-visual-inner stagger">
            <h2>AgriPrice Prediction System</h2>
          </div>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-panel stagger">
          <div className="card">
            <h1>Welcome back</h1>
            <form onSubmit={onSubmit}>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <div className="error">{error}</div>}
              <button className="btn" type="submit" style={{ width: "100%", marginTop: "0.25rem" }}>
                Continue
              </button>
            </form>
            <p className="muted" style={{ marginTop: "1.1rem" }}>
              New here? <Link to="/register">Create an account</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
