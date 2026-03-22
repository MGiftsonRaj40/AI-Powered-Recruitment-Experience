from mongoengine import Document, StringField, IntField, BooleanField, ListField, DictField, DateTimeField, ReferenceField
from datetime import datetime

class User(Document):
    email = StringField(required=True, unique=True)
    password_hash = StringField(required=True)
    full_name = StringField()
    user_type = StringField(required=True)  # 'candidate' or 'recruiter'
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)
    
    meta = {
        'collection': 'users',
        'indexes': ['email']
    }
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'email': self.email,
            'full_name': self.full_name,
            'user_type': self.user_type,
            'created_at': self.created_at.isoformat()
        }


class CandidateProfile(Document):
    user_id = ReferenceField(User, required=True, unique=True)
    headline = StringField()
    bio = StringField()
    location = StringField()
    phone = StringField()
    
    # Structured data (stored as dictionaries)
    experiences = ListField(DictField(), default=list)
    skills = ListField(DictField(), default=list)
    projects = ListField(DictField(), default=list)
    education = ListField(DictField(), default=list)
    certifications = ListField(DictField(), default=list)
    
    profile_completion = IntField(default=0)  # 0-100%
    is_published = BooleanField(default=False)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)
    
    meta = {
        'collection': 'candidate_profiles',
        'indexes': ['user_id', 'is_published']
    }
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'user_id': str(self.user_id.id),
            'headline': self.headline,
            'bio': self.bio,
            'location': self.location,
            'phone': self.phone,
            'experiences': self.experiences or [],
            'skills': self.skills or [],
            'projects': self.projects or [],
            'education': self.education or [],
            'certifications': self.certifications or [],
            'profile_completion': self.profile_completion,
            'is_published': self.is_published,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }


class Shortlist(Document):
    recruiter_id = ReferenceField(User, required=True)
    candidate_id = ReferenceField(CandidateProfile, required=True)
    status = StringField(default='shortlisted')  # shortlisted, rejected, interviewed
    notes = StringField()
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)
    
    meta = {
        'collection': 'shortlists',
        'indexes': ['recruiter_id', 'candidate_id']
    }
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'recruiter_id': str(self.recruiter_id.id),
            'candidate_id': str(self.candidate_id.id),
            'status': self.status,
            'notes': self.notes,
            'created_at': self.created_at.isoformat()
        }
