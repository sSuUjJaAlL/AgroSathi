"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import * as api from "@/lib/api";

interface User {
    username: string;
    userId: string;
    email: string;
    type: string;
}

interface AuthContextType {
    user: User | null;
    accessToken: string | null;
    refreshToken: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    loginUser: (username: string, password: string) => Promise<void>;
    signupUser: (username: string, email: string, password: string) => Promise<void>;
    logoutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function parseJwt(token: string): any {
    try {
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split("")
                .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                .join("")
        );
        return JSON.parse(jsonPayload);
    } catch {
        return null;
    }
}

function generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [refreshToken, setRefreshToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const storedAccess = localStorage.getItem("accessToken");
        const storedRefresh = localStorage.getItem("refreshToken");

        if (storedAccess) {
            setAccessToken(storedAccess);
            setRefreshToken(storedRefresh);
            const decoded = parseJwt(storedAccess);
            if (decoded) {
                setUser({
                    username: decoded.username,
                    userId: decoded.userId,
                    email: decoded.email,
                    type: decoded.type,
                });
            }
        }
        setIsLoading(false);
    }, []);

    const loginUser = useCallback(async (username: string, password: string) => {
        const response = await api.login(username, password);
        const { accessToken: at, refreshToken: rt } = response.data;

        localStorage.setItem("accessToken", at);
        localStorage.setItem("refreshToken", rt);

        setAccessToken(at);
        setRefreshToken(rt);

        const decoded = parseJwt(at);
        if (decoded) {
            setUser({
                username: decoded.username,
                userId: decoded.userId,
                email: decoded.email,
                type: decoded.type,
            });
        }
    }, []);

    const signupUser = useCallback(
        async (username: string, email: string, password: string) => {
            await api.signup(username, email, password);
        },
        []
    );

    const logoutUser = useCallback(async () => {
        try {
            if (accessToken) {
                const correlationId = generateCorrelationId();
                await api.logout(accessToken, correlationId);
            }
        } catch (err) {
            // Even if logout API fails, clear client state
            console.error("Logout API error:", err);
        } finally {
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
            setAccessToken(null);
            setRefreshToken(null);
            setUser(null);
        }
    }, [accessToken]);

    return (
        <AuthContext.Provider
            value={{
                user,
                accessToken,
                refreshToken,
                isAuthenticated: !!accessToken && !!user,
                isLoading,
                loginUser,
                signupUser,
                logoutUser,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
