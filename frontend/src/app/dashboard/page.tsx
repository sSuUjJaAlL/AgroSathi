"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const dashboardCards = [
    {
        icon: "🌾",
        title: "Crop Monitor",
        description:
            "Track the health and growth progress of your crops in real-time with smart analytics.",
        stat: "12",
        statLabel: "Active Crops",
    },
    {
        icon: "🌤️",
        title: "Weather Forecast",
        description:
            "Get hyperlocal weather predictions to plan your farming activities ahead of time.",
        stat: "28°C",
        statLabel: "Current Temp",
    },
    {
        icon: "💧",
        title: "Irrigation Status",
        description:
            "Monitor soil moisture levels and automate your irrigation scheduling efficiently.",
        stat: "72%",
        statLabel: "Soil Moisture",
    },
    {
        icon: "📊",
        title: "Yield Analytics",
        description:
            "Analyze historical yield data and get AI-powered predictions for the upcoming season.",
        stat: "↑ 18%",
        statLabel: "vs Last Season",
    },
    {
        icon: "🛒",
        title: "Market Prices",
        description:
            "Stay updated with real-time commodity prices from major agricultural markets.",
        stat: "₹2,450",
        statLabel: "Rice / Quintal",
    },
    {
        icon: "🤖",
        title: "AI Advisory",
        description:
            "Get personalized farming recommendations powered by machine learning models.",
        stat: "3",
        statLabel: "New Insights",
    },
];

export default function DashboardPage() {
    const { user, isAuthenticated, isLoading, logoutUser } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.replace("/login");
        }
    }, [isAuthenticated, isLoading, router]);

    const handleLogout = async () => {
        await logoutUser();
        router.push("/login");
    };

    if (isLoading) {
        return (
            <div className="page-loader">
                <div className="spinner spinner-green" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <h1>
                    Welcome back, <span>{user?.username}</span> 🌱
                </h1>
                <p>Here&apos;s an overview of your farm operations today</p>
            </div>

            <div className="dashboard-grid">
                {dashboardCards.map((card, index) => (
                    <div
                        className="dashboard-card"
                        key={index}
                        style={{ animationDelay: `${index * 0.08}s` }}
                    >
                        <div className="dashboard-card-icon">{card.icon}</div>
                        <h3>{card.title}</h3>
                        <p>{card.description}</p>
                        <div className="card-stat">{card.stat}</div>
                        <span
                            style={{
                                fontSize: "0.8rem",
                                color: "var(--text-muted)",
                                fontWeight: 500,
                            }}
                        >
                            {card.statLabel}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
