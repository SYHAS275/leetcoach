import json
import logging
from datetime import datetime
from fastapi import FastAPI, Request, Depends, HTTPException, status, Header, Body
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from google import genai
import os
from typing import Optional
import base64
import io
import random
import string
from captcha.image import ImageCaptcha
from PIL import Image
from pathlib import Path
import subprocess
import tempfile
import shlex
from pydantic import BaseModel

# Import our production-ready modules
from config import settings
from models import (
    User, Base, ClarifyRequest, BruteForceRequest, OptimizeRequest, 
    FunctionDefinitionRequest, CodeReviewRequest, StartSessionRequest,
    ClarifyResponse, BruteForceResponse, OptimizeResponse,
    FunctionDefinitionResponse, CodeReviewResponse, UserLogin, UserRegister,
    CaptchaRequest, CaptchaResponse, CaptchaEntry
)
from database import SessionLocal, engine, get_or_create_user_session, update_user_session, get_db
from exceptions import (
    LeetCoachException, ValidationError, AuthenticationError,
    NotFoundError, OpenAIError, handle_leetcoach_exception
)
from middleware import setup_middleware
from jose import JWTError, jwt
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create database tables
# Create database tables safely
from sqlalchemy.exc import IntegrityError
try:
    Base.metadata.create_all(bind=engine)
except IntegrityError:
    # This happens if multiple workers try to create the table at the same time.
    # We can safely ignore it as it means the table now exists.
    pass
except Exception as e:
    logger.error(f"Error creating database tables: {e}")
    # Don't raise, let app start if tables might already exist
    pass

# Initialize FastAPI app
app = FastAPI(
    title="LeetCoach API",
    description="AI-powered coding interview simulator",
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None
)

# Setup middleware
setup_middleware(app)

# Load questions from questions.json
try:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    QUESTIONS_PATH = os.path.join(BASE_DIR, "questions.json")
    with open(QUESTIONS_PATH) as f:
        QUESTIONS = json.load(f)
    logger.info(f"Loaded {len(QUESTIONS)} questions")
except Exception as e:
    logger.error(f"Failed to load questions: {e}")
    QUESTIONS = []

# Password hashing using bcrypt directly
import bcrypt

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def verify_password(plain_password, hashed_password):
    # Encode password and hash for bcrypt comparison
    password_bytes = plain_password.encode('utf-8')[:72]
    hash_bytes = hashed_password.encode('utf-8') if isinstance(hashed_password, str) else hashed_password
    return bcrypt.checkpw(password_bytes, hash_bytes)

def get_password_hash(password):
    # Encode and hash password with bcrypt
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode('utf-8')

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt

# Global exception handler
@app.exception_handler(LeetCoachException)
async def leetcoach_exception_handler(request: Request, exc: LeetCoachException):
    logger.error(f"LeetCoach exception: {exc.message}")
    return handle_leetcoach_exception(exc)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "message": "Something went wrong"}
    )

# Health check endpoint
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0"
    }

# CORS preflight handlers
@app.options("/api/login")
async def login_options():
    return {"message": "OK"}

@app.options("/api/register")
async def register_options():
    return {"message": "OK"}

# Agent classes with improved error handling
class QuestionAgent:
    def get_question(self, question_id=None):
        if not QUESTIONS:
            raise NotFoundError("No questions available")
        
        if question_id is not None:
            for q in QUESTIONS:
                if q["id"] == question_id:
                    return q
            raise NotFoundError(f"Question with ID {question_id} not found")
        return QUESTIONS[0]

class FunctionDefinitionAgent:
    def __init__(self):
        self.model = "gemini-2.5-pro"
        self.client = genai.Client(api_key=settings.gemini_api_key)
        logger.info(f"FunctionDefinitionAgent initialized with Gemini model: {self.model}")

    def generate(self, question, language):
        try:
            q_title = question.get("title", "")
            q_desc = question.get("description", "")
            
            prompt = f"""You are a code generator. Output only raw {language} code.

Generate a function definition for: {q_title}
Description: {q_desc}

Provide only the function signature or a simple stub. No explanations.
"""
            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt
            )
            return response.text.strip()
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise OpenAIError(f"Failed to generate function definition: {str(e)}")

