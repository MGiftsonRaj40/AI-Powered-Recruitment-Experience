from flask import Flask
from flask_cors import CORS
from mongoengine import connect
from config import Config
from models import User, CandidateProfile, Shortlist
from routes import register_routes
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv(Path(__file__).with_name(".env"))


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Initialize extensions with explicit CORS configuration for credentials
    CORS(
        app,
        supports_credentials=True,
        origins=["http://localhost:8000", "http://127.0.0.1:8000", "http://localhost:3000", "http://127.0.0.1:3000"],
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        max_age=3600
    )

    # Connect to MongoDB using the connection string from .env
    db_connected = False
    mongodb_uri = os.getenv('MONGODB_HOST')
    if mongodb_uri:
        try:
            connect(host=mongodb_uri)
            db_connected = True
            print("[ok] Connected to MongoDB")
        except Exception as e:
            print(f"[error] MongoDB connection error: {e}")
    else:
        print("[error] MONGODB_HOST not found in .env")

    # Register routes
    register_routes(app)

    # Seed demo user
    if db_connected:
        with app.app_context():
            seed_demo_user()
    else:
        print("[warn] Demo user seeding skipped because the database is unavailable")

    return app


def seed_demo_user():
    """Seed demo users for evaluation."""
    from werkzeug.security import generate_password_hash

    # Demo Candidate
    demo_candidate_email = 'hire-me@anshumat.org'
    existing_candidate = User.objects(email=demo_candidate_email).first()

    if not existing_candidate:
        demo_user = User(
            email=demo_candidate_email,
            password_hash=generate_password_hash('HireMe@2025!'),
            full_name='Demo Candidate',
            user_type='candidate'
        )
        demo_user.save()

        profile = CandidateProfile(
            user_id=demo_user,
            headline='Full Stack Developer',
            bio='Passionate about building scalable web applications',
            location='San Francisco, CA',
            phone='+1-555-0123',
            experiences=[
                {
                    'title': 'Software Engineer',
                    'company': 'Tech Startup',
                    'duration': '2 years',
                    'description': 'Developed web applications using Python and React'
                }
            ],
            skills=[
                {'name': 'Python', 'proficiency': 'Expert'},
                {'name': 'JavaScript', 'proficiency': 'Expert'},
                {'name': 'React', 'proficiency': 'Advanced'},
                {'name': 'Flask', 'proficiency': 'Advanced'},
                {'name': 'SQL', 'proficiency': 'Intermediate'}
            ],
            projects=[
                {
                    'title': 'AI Recruitment Platform',
                    'description': 'Built a modern recruitment platform',
                    'url': 'https://github.com/example/ai-recruiter'
                }
            ],
            education=[
                {
                    'school': 'University of California',
                    'degree': 'BS Computer Science',
                    'year': '2022'
                }
            ],
            profile_completion=85,
            is_published=True
        )
        profile.save()
        print(f"[ok] Demo candidate created: {demo_candidate_email}")

    # Demo Recruiter
    demo_recruiter_email = 'recruiter@example.com'
    existing_recruiter = User.objects(email=demo_recruiter_email).first()

    if not existing_recruiter:
        recruiter_user = User(
            email=demo_recruiter_email,
            password_hash=generate_password_hash('Recruiter@2025!'),
            full_name='Demo Recruiter',
            user_type='recruiter'
        )
        recruiter_user.save()
        print(f"[ok] Demo recruiter created: {demo_recruiter_email}")


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=5000)
