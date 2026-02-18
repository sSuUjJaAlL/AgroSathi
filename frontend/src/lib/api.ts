const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

interface ApiResponse<T = any> {
    message: string;
    data: T;
    statusCode: number;
    error: boolean;
}

async function apiRequest<T = any>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    const url = `${API_BASE_URL}${endpoint}`;

    const defaultHeaders: Record<string, string> = {
        "Content-Type": "application/json",
    };

    const response = await fetch(url, {
        ...options,
        headers: {
            ...defaultHeaders,
            ...(options.headers as Record<string, string>),
        },
    });

    const json = await response.json();

    if (!response.ok || json.error) {
        const errorMessage =
            typeof json.message === "string"
                ? json.message
                : typeof json.message === "object"
                    ? Object.values(json.message).flat().join(", ")
                    : "Something went wrong";
        throw new Error(errorMessage);
    }

    return json as ApiResponse<T>;
}

export async function signup(
    username: string,
    email: string,
    password: string
) {
    return apiRequest("/api/v1/signup", {
        method: "POST",
        body: JSON.stringify({ username, email, password }),
    });
}

export async function login(username: string, password: string) {
    return apiRequest<{ accessToken: string; refreshToken: string }>(
        "/api/v1/login",
        {
            method: "POST",
            body: JSON.stringify({ username, password }),
        }
    );
}

export async function logout(accessToken: string, correlationId: string) {
    return apiRequest("/api/v1/logout", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "x-correlation-id": correlationId,
        },
    });
}

export async function healthCheck() {
    return apiRequest("/api/v1/health");
}
