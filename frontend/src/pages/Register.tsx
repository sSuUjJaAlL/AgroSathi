import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { Role } from "../services/api";

export default function Register() {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("buyer");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await register(email, password, role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-visual">
        <div className="auth-visual-inner stagger">
          <h2>Pick a lane — we adapt the charts.</h2>
          <p className="muted">
            Buyers lean on 7-day paths and early-buy signals; farmers watch 30-day drift with validation-backed
            explanations.
          </p>
        </div>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-panel stagger">
          <div className="card">
            <h1>Create account</h1>
            <p className="muted card-sub">Choose your primary role — dashboards animate to match.</p>
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
                <label htmlFor="password">Password (min 6)</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <div className="field">
                <span className="muted">Role</span>
                <div className="role-picker">
                  <label className={`role-option ${role === "farmer" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="role"
                      checked={role === "farmer"}
                      onChange={() => setRole("farmer")}
                    />
                    <span>
                      <strong>Farmer</strong>
                      <small className="muted">30-day trend focus</small>
                    </span>
                  </label>
                  <label className={`role-option ${role === "buyer" ? "active" : ""}`}>
                    <input type="radio" name="role" checked={role === "buyer"} onChange={() => setRole("buyer")} />
                    <span>
                      <strong>Buyer</strong>
                      <small className="muted">7-day price focus</small>
                    </span>
                  </label>
                </div>
              </div>
              {error && <div className="error">{error}</div>}
              <button className="btn" type="submit" style={{ width: "100%", marginTop: "0.25rem" }}>
                Start predicting
              </button>
            </form>
            <p className="muted" style={{ marginTop: "1.1rem" }}>
              Already have access? <Link to="/login">Login</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
