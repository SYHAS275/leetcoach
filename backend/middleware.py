import time
from typing import Dict, List, Tuple
from fastapi import Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from collections import defaultdict
import logging
from config import settings

logger = logging.getLogger(__name__)

# In-memory rate limiting (use Redis in production)
rate_limit_store: Dict[str, List[Tuple[float, str]]] = defaultdict(list)
failed_attempts: Dict[str, List[float]] = defaultdict(list)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Enhanced rate limiting middleware with endpoint-specific limits"""
    
    def __init__(self, app):
        super().__init__(app)
        # Endpoint-specific rate limits
        self.endpoint_limits = {
            "/api/login": 5,  # 5 login attempts per minute
            "/api/register": 3,  # 3 registration attempts per minute
            "/api/captcha": 10,  # 10 CAPTCHA requests per minute
            "default": 60  # 60 requests per minute for other endpoints
        }
        self.window_size = 60  # 1 minute window
    
    def get_rate_limit(self, path: str) -> int:
        """Get rate limit for specific endpoint"""
        for endpoint, limit in self.endpoint_limits.items():
            if path.startswith(endpoint):
                return limit
        return self.endpoint_limits["default"]
    
    def get_progressive_delay(self, client_ip: str, path: str) -> int:
        """Calculate progressive delay based on failed attempts"""
        if not path.startswith(("/api/login", "/api/register")):
            return 0
        
        current_time = time.time()
        # Clean old failed attempts (older than 15 minutes)
        failed_attempts[client_ip] = [
            attempt_time for attempt_time in failed_attempts[client_ip]
            if current_time - attempt_time < 900  # 15 minutes
        ]
        
        # Calculate delay based on number of failed attempts
        failed_count = len(failed_attempts[client_ip])
        if failed_count >= 10:
            return 300  # 5 minutes
        elif failed_count >= 5:
            return 120  # 2 minutes
        elif failed_count >= 3:
            return 60   # 1 minute
        elif failed_count >= 1:
            return 30   # 30 seconds
        
        return 0
    
    async def dispatch(self, request: Request, call_next):
        # Get client IP
        client_ip = request.client.host
        path = str(request.url.path)
        
        # Check progressive delay for auth endpoints
        delay = self.get_progressive_delay(client_ip, path)
        if delay > 0:
            logger.warning(f"Progressive delay applied for IP: {client_ip}, delay: {delay}s")
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "Too many failed attempts",
                    "message": f"Please wait {delay} seconds before trying again",
                    "retry_after": delay
                }
            )
        
        # Get rate limit for this endpoint
        rate_limit = self.get_rate_limit(path)
        
        # Clean old requests outside the window
        current_time = time.time()
        rate_limit_store[client_ip] = [
            (req_time, req_path) for req_time, req_path in rate_limit_store[client_ip]
            if current_time - req_time < self.window_size
        ]
        
        # Count requests for this specific endpoint
        endpoint_requests = [
            req_time for req_time, req_path in rate_limit_store[client_ip]
            if req_path == path
        ]
        
        # Check if rate limit exceeded for this endpoint
        if len(endpoint_requests) >= rate_limit:
            logger.warning(f"Rate limit exceeded for IP: {client_ip} on endpoint: {path}")
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "Rate limit exceeded",
                    "message": f"Too many requests to {path}. Limit: {rate_limit} per minute",
                    "retry_after": 60
                }
            )
        
        # Add current request
        rate_limit_store[client_ip].append((current_time, path))
        
        # Process the request
        response = await call_next(request)
        
        # Track failed auth attempts
        if path in ["/api/login", "/api/register"] and response.status_code in [400, 401, 403]:
            failed_attempts[client_ip].append(current_time)
            logger.warning(f"Failed auth attempt for IP: {client_ip} on {path}")
        
        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(rate_limit)
        response.headers["X-RateLimit-Remaining"] = str(
            rate_limit - len(endpoint_requests)
        )
        response.headers["X-RateLimit-Reset"] = str(
            int(current_time + self.window_size)
        )
        
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to responses"""
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        
        # Remove server information
        if "server" in response.headers:
            del response.headers["server"]
        
        return response


class LoggingMiddleware(BaseHTTPMiddleware):
    """Log all requests and responses"""
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # Log request
        logger.info(f"Request: {request.method} {request.url} from {request.client.host}")
        
        try:
            response = await call_next(request)
            
            # Log response
            process_time = time.time() - start_time
            logger.info(
                f"Response: {response.status_code} - {request.method} {request.url} "
                f"took {process_time:.3f}s"
            )
            
            # Add timing header
            response.headers["X-Process-Time"] = str(process_time)
            
            return response
            
        except Exception as e:
            # Log error
            process_time = time.time() - start_time
            logger.error(
                f"Error: {str(e)} - {request.method} {request.url} "
                f"took {process_time:.3f}s"
            )
            raise


def setup_middleware(app):
    """Setup all middleware for the FastAPI app"""
    
    # Debug: Log CORS settings
    logger.info(f"CORS allowed_origins: {settings.allowed_origins}")
    
    # CORS middleware - MUST be first
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    
    # Trusted host middleware (in production)
    if not settings.debug:
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=["*"]  # Configure with your domain in production
        )
    
    # Custom middleware - add after CORS
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(LoggingMiddleware)
    app.add_middleware(RateLimitMiddleware) 