"use client";

import React, { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function SignupPage() {
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(false);
    const { signupUser, isAuthenticated } = useAuth();
    const router = useRouter();

    React.useEffect(() => {
        if (isAuthenticated) {
            router.replace("/dashboard");
        }
    }, [isAuthenticated, router]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (username.trim().length < 3) {
            setError("Username must be at least 3 characters");
            return;
        }
        if (!email.includes("@")) {
            setError("Please enter a valid email address");
            return;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }

        setLoading(true);
        try {
            await signupUser(username, email, password);
            setSuccess("Account created successfully! Redirecting to login...");
            setTimeout(() => {
                router.push("/login");
            }, 2000);
        } catch (err: any) {
            setError(err.message || "Signup failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="card">
                    <div className="auth-header">
                        <h1>Join AgroSathi 🌾</h1>
                        <p>Create your smart farming account</p>
                    </div>

                    {error && (
                        <div className="alert alert-error">
                            <span>⚠️</span> {error}
                        </div>
                    )}

                    {success && (
                        <div className="alert alert-success">
                            <span>✅</span> {success}
                        </div>
                    )}

                    <form className="auth-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="signup-username" className="form-label">
                                Username
                            </label>
                            <input
                                id="signup-username"
                                type="text"
                                className="form-input"
                                placeholder="Choose a username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoComplete="username"
                                autoFocus
                            />
                            <span className="form-hint">3 to 100 characters</span>
                        </div>

                        <div className="form-group">
                            <label htmlFor="signup-email" className="form-label">
                                Email
                            </label>
                            <input
                                id="signup-email"
                                type="email"
                                className="form-input"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="signup-password" className="form-label">
                                Password
                            </label>
                            <input
                                id="signup-password"
                                type="password"
                                className="form-input"
                                placeholder="Create a strong password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="new-password"
                            />
                            <span className="form-hint">Minimum 8 characters</span>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary btn-lg btn-full"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <div className="spinner" /> Creating account...
                                </>
                            ) : (
                                "Create Account"
                            )}
                        </button>
                    </form>

                    <div className="auth-footer">
                        Already have an account?{" "}
                        <Link href="/login">Sign in</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