class ClarificationAgent:
    def __init__(self):
        self.model = "gemini-2.5-pro"
        self.client = genai.Client(api_key=settings.gemini_api_key)
        logger.info(f"ClarificationAgent initialized with Gemini model: {self.model}")

    def respond(self, user_input, question):
        try:
            q_title = question.get("title", "")
            q_desc = question.get("description", "")
            q_examples = "\n".join([f"Input: {ex['input']} | Output: {ex['output']}" for ex in question.get("examples", [])])
            q_constraints = "\n".join(question.get("constraints", []))
            
            prompt = f"""You are an interviewer. Be specific to THIS problem.

Problem: {q_title}
Description: {q_desc}
Examples: {q_examples}
Constraints: {q_constraints}

Candidate's question: {user_input}

Provide specific feedback under 100 words.
"""
            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt
            )
            return response.text
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise OpenAIError(f"Failed to generate clarification response: {str(e)}")

class BruteForceAgent:
    def __init__(self):
        self.model = "gemini-2.5-pro"
        self.client = genai.Client(api_key=settings.gemini_api_key)
        logger.info(f"BruteForceAgent initialized with Gemini model: {self.model}")

    def feedback(self, user_idea, question, time_complexity=None, space_complexity=None):
        try:
            q_title = question.get("title", "")
            q_desc = question.get("description", "")
            
            prompt = f"""Evaluate this brute-force approach for: {q_title}
Description: {q_desc}

Approach: {user_idea}
Time: {time_complexity or 'Not provided'}
Space: {space_complexity or 'Not provided'}

Is it valid? Only evaluate if it works, not if it's optimal.
"""
            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt
            )
            return response.text
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise OpenAIError(f"Failed to generate brute force feedback: {str(e)}")

class OptimizeAgent:
    def __init__(self):
        self.model = "gemini-2.5-pro"
        self.client = genai.Client(api_key=settings.gemini_api_key)
        logger.info(f"OptimizeAgent initialized with Gemini model: {self.model}")

    def feedback(self, user_idea, question, time_complexity=None, space_complexity=None, brute_force_idea=None):
        try:
            q_title = question.get("title", "")
            q_desc = question.get("description", "")
            
            prompt = f"""Evaluate optimization for: {q_title}
Description: {q_desc}

Optimization: {user_idea}
Time: {time_complexity or 'Not provided'}
Space: {space_complexity or 'Not provided'}
"""
            if brute_force_idea:
                prompt += f"\nPrevious brute-force: {brute_force_idea}"
            prompt += "\n\nProvide specific feedback."
            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt
            )
            return response.text
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise OpenAIError(f"Failed to generate optimization feedback: {str(e)}")

class SolutionAgent:
    def __init__(self):
        self.model = "gemini-2.5-pro"
        self.client = genai.Client(api_key=settings.gemini_api_key)
        logger.info(f"SolutionAgent initialized with Gemini model: {self.model}")

    def generate(self, question, language):
        try:
            q_title = question.get("title", "")
            q_desc = question.get("description", "")

            prompt = f"""Generate optimal {language} solution for: {q_title}
Description: {q_desc}

Output only raw code, no explanations.
"""
            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt
            )
            return response.text.strip()
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise OpenAIError(f"Failed to generate solution: {str(e)}")

class CodeReviewAgent:
    def __init__(self):
        self.model = "gemini-2.0-flash"
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.solution_agent = SolutionAgent()
        logger.info(f"CodeReviewAgent initialized with Gemini model: {self.model}")

    def review(self, clarification, brute_force, code, question, language, bf_time=None, bf_space=None, opt_time=None, opt_space=None):
        try:
            q_title = question.get("title", "")
            q_desc = question.get("description", "")
            code_lines = code.split('\n') if code else []
            numbered_code = '\n'.join([f"{i+1}: {line}" for i, line in enumerate(code_lines)])

            actual_solution = self.solution_agent.generate(question, language)

            prompt = f"""Review {language} code for: {q_title}
Description: {q_desc}

Clarification: {clarification}
Brute-force: {brute_force}
Code: {numbered_code}

Return JSON:
{{"clarification": {{"grade": 1-10, "feedback": "..."}}, "brute_force": {{"grade": 1-10, "feedback": "..."}}, "coding": {{"grade": 1-10, "feedback": "...", "line_by_line": []}}, "total": N, "key_pointers": "..."}}

Only output valid JSON.
"""
            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt
            )
            import re, json as pyjson
            content = response.text
            logger.info(f'Gemini response: {content}')
            match = re.search(r'\{[\s\S]*\}', content)
            review_json = None
            if match:
                try:
                    review_json = pyjson.loads(match.group(0))
                except Exception:
                    pass
            if not review_json:
                review_json = {
                    "clarification": {"grade": 0, "feedback": "No feedback available."},
                    "brute_force": {"grade": 0, "feedback": "No feedback available."},
                    "coding": {"grade": 0, "feedback": "No feedback available.", "line_by_line": []},
                    "total": 0,
                    "key_pointers": "Could not parse review. Please try again."
                }
            review_json["actual_solution"] = actual_solution
            return review_json
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise OpenAIError(f"Failed to generate code review: {str(e)}")

# Initialize agents
question_agent = QuestionAgent()
function_definition_agent = FunctionDefinitionAgent()

# Place get_current_user here, before any endpoint uses it
def get_current_user(db: Session = Depends(get_db), authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        username = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token payload")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# API Endpoints with proper validation
@app.get("/api/questions")
async def get_questions():
    """Get all available questions"""
    return [{"id": q["id"], "title": q["title"]} for q in QUESTIONS]

@app.post("/api/start-session")
async def start_session(request: StartSessionRequest):
    """Start a new interview session"""
    try:
        question = question_agent.get_question(request.question_id)
        return {"question": question}
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/api/function-definition")
async def get_function_definition(request: FunctionDefinitionRequest):
    """Get function definition for a specific language"""
    try:
        question = question_agent.get_question(request.question_id)
        function_definition = function_definition_agent.generate(question, request.language)
        return FunctionDefinitionResponse(function_definition=function_definition)
    except (NotFoundError, OpenAIError) as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))

@app.post("/api/clarify")
async def clarify(request: ClarifyRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        question = question_agent.get_question(request.question_id)
        session = get_or_create_user_session(db, user.id, request.question_id)
        # Save clarification
        update_user_session(db, session, clarification=request.user_input)
        response = ClarificationAgent().respond(request.user_input, question)
        return ClarifyResponse(agent="ClarificationAgent", response=response)
    except (NotFoundError, OpenAIError) as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))

@app.post("/api/brute-force")
async def brute_force(request: BruteForceRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        question = question_agent.get_question(request.question_id)
        session = get_or_create_user_session(db, user.id, request.question_id)
        # Save brute-force idea and complexities
        update_user_session(db, session,
            brute_force_idea=request.user_idea,
            brute_force_time_complexity=request.time_complexity,
            brute_force_space_complexity=request.space_complexity
        )
        response = BruteForceAgent().feedback(
            request.user_idea,
            question,
            request.time_complexity,
            request.space_complexity
        )
        return BruteForceResponse(agent="BruteForceAgent", response=response)
    except (NotFoundError, OpenAIError) as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))

@app.post("/api/optimize")
async def optimize(request: OptimizeRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        question = question_agent.get_question(request.question_id)
        session = get_or_create_user_session(db, user.id, request.question_id)
        # Save optimize idea and complexities
        update_user_session(db, session,
            optimize_idea=request.user_idea,
            optimize_time_complexity=request.time_complexity,
            optimize_space_complexity=request.space_complexity
        )
        # Retrieve brute-force idea for context
        brute_force_idea = session.brute_force_idea
        response = OptimizeAgent().feedback(
            request.user_idea,
            question,
            request.time_complexity,
            request.space_complexity,
            brute_force_idea=brute_force_idea
        )
        return OptimizeResponse(agent="OptimizeAgent", response=response)
    except (NotFoundError, OpenAIError) as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))

@app.post("/api/code-review")
async def code_review(request: CodeReviewRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        question = question_agent.get_question(request.question_id)
        session = get_or_create_user_session(db, user.id, request.question_id)
        # Save code
        update_user_session(db, session, code=request.code)
        # Retrieve all previous steps
        review = CodeReviewAgent().review(
            clarification=session.clarification,
            brute_force=session.brute_force_idea,
            code=request.code,
            question=question,
            language=request.language,
            bf_time=session.brute_force_time_complexity,
            bf_space=session.brute_force_space_complexity,
            opt_time=session.optimize_time_complexity,
            opt_space=session.optimize_space_complexity
        )
        actual_solution = review.get("actual_solution")
        return CodeReviewResponse(agent="CodeReviewAgent", review=review, actual_solution=actual_solution)
    except (NotFoundError, OpenAIError) as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))

# Remove file-based/in-memory CAPTCHA store
# Use database for CAPTCHA storage

def generate_captcha(db: Session):
    import random, string
    num1 = random.randint(1, 12)
    num2 = random.randint(1, 12)
    operation = random.choice(['+', '-'])
    if operation == '+':
        answer = num1 + num2
        question = f"What is {num1} + {num2}?"
    else:
        if num1 < num2:
            num1, num2 = num2, num1
        answer = num1 - num2
        question = f"What is {num1} - {num2}?"
    captcha_id = ''.join(random.choices(string.ascii_letters + string.digits, k=16))
    expires_at = datetime.utcnow() + timedelta(minutes=5)
    db_captcha = CaptchaEntry(id=captcha_id, answer=str(answer), expires_at=expires_at)
    db.add(db_captcha)
    db.commit()
    return captcha_id, question, answer

def verify_captcha(db: Session, captcha_id: str, user_answer: str) -> bool:
    captcha = db.query(CaptchaEntry).filter(CaptchaEntry.id == captcha_id).first()
    if not captcha:
        return False
    if datetime.utcnow() > captcha.expires_at:
        db.delete(captcha)
        db.commit()
        return False
    is_correct = user_answer.strip().lower() == captcha.answer.lower()
    db.delete(captcha)  # One-time use
    db.commit()
    return is_correct

def cleanup_expired_captchas(db: Session):
    now = datetime.utcnow()
    expired = db.query(CaptchaEntry).filter(CaptchaEntry.expires_at < now).all()
    for c in expired:
        db.delete(c)
    db.commit()

# Update endpoints to use DB for CAPTCHA
@app.post("/api/captcha", response_model=CaptchaResponse)
async def generate_captcha_endpoint(db: Session = Depends(get_db)):
    cleanup_expired_captchas(db)
    captcha_id, question, _ = generate_captcha(db)
    return {"captcha_id": captcha_id, "question": question, "captcha_image": ""}

@app.post("/api/captcha/test")
async def test_captcha(data: dict, db: Session = Depends(get_db)):
    captcha_id = data.get("captcha_id")
    answer = data.get("captcha_answer")
    if not captcha_id or answer is None:
        return {"success": False, "error": "Missing captcha_id or answer"}
    ok = verify_captcha(db, captcha_id, answer)
    return {"success": ok}

# User management endpoints with CAPTCHA protection
@app.post("/api/register")
async def register(request: UserRegister, db: Session = Depends(get_db)):
    """Register a new user with CAPTCHA verification"""
    try:
        # Verify CAPTCHA first
        if not verify_captcha(db, request.captcha_id, request.captcha_answer):
            raise HTTPException(status_code=400, detail="Invalid CAPTCHA answer")
        
        # Check if user already exists
        if db.query(User).filter((User.username == request.username) | (User.email == request.email)).first():
            raise HTTPException(status_code=400, detail="Username or email already registered")
        
        # Create new user
        user = User(
            username=request.username,
            email=request.email,
            hashed_password=get_password_hash(request.password)
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        logger.info(f"New user registered: {request.username}")
        return {"msg": "User registered successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail="Registration failed")

@app.post("/api/login")
async def login(request: UserLogin, db: Session = Depends(get_db)):
    """Login user with CAPTCHA verification"""
    try:
        # Verify CAPTCHA first
        if not verify_captcha(db, request.captcha_id, request.captcha_answer):
            raise HTTPException(status_code=400, detail="Invalid CAPTCHA answer")
        
        # Verify credentials
        user = db.query(User).filter(User.username == request.username).first()
        if not user or not verify_password(request.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Generate access token
        access_token = create_access_token(data={"sub": user.username})
        
        logger.info(f"User logged in: {request.username}")
        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=500, detail="Login failed")

class RunCodeRequest(BaseModel):
    code: str
    language: str
    test_cases: list = []
    question_id: int

@app.post("/api/run-code")
async def run_code(request: RunCodeRequest, user: User = Depends(get_current_user)):
    test_cases = request.test_cases if request.test_cases else ['']
    if request.language != 'python':
        raise HTTPException(status_code=400, detail="Only Python code execution is supported at this time.")
    results = []
    for idx, test_input in enumerate(test_cases):
        try:
            with tempfile.NamedTemporaryFile(mode='w+', suffix='.py', delete=False) as f:
                f.write(request.code)
                f.flush()
                cmd = f"python3 {shlex.quote(f.name)}"
                proc = subprocess.run(cmd, input=test_input, text=True, capture_output=True, shell=True, timeout=5)
                output = proc.stdout.strip()
                error = proc.stderr.strip()
                if error:
                    results.append(error)
                else:
                    results.append(output)
        except subprocess.TimeoutExpired:
            results.append("Error: Execution timed out.")
        except Exception as e:
            results.append(f"Error: {str(e)}")
    return {"output": "\n".join(results)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    ) 