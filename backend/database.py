import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base, UserSession
from sqlalchemy.orm import Session

SQLALCHEMY_DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./test.db")

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create tables
Base.metadata.create_all(bind=engine)

def get_or_create_user_session(db: Session, user_id: int, question_id: int):
    session = db.query(UserSession).filter_by(user_id=user_id, question_id=question_id).first()
    if not session:
        session = UserSession(user_id=user_id, question_id=question_id)
        db.add(session)
        db.commit()
        db.refresh(session)
    return session

def update_user_session(db: Session, session: UserSession, **kwargs):
    for key, value in kwargs.items():
        setattr(session, key, value)
    db.commit()
    db.refresh(session)
    return session

# Dependency for FastAPI endpoints to get a DB session

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close() 