"use client";

import React, { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const { loginUser, isAuthenticated } = useAuth();
    const router = useRouter();

    // Redirect if already authenticated
    React.useEffect(() => {
        if (isAuthenticated) {
            router.replace("/dashboard");
        }
    }, [isAuthenticated, router]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");

        if (!username.trim()) {
            setError("Please enter your username");
            return;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }

        setLoading(true);
        try {
            await loginUser(username, password);
            router.push("/dashboard");
        } catch (err: any) {
            setError(err.message || "Login failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="card">
                    <div className="auth-header">
                        <h1>Welcome Back 🌿</h1>
                        <p>Sign in to your AgroSathi account</p>
                    </div>

                    {error && (
                        <div className="alert alert-error">
                            <span>⚠️</span> {error}
                        </div>
                    )}

                    <form className="auth-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="login-username" className="form-label">
                                Username
                            </label>
                            <input
                                id="login-username"
                                type="text"
                                className="form-input"
                                placeholder="Enter your username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoComplete="username"
                                autoFocus
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="login-password" className="form-label">
                                Password
                            </label>
                            <input
                                id="login-password"
                                type="password"
                                className="form-input"
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
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
                                    <div className="spinner" /> Signing in...
                                </>
                            ) : (
                                "Sign In"
                            )}
                        </button>
                    </form>

                    <div className="auth-footer">
                        Don&apos;t have an account?{" "}
                        <Link href="/signup">Create one</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
