import jwt
from flask import request, jsonify, session, make_response
from werkzeug.security import generate_password_hash, check_password_hash
from models import User, CandidateProfile, Shortlist
from functools import wraps
from datetime import datetime, timedelta
from mongoengine import NotUniqueError, DoesNotExist
from bson import ObjectId

def register_routes(app):
    def extract_candidate_payload(profile):
        candidate_user = User.objects.with_id(profile.user_id.id) if profile and profile.user_id else None
        payload = profile.to_dict()
        payload['full_name'] = candidate_user.full_name if candidate_user else 'Candidate'
        payload['email'] = candidate_user.email if candidate_user else ''
        return payload

    def build_recommendations(profile):
        recommendations = []

        if not profile.headline:
            recommendations.append('Add a clear headline so recruiters can understand your target role in seconds.')
        if not profile.bio:
            recommendations.append('Write a short summary with your strengths, tools, and the type of work you want.')
        if not profile.experiences:
            recommendations.append('Add at least one experience entry with impact, ownership, and the tools you used.')
        if not profile.skills:
            recommendations.append('List your strongest skills with proficiency to make recruiter screening easier.')
        if not profile.projects:
            recommendations.append('Projects are especially important for students and freshers. Add 1-2 proof-of-work examples.')
        if profile.skills and len(profile.skills) < 5:
            recommendations.append('Add a few more relevant skills so your profile is easier to match to open roles.')
        if profile.profile_completion < 80:
            recommendations.append('Aim for 80%+ completion before sharing your profile for stronger recruiter trust.')

        return recommendations[:4]

    def structure_experience_text(raw_text):
        cleaned = ' '.join((raw_text or '').strip().split())
        if not cleaned:
            return {
                'title': '',
                'company': '',
                'duration': '',
                'description': ''
            }

        title = ''
        company = ''
        duration = ''
        description = cleaned

        if ' at ' in cleaned:
            before_at, after_at = cleaned.split(' at ', 1)
            title = before_at.strip(' .,-')
            company_part = after_at
            for separator in [' for ', ' from ', ' during ', ' with ']:
                if separator in company_part:
                    company, remainder = company_part.split(separator, 1)
                    duration = remainder.strip(' .,-')
                    break
            if not company:
                company = company_part.strip(' .,-')
        else:
            title = cleaned.split('.')[0].strip(' .,-')

        if not title:
            title = 'Experience'

        return {
            'title': title[:80],
            'company': company[:80],
            'duration': duration[:80],
            'description': description
        }
    
    # Helper function to generate JWT token
    def generate_token(user_id):
        payload = {
            'user_id': str(user_id),
            'exp': datetime.utcnow() + timedelta(days=7)
        }
        return jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')
    
    # Authentication middleware - now checks JWT token in Authorization header
    def login_required(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            auth_header = request.headers.get('Authorization')
            
            if not auth_header:
                return jsonify({'error': 'Missing authorization header'}), 401
            
            try:
                # Extract token from "Bearer <token>"
                parts = auth_header.split()
                if len(parts) != 2 or parts[0] != 'Bearer':
                    return jsonify({'error': 'Invalid authorization header'}), 401
                
                token = parts[1]
                payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
                user_id = payload.get('user_id')
                
                user = User.objects.with_id(ObjectId(user_id))
                if not user:
                    return jsonify({'error': 'User not found'}), 404
                
                return f(user, *args, **kwargs)
            except jwt.ExpiredSignatureError:
                return jsonify({'error': 'Token expired'}), 401
            except jwt.InvalidTokenError:
                return jsonify({'error': 'Invalid token'}), 401
            except Exception as e:
                return jsonify({'error': str(e)}), 401
        return decorated_function
    
    def recruiter_only(f):
        @wraps(f)
        def decorated_function(user, *args, **kwargs):
            if user.user_type != 'recruiter':
                return jsonify({'error': 'Recruiter access required'}), 403
            return f(user, *args, **kwargs)
        return decorated_function
    
    def candidate_only(f):
        @wraps(f)
        def decorated_function(user, *args, **kwargs):
            if user.user_type != 'candidate':
                return jsonify({'error': 'Candidate access required'}), 403
            return f(user, *args, **kwargs)
        return decorated_function
    
    # ==================== AUTH ROUTES ====================
    
    @app.route('/api/auth/signup', methods=['POST'])
    def signup():
        data = request.get_json()
        
        if not data or not data.get('email') or not data.get('password') or not data.get('user_type'):
            return jsonify({'error': 'Missing required fields'}), 400
        
        if User.objects(email=data['email']).first():
            return jsonify({'error': 'Email already registered'}), 409
        
        if data['user_type'] not in ['candidate', 'recruiter']:
            return jsonify({'error': 'Invalid user type'}), 400
        
        try:
            user = User(
                email=data['email'],
                password_hash=generate_password_hash(data['password']),
                full_name=data.get('full_name', ''),
                user_type=data['user_type']
            )
            user.save()
            
            # Create candidate profile if candidate
            if data['user_type'] == 'candidate':
                profile = CandidateProfile(user_id=user)
                profile.save()
            
            # Generate JWT token
            token = generate_token(user.id)
            
            return jsonify({
                'message': 'Signup successful',
                'token': token,
                'user': user.to_dict()
            }), 201
        except NotUniqueError:
            return jsonify({'error': 'Email already registered'}), 409
        except Exception as e:
            return jsonify({'error': str(e)}), 400
    
    @app.route('/api/auth/login', methods=['POST'])
    def login():
        data = request.get_json()
        
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({'error': 'Missing email or password'}), 400
        
        user = User.objects(email=data['email']).first()
        
        if not user or not check_password_hash(user.password_hash, data['password']):
            return jsonify({'error': 'Invalid credentials'}), 401
        
        # Generate JWT token
        token = generate_token(user.id)
        
        return jsonify({
            'message': 'Login successful',
            'token': token,
            'user': user.to_dict()
        }), 200
    
    @app.route('/api/auth/logout', methods=['POST'])
    @login_required
    def logout(user):
        # JWT is stateless, no session to clear
        return jsonify({'message': 'Logout successful'}), 200
    
    @app.route('/api/auth/me', methods=['GET'])
    @login_required
    def get_current_user(user):
        user_data = user.to_dict()
        if user.user_type == 'candidate':
            try:
                profile = CandidateProfile.objects(user_id=user).first()
                user_data['profile'] = profile.to_dict() if profile else None
            except:
                user_data['profile'] = None
        return jsonify(user_data), 200
    
    # ==================== CANDIDATE PROFILE ROUTES ====================
    
    @app.route('/api/candidate/profile', methods=['GET'])
    @login_required
    @candidate_only
    def get_candidate_profile(user):
        try:
            profile = CandidateProfile.objects(user_id=user).first()
            if not profile:
                return jsonify({'error': 'Profile not found'}), 404
            return jsonify(profile.to_dict()), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/candidate/profile', methods=['PUT'])
    @login_required
    @candidate_only
    def update_candidate_profile(user):
        data = request.get_json()
        
        try:
            profile = CandidateProfile.objects(user_id=user).first()
            
            if not profile:
                return jsonify({'error': 'Profile not found'}), 404
            
            # Update basic fields
            if 'headline' in data:
                profile.headline = data['headline']
            if 'bio' in data:
                profile.bio = data['bio']
            if 'location' in data:
                profile.location = data['location']
            if 'phone' in data:
                profile.phone = data['phone']
            
            # Update structured data
            if 'experiences' in data:
                profile.experiences = data['experiences']
            if 'skills' in data:
                profile.skills = data['skills']
            if 'projects' in data:
                profile.projects = data['projects']
            if 'education' in data:
                profile.education = data['education']
            if 'certifications' in data:
                profile.certifications = data['certifications']
            
            # Calculate profile completion
            completion = 0
            completion += 10 if profile.headline else 0
            completion += 15 if profile.bio else 0
            completion += 15 if profile.experiences else 0
            completion += 20 if profile.skills else 0
            completion += 15 if profile.projects else 0
            completion += 15 if profile.education else 0
            completion += 10 if profile.certifications else 0
            
            profile.profile_completion = min(completion, 100)
            profile.updated_at = datetime.utcnow()
            
            profile.save()
            
            return jsonify({
                'message': 'Profile updated',
                'profile': profile.to_dict()
            }), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/candidate/profile/publish', methods=['POST'])
    @login_required
    @candidate_only
    def publish_profile(user):
        try:
            profile = CandidateProfile.objects(user_id=user).first()
            if not profile:
                return jsonify({'error': 'Profile not found'}), 404
            
            profile.is_published = True
            profile.save()
            
            return jsonify({
                'message': 'Profile published',
                'profile': profile.to_dict()
            }), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    # ==================== RECRUITER ROUTES ====================
    
    @app.route('/api/recruiter/candidates', methods=['GET'])
    @login_required
    @recruiter_only
    def get_candidates(user):
        try:
            # Get all published candidate profiles
            candidates = CandidateProfile.objects(is_published=True)
            
            return jsonify({
                'total': len(candidates),
                'candidates': [extract_candidate_payload(c) for c in candidates]
            }), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/recruiter/candidate/<candidate_id>', methods=['GET'])
    @login_required
    @recruiter_only
    def get_candidate_detail(user, candidate_id):
        try:
            profile = CandidateProfile.objects.with_id(ObjectId(candidate_id))
            if not profile or not profile.is_published:
                return jsonify({'error': 'Candidate not found'}), 404
            
            candidate_user = User.objects.with_id(profile.user_id.id)
            
            return jsonify({
                'profile': extract_candidate_payload(profile),
                'user': candidate_user.to_dict() if candidate_user else {}
            }), 200
        except Exception as e:
            return jsonify({'error': 'Candidate not found'}), 404
    
    @app.route('/api/recruiter/shortlist', methods=['POST'])
    @login_required
    @recruiter_only
    def shortlist_candidate(user):
        data = request.get_json()
        
        if not data or not data.get('candidate_id'):
            return jsonify({'error': 'Missing candidate_id'}), 400
        
        try:
            # Convert candidate_id string to ObjectId
            candidate_obj_id = ObjectId(data['candidate_id']) if isinstance(data['candidate_id'], str) else data['candidate_id']
            candidate = CandidateProfile.objects.with_id(candidate_obj_id)
            
            if not candidate:
                return jsonify({'error': f'Candidate not found with ID: {data["candidate_id"]}'}), 404
            
            # Check if already shortlisted
            existing = Shortlist.objects(recruiter_id=user, candidate_id=candidate).first()
            
            if existing:
                return jsonify({'error': 'Candidate already shortlisted'}), 409
            
            shortlist = Shortlist(
                recruiter_id=user,
                candidate_id=candidate,
                status=data.get('status', 'shortlisted'),
                notes=data.get('notes', '')
            )
            
            shortlist.save()
            
            return jsonify({
                'message': 'Candidate shortlisted',
                'shortlist': shortlist.to_dict()
            }), 201
        except Exception as e:
            return jsonify({'error': f'Error: {str(e)}'}), 400
    
    @app.route('/api/recruiter/shortlist/<shortlist_id>', methods=['PUT'])
    @login_required
    @recruiter_only
    def update_shortlist(user, shortlist_id):
        try:
            shortlist = Shortlist.objects.with_id(ObjectId(shortlist_id))
            
            if not shortlist or shortlist.recruiter_id.id != user.id:
                return jsonify({'error': 'Shortlist not found'}), 404
            
            data = request.get_json()
            
            if 'status' in data:
                shortlist.status = data['status']
            if 'notes' in data:
                shortlist.notes = data['notes']
            
            shortlist.updated_at = datetime.utcnow()
            shortlist.save()
            
            return jsonify({
                'message': 'Shortlist updated',
                'shortlist': shortlist.to_dict()
            }), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 404

    @app.route('/api/recruiter/shortlist/<shortlist_id>', methods=['DELETE'])
    @login_required
    @recruiter_only
    def delete_shortlist(user, shortlist_id):
        try:
            shortlist = Shortlist.objects.with_id(ObjectId(shortlist_id))

            if not shortlist or shortlist.recruiter_id.id != user.id:
                return jsonify({'error': 'Shortlist not found'}), 404

            shortlist.delete()

            return jsonify({
                'message': 'Shortlist removed'
            }), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 404

    @app.route('/api/recruiter/shortlist', methods=['GET'])
    @login_required
    @recruiter_only
    def get_shortlist(user):
        try:
            shortlists = Shortlist.objects(recruiter_id=user)
            
            result = []
            for shortlist in shortlists:
                try:
                    candidate = CandidateProfile.objects.with_id(shortlist.candidate_id.id)
                    if candidate:
                        result.append({
                            'shortlist': shortlist.to_dict(),
                            'candidate': extract_candidate_payload(candidate)
                        })
                except:
                    pass
            
            return jsonify({
                'total': len(result),
                'shortlists': result
            }), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @app.route('/api/public/profile/<candidate_id>', methods=['GET'])
    def get_public_profile(candidate_id):
        try:
            profile = CandidateProfile.objects.with_id(ObjectId(candidate_id))
            if not profile or not profile.is_published:
                return jsonify({'error': 'Profile not found'}), 404

            return jsonify({
                'profile': extract_candidate_payload(profile)
            }), 200
        except Exception:
            return jsonify({'error': 'Profile not found'}), 404
    
    # ==================== AI ROUTES (Placeholder) ====================
    
    @app.route('/api/ai/suggest-skills', methods=['POST'])
    @login_required
    @candidate_only
    def suggest_skills(user):
        """AI-assisted skill suggestions based on experience"""
        data = request.get_json()
        experience_text = data.get('experience', '')
        
        # Placeholder for AI integration (OpenAI, HuggingFace, etc.)
        suggested_skills = [
            {'name': 'Python', 'confidence': 0.95},
            {'name': 'Web Development', 'confidence': 0.89},
            {'name': 'Problem Solving', 'confidence': 0.92}
        ]
        
        return jsonify({
            'suggestions': suggested_skills
        }), 200
    
    @app.route('/api/ai/generate-summary', methods=['POST'])
    @login_required
    @candidate_only
    def generate_summary(user):
        """AI-assisted profile summary generation"""
        try:
            profile = CandidateProfile.objects(user_id=user).first()
            if not profile:
                return jsonify({'error': 'Profile not found'}), 404
            
            # Placeholder for AI summary generation
            skills_str = ', '.join([s['name'] for s in profile.skills[:3]]) if profile.skills else 'various skills'
            summary = f"{profile.headline} with expertise in {skills_str}"
            
            return jsonify({
                'summary': summary
            }), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @app.route('/api/ai/recommendations', methods=['GET'])
    @login_required
    @candidate_only
    def ai_recommendations(user):
        try:
            profile = CandidateProfile.objects(user_id=user).first()
            if not profile:
                return jsonify({'error': 'Profile not found'}), 404

            return jsonify({
                'recommendations': build_recommendations(profile)
            }), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @app.route('/api/ai/structure-experience', methods=['POST'])
    @login_required
    @candidate_only
    def structure_experience(user):
        data = request.get_json() or {}
        raw_text = data.get('text', '')

        if not raw_text.strip():
            return jsonify({'error': 'Experience text is required'}), 400

        return jsonify({
            'experience': structure_experience_text(raw_text)
        }), 200
    
    # ==================== HEALTH CHECK ====================
    
    @app.route('/api/health', methods=['GET'])
    def health_check():
        return jsonify({'status': 'ok'}), 200
