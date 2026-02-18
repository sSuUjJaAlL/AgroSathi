"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function Navbar() {
    const { isAuthenticated, user, logoutUser } = useAuth();
    const pathname = usePathname();

    const handleLogout = async () => {
        await logoutUser();
        window.location.href = "/login";
    };

    return (
        <nav className="navbar">
            <div className="navbar-inner">
                <Link href="/" className="navbar-logo">
                    <span className="logo-icon">🌱</span>
                    AgroSathi
                </Link>

                <div className="navbar-links">
                    {isAuthenticated ? (
                        <>
                            <Link
                                href="/dashboard"
                                className={`navbar-link ${pathname === "/dashboard" ? "active" : ""}`}
                            >
                                Dashboard
                            </Link>
                            <span
                                style={{
                                    color: "var(--text-muted)",
                                    fontSize: "0.85rem",
                                    padding: "0 8px",
                                }}
                            >
                                Hey, {user?.username} 👋
                            </span>
                            <button
                                onClick={handleLogout}
                                className="btn btn-outline btn-sm"
                            >
                                Logout
                            </button>
                        </>
                    ) : (
                        <>
                            <Link
                                href="/login"
                                className={`navbar-link ${pathname === "/login" ? "active" : ""}`}
                            >
                                Login
                            </Link>
                            <Link href="/signup" className="btn btn-primary btn-sm">
                                Sign Up
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
}
