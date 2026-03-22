import os
from datetime import timedelta

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    JSON_SORT_KEYS = False
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    
    # Session cookie configuration for CORS with credentials across different origins
    SESSION_COOKIE_SECURE = False  # Allow HTTP in development (set True for HTTPS in production)
    SESSION_COOKIE_HTTPONLY = False  # Allow JavaScript to access session cookie
    SESSION_COOKIE_SAMESITE = 'None'  # Allow cross-origin cookies with credentials
    SESSION_COOKIE_DOMAIN = None  # Allow cookies across port differences
    SESSION_REFRESH_EACH_REQUEST = True  # Update session expiry on each request
