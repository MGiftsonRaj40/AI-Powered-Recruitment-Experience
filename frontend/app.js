// API Configuration
const API_URL = 'http://localhost:5000/api';
let currentUser = null;
let currentProfile = null;
let authToken = localStorage.getItem('authToken'); 
let currentPage = 'landingPage';
let selectedCompareCandidates = [];
let basicInfoAutosaveTimer = null;
let isHydratingBasicInfo = false;

const PAGE_LABELS = {
    landingPage: 'Welcome',
    onboardingPage: 'Onboarding',
    signupPage: 'Create Account',
    loginPage: 'Login',
    candidateDashboard: 'Profile Overview',
    profileBuilderPage: 'Profile Builder',
    recruiterDashboard: 'Candidate Discovery',
    compareCandidatesPage: 'Compare Candidates',
    recruiterCandidateDetail: 'Candidate Profile',
    recruiterShortlistPage: 'Shortlist',
    confirmationPage: 'Confirmation',
    publicProfilePage: 'Shared Profile'
};

// Helper function to get Authorization header
function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
    };
}

// Page Navigation
function goToPage(pageName) {
    currentPage = pageName;

    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.style.display = 'none';
    });

    // Show selected page
    const page = document.getElementById(pageName);
    if (page) {
        page.style.display = 'block';

        // Load data for specific pages
        if (pageName === 'candidateDashboard' && currentUser?.user_type === 'candidate') {
            loadCandidateProfile();
        } else if (pageName === 'onboardingPage' && currentUser?.user_type === 'candidate') {
            loadCandidateProfile();
        } else if (pageName === 'recruiterDashboard' && currentUser?.user_type === 'recruiter') {
            loadCandidates();
        } else if (pageName === 'compareCandidatesPage' && currentUser?.user_type === 'recruiter') {
            loadComparisonPage();
        } else if (pageName === 'recruiterShortlistPage' && currentUser?.user_type === 'recruiter') {
            loadShortlist();
        }
    }

    renderNavigation();
}

function getHomePage() {
    if (!currentUser) return 'landingPage';
    return currentUser.user_type === 'candidate' ? 'candidateDashboard' : 'recruiterDashboard';
}

function goToHomePage() {
    goToPage(getHomePage());
}

function getNavigationLinks() {
    if (!currentUser) {
        return [
            { page: 'landingPage', label: 'Home' },
            { page: 'signupPage', label: 'Sign Up' },
            { page: 'loginPage', label: 'Login' }
        ];
    }

    if (currentUser.user_type === 'candidate') {
        return [
            { page: 'candidateDashboard', label: 'Dashboard' },
            { page: 'onboardingPage', label: 'AI Guide' },
            { page: 'profileBuilderPage', label: 'Build Profile' }
        ];
    }

    return [
        { page: 'recruiterDashboard', label: 'Candidates' },
        { page: 'compareCandidatesPage', label: 'Compare' },
        { page: 'recruiterShortlistPage', label: 'Shortlist' }
    ];
}

function renderNavigation() {
    const navLinks = document.getElementById('navLinks');
    const pageContext = document.getElementById('pageContext');

    if (!navLinks || !pageContext) return;

    const links = getNavigationLinks();
    navLinks.innerHTML = links.map(link => `
        <button
            type="button"
            class="nav-link ${currentPage === link.page ? 'active' : ''}"
            onclick="goToPage('${link.page}')"
        >
            ${link.label}
        </button>
    `).join('');

    const isPrimaryPage = links.some(link => link.page === currentPage);
    pageContext.textContent = isPrimaryPage ? '' : (PAGE_LABELS[currentPage] || '');
    pageContext.style.display = pageContext.textContent ? 'inline-flex' : 'none';
}

function setSaveStatus(message, state = 'idle') {
    const saveStatus = document.getElementById('saveStatus');
    const basicInfoAutosave = document.getElementById('basicInfoAutosave');

    [saveStatus, basicInfoAutosave].forEach(el => {
        if (!el) return;
        el.textContent = message;
        el.className = `save-status ${state}`;
    });
}

function getBasicInfoData() {
    return {
        headline: document.getElementById('headline')?.value || '',
        bio: document.getElementById('bio')?.value || '',
        location: document.getElementById('location')?.value || '',
        phone: document.getElementById('phone')?.value || ''
    };
}

function initializeBasicInfoAutosave() {
    ['headline', 'bio', 'location', 'phone'].forEach(id => {
        const input = document.getElementById(id);
        if (!input || input.dataset.autosaveBound === 'true') return;

        input.addEventListener('input', () => {
            if (isHydratingBasicInfo) return;
            scheduleBasicInfoAutosave();
        });
        input.dataset.autosaveBound = 'true';
    });
}

function scheduleBasicInfoAutosave() {
    clearTimeout(basicInfoAutosaveTimer);
    setSaveStatus('Saving draft...', 'saving');
    basicInfoAutosaveTimer = setTimeout(() => {
        updateProfile(getBasicInfoData(), { silentAlert: true });
    }, 700);
}

function updateCompareSelectionSummary() {
    const summary = document.getElementById('compareSelectionSummary');
    if (!summary) return;

    if (selectedCompareCandidates.length === 0) {
        summary.textContent = 'Select 2 or more candidates to compare.';
    } else if (selectedCompareCandidates.length === 1) {
        summary.textContent = '1 candidate selected. Pick one more to compare side by side.';
    } else {
        summary.textContent = `${selectedCompareCandidates.length} candidates selected for comparison.`;
    }
}

function switchTab(tabName, button) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    const tab = document.getElementById(tabName);
    if (tab) tab.style.display = 'block';

    if (button) {
        button.classList.add('active');
    }

    // Load data for tab
    if (tabName === 'experienceTab') loadExperienceList();
    if (tabName === 'skillsTab') loadSkillsList();
    if (tabName === 'projectsTab') loadProjectsList();
    if (tabName === 'educationTab') loadEducationList();
}

// ==================== AUTHENTICATION ====================

async function handleSignup(event) {
    event.preventDefault();

    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const fullName = document.getElementById('signupName').value;
    const userType = document.getElementById('userTypeSelect').value;

    try {
        const response = await fetch(`${API_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, full_name: fullName, user_type: userType })
        });

        const data = await response.json();

        if (response.ok) {
            // Store JWT token
            authToken = data.token;
            localStorage.setItem('authToken', authToken);

            currentUser = data.user;
            updateUserInfo();
            showAlert(`Welcome ${data.user.full_name}!`, 'success');

            if (userType === 'candidate') {
                goToPage('onboardingPage');
            } else {
                goToPage('recruiterDashboard');
            }
        } else {
            showAlert(data.error || 'Signup failed', 'danger');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'danger');
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            // Store JWT token
            authToken = data.token;
            localStorage.setItem('authToken', authToken);

            currentUser = data.user;
            updateUserInfo();
            showAlert(`Welcome back, ${data.user.full_name}!`, 'success');

            if (data.user.user_type === 'candidate') {
                goToPage('candidateDashboard');
            } else {
                goToPage('recruiterDashboard');
            }
        } else {
            showAlert(data.error || 'Login failed', 'danger');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'danger');
    }
}

function updateUserInfo() {
    const userInfoEl = document.getElementById('userInfo');
    const logoutBtn = document.getElementById('logoutBtn');

    if (currentUser) {
        userInfoEl.textContent = `${currentUser.full_name} (${currentUser.user_type})`;
        logoutBtn.style.display = 'block';
    } else {
        userInfoEl.textContent = '';
        logoutBtn.style.display = 'none';
    }

    renderNavigation();
}

async function handleLogout() {
    try {
        await fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: getAuthHeaders()
        });

        currentUser = null;
        authToken = null;
        localStorage.removeItem('authToken');
        updateUserInfo();
        goToPage('landingPage');
        showAlert('Logged out successfully', 'success');
    } catch (error) {
        showAlert('Error: ' + error.message, 'danger');
    }
}

document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

// ==================== CANDIDATE PROFILE ====================

async function loadCandidateProfile() {
    try {
        const response = await fetch(`${API_URL}/candidate/profile`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        const profile = await response.json();
        if (!response.ok) {
            throw new Error(profile.error || 'Failed to load candidate profile');
        }

        currentProfile = {
            ...profile,
            ai_summary: currentProfile?.ai_summary,
            ai_recommendations: currentProfile?.ai_recommendations
        };
        displayProfilePreview(currentProfile);
        updateProfileUI(currentProfile);
        updateAIOutputCards();
    } catch (error) {
        console.error('Error loading profile:', error);
        setSaveStatus('Could not load profile', 'error');
        showAlert('Error loading profile: ' + error.message, 'danger');
    }
}

function displayProfilePreview(profile) {
    const preview = document.getElementById('profilePreview');

    let html = '';

    if (profile.ai_summary) {
        html += `
            <div class="summary-banner">
                <strong>AI Summary</strong>
                <p>${profile.ai_summary}</p>
            </div>
        `;
    }

    if (profile.headline) {
        html += `<h3>${profile.headline}</h3>`;
    }

    if (profile.location) {
        html += `<p><strong>Location:</strong> ${profile.location}</p>`;
    }

    if (profile.phone) {
        html += `<p><strong>Phone:</strong> ${profile.phone}</p>`;
    }

    if (profile.bio) {
        html += `<p><strong>About:</strong> ${profile.bio}</p>`;
    }

    if (profile.experiences && profile.experiences.length > 0) {
        html += '<h3>Experience</h3>';
        profile.experiences.forEach(exp => {
            html += `
                <div>
                    <strong>${exp.title}</strong> at ${exp.company}
                    <p>${exp.duration}</p>
                    <p>${exp.description}</p>
                </div>
            `;
        });
    }

    if (profile.skills && profile.skills.length > 0) {
        html += '<h3>Skills</h3>';
        html += '<ul>';
        profile.skills.forEach(skill => {
            html += `<li>${skill.name} (${skill.proficiency})</li>`;
        });
        html += '</ul>';
    }

    if (profile.projects && profile.projects.length > 0) {
        html += '<h3>Projects</h3>';
        profile.projects.forEach(project => {
            html += `
                <div>
                    <strong>${project.title}</strong>
                    <p>${project.description}</p>
                </div>
            `;
        });
    }

    if (profile.education && profile.education.length > 0) {
        html += '<h3>Education</h3>';
        profile.education.forEach(edu => {
            html += `
                <div>
                    <strong>${edu.degree}</strong> from ${edu.school} (${edu.year})
                </div>
            `;
        });
    }

    preview.innerHTML = html || '<p>Build your profile to get started!</p>';
}


function updateProfileUI(profile) {
    isHydratingBasicInfo = true;
    document.getElementById('headline').value = profile.headline || '';
    document.getElementById('bio').value = profile.bio || '';
    document.getElementById('location').value = profile.location || '';
    document.getElementById('phone').value = profile.phone || '';
    isHydratingBasicInfo = false;

    const progressPercent = profile.profile_completion || 0;
    document.getElementById('progressFill').style.width = progressPercent + '%';
    document.getElementById('progressText').textContent = progressPercent + '% Complete';
    setSaveStatus('All changes synced', 'synced');

    const publishBtn = document.getElementById('publishBtn');
    if (profile.is_published) {
        publishBtn.textContent = 'Profile Published';
        publishBtn.disabled = true;
    } else {
        publishBtn.textContent = 'Publish Profile';
        publishBtn.disabled = false;
    }
}

function updateAIOutputCards() {
    const summaryCard = document.getElementById('aiSummaryCard');
    const recommendationsCard = document.getElementById('aiRecommendationsCard');

    if (summaryCard) {
        if (currentProfile?.ai_summary) {
            summaryCard.style.display = 'block';
            summaryCard.innerHTML = `
                <span class="eyebrow">AI Summary</span>
                <p>${currentProfile.ai_summary}</p>
            `;
        } else {
            summaryCard.style.display = 'none';
            summaryCard.innerHTML = '';
        }
    }

    if (recommendationsCard) {
        if (currentProfile?.ai_recommendations?.length) {
            recommendationsCard.style.display = 'block';
            recommendationsCard.innerHTML = `
                <span class="eyebrow">Role-Based Recommendations</span>
                <ul>${currentProfile.ai_recommendations.map(item => `<li>${item}</li>`).join('')}</ul>
            `;
        } else {
            recommendationsCard.style.display = 'none';
            recommendationsCard.innerHTML = '';
        }
    }
}

async function saveBasicInfo(event) {
    event.preventDefault();

    try {
        const result = await updateProfile(getBasicInfoData());
        if (result) showAlert('Profile saved!', 'success');
    } catch (error) {
        showAlert('Error: ' + error.message, 'danger');
    }
}

async function generateAISummary() {
    try {
        const response = await fetch(`${API_URL}/ai/generate-summary`, {
            method: 'POST',
            headers: getAuthHeaders()
        });

        const data = await response.json();
        if (response.ok) {
            currentProfile.ai_summary = data.summary;
            displayProfilePreview(currentProfile);
            updateAIOutputCards();
            showAlert('AI summary generated.', 'success');
        } else {
            showAlert(data.error || 'Failed to generate summary', 'danger');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'danger');
    }
}

async function loadAIRecommendations() {
    try {
        const response = await fetch(`${API_URL}/ai/recommendations`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        const data = await response.json();
        if (response.ok) {
            currentProfile.ai_recommendations = data.recommendations || [];
            updateAIOutputCards();
            showAlert('Role-based recommendations updated.', 'success');
        } else {
            showAlert(data.error || 'Failed to load recommendations', 'danger');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'danger');
    }
}

async function structureExperienceWithAI() {
    const text = document.getElementById('experienceNarrative')?.value.trim();
    if (!text) {
        showAlert('Add a short experience description first.', 'info');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/ai/structure-experience`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ text })
        });

        const data = await response.json();
        if (response.ok) {
            addExperience();
            document.getElementById('jobTitle').value = data.experience.title || '';
            document.getElementById('company').value = data.experience.company || '';
            document.getElementById('duration').value = data.experience.duration || '';
            document.getElementById('jobDesc').value = data.experience.description || '';
            showAlert('AI filled the experience form. Review and save it.', 'success');
        } else {
            showAlert(data.error || 'Failed to structure experience', 'danger');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'danger');
    }
}

// ==================== EXPERIENCE ====================

function loadExperienceList() {
    const list = document.getElementById('experienceList');

    if (!currentProfile || !currentProfile.experiences.length) {
        list.innerHTML = '<p>No experience added yet.</p>';
        return;
    }

    let html = '<div class="experience-list">';
    currentProfile.experiences.forEach((exp, index) => {
        html += `
            <div class="experience-item">
                <div>
                    <strong>${exp.title}</strong> at ${exp.company} (${exp.duration})
                    <p>${exp.description}</p>
                </div>
                <button class="item-delete" onclick="deleteExperience(${index})">Delete</button>
            </div>
        `;
    });
    html += '</div>';

    list.innerHTML = html;
}

function addExperience() {
    document.getElementById('experienceForm').style.display = 'block';
    document.getElementById('jobTitle').value = '';
    document.getElementById('company').value = '';
    document.getElementById('duration').value = '';
    document.getElementById('jobDesc').value = '';
}

function cancelExperience() {
    document.getElementById('experienceForm').style.display = 'none';
}

async function saveExperience(event) {
    event.preventDefault();

    const experience = {
        title: document.getElementById('jobTitle').value,
        company: document.getElementById('company').value,
        duration: document.getElementById('duration').value,
        description: document.getElementById('jobDesc').value
    };

    if (!currentProfile.experiences) currentProfile.experiences = [];
    currentProfile.experiences.push(experience);

    await updateProfile({ experiences: currentProfile.experiences });

    loadExperienceList();
    cancelExperience();
    showAlert('Experience added!', 'success');
}

function deleteExperience(index) {
    currentProfile.experiences.splice(index, 1);
    updateProfile({ experiences: currentProfile.experiences });
    loadExperienceList();
}

// ==================== SKILLS ====================

function loadSkillsList() {
    const list = document.getElementById('skillsList');

    if (!currentProfile || !currentProfile.skills.length) {
        list.innerHTML = '<p>No skills added yet.</p>';
        return;
    }

    let html = '<div class="skill-list">';
    currentProfile.skills.forEach((skill, index) => {
        html += `
            <div class="skill-item">
                <div>
                    <strong>${skill.name}</strong>
                    <span>${skill.proficiency}</span>
                </div>
                <button class="item-delete" onclick="deleteSkill(${index})">Delete</button>
            </div>
        `;
    });
    html += '</div>';

    list.innerHTML = html;
}

function addSkill() {
    const skillName = document.getElementById('skillInput').value.trim();
    const proficiency = document.getElementById('proficiencySelect').value;

    if (!skillName) {
        showAlert('Please enter a skill name', 'danger');
        return;
    }

    if (!currentProfile.skills) currentProfile.skills = [];

    // Check if skill already exists
    if (currentProfile.skills.some(s => s.name.toLowerCase() === skillName.toLowerCase())) {
        showAlert('Skill already added', 'info');
        return;
    }

    currentProfile.skills.push({
        name: skillName,
        proficiency: proficiency
    });

    updateProfile({ skills: currentProfile.skills });

    document.getElementById('skillInput').value = '';
    loadSkillsList();
    showAlert('Skill added!', 'success');
}

function deleteSkill(index) {
    currentProfile.skills.splice(index, 1);
    updateProfile({ skills: currentProfile.skills });
    loadSkillsList();
}

async function getSuggestedSkills() {
    if (!currentProfile.experiences || currentProfile.experiences.length === 0) {
        showAlert('Add some experience first to get skill suggestions', 'info');
        return;
    }

    try {
        const expText = currentProfile.experiences.map(e => `${e.title}: ${e.description}`).join(' ');

        const response = await fetch(`${API_URL}/ai/suggest-skills`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ experience: expText })
        });

        const data = await response.json();

        if (response.ok) {
            showAlert(
                `Suggested skills: ${data.suggestions.map(s => s.name).join(', ')}`,
                'info'
            );
        }
    } catch (error) {
        showAlert('Error getting suggestions: ' + error.message, 'danger');
    }
}

// ==================== PROJECTS ====================

function loadProjectsList() {
    const list = document.getElementById('projectsList');

    if (!currentProfile || !currentProfile.projects.length) {
        list.innerHTML = '<p>No projects added yet.</p>';
        return;
    }

    let html = '<div class="project-list">';
    currentProfile.projects.forEach((project, index) => {
        html += `
            <div class="project-item">
                <div>
                    <strong>${project.title}</strong>
                    <p>${project.description}</p>
                    ${project.url ? `<p><a href="${project.url}" target="_blank">View Project</a></p>` : ''}
                </div>
                <button class="item-delete" onclick="deleteProject(${index})">Delete</button>
            </div>
        `;
    });
    html += '</div>';

    list.innerHTML = html;
}

function addProject() {
    document.getElementById('projectForm').style.display = 'block';
    document.getElementById('projectTitle').value = '';
    document.getElementById('projectDesc').value = '';
    document.getElementById('projectUrl').value = '';
}

function cancelProject() {
    document.getElementById('projectForm').style.display = 'none';
}

async function saveProject(event) {
    event.preventDefault();

    const project = {
        title: document.getElementById('projectTitle').value,
        description: document.getElementById('projectDesc').value,
        url: document.getElementById('projectUrl').value
    };

    if (!currentProfile.projects) currentProfile.projects = [];
    currentProfile.projects.push(project);

    await updateProfile({ projects: currentProfile.projects });

    loadProjectsList();
    cancelProject();
    showAlert('Project added!', 'success');
}

function deleteProject(index) {
    currentProfile.projects.splice(index, 1);
    updateProfile({ projects: currentProfile.projects });
    loadProjectsList();
}

// ==================== EDUCATION ====================

function loadEducationList() {
    const list = document.getElementById('educationList');

    if (!currentProfile || !currentProfile.education.length) {
        list.innerHTML = '<p>No education added yet.</p>';
        return;
    }

    let html = '<div class="education-list">';
    currentProfile.education.forEach((edu, index) => {
        html += `
            <div class="education-item">
                <div>
                    <strong>${edu.degree}</strong> from ${edu.school} (${edu.year})
                </div>
                <button class="item-delete" onclick="deleteEducation(${index})">Delete</button>
            </div>
        `;
    });
    html += '</div>';

    list.innerHTML = html;
}

function addEducation() {
    document.getElementById('educationForm').style.display = 'block';
    document.getElementById('school').value = '';
    document.getElementById('degree').value = '';
    document.getElementById('gradYear').value = '';
}

function cancelEducation() {
    document.getElementById('educationForm').style.display = 'none';
}

async function saveEducation(event) {
    event.preventDefault();

    const education = {
        school: document.getElementById('school').value,
        degree: document.getElementById('degree').value,
        year: document.getElementById('gradYear').value
    };

    if (!currentProfile.education) currentProfile.education = [];
    currentProfile.education.push(education);

    await updateProfile({ education: currentProfile.education });

    loadEducationList();
    cancelEducation();
    showAlert('Education added!', 'success');
}

function deleteEducation(index) {
    currentProfile.education.splice(index, 1);
    updateProfile({ education: currentProfile.education });
    loadEducationList();
}

// ==================== PROFILE UPDATE ====================

async function updateProfile(data, options = {}) {
    try {
        setSaveStatus('Saving draft...', 'saving');
        const response = await fetch(`${API_URL}/candidate/profile`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            currentProfile = {
                ...result.profile,
                ai_summary: currentProfile?.ai_summary,
                ai_recommendations: currentProfile?.ai_recommendations
            };
            updateProfileUI(currentProfile);
            displayProfilePreview(currentProfile);
            updateAIOutputCards();
            if (!options.silentAlert) setSaveStatus('All changes synced', 'synced');
            return currentProfile;
        } else {
            setSaveStatus('Could not sync changes', 'error');
            showAlert(result.error || 'Failed to save profile', 'danger');
        }
    } catch (error) {
        setSaveStatus('Could not sync changes', 'error');
        showAlert('Error saving profile: ' + error.message, 'danger');
    }
}

async function publishProfile() {
    try {
        const response = await fetch(`${API_URL}/candidate/profile/publish`, {
            method: 'POST',
            headers: getAuthHeaders()
        });

        const result = await response.json();

        if (response.ok) {
            currentProfile = {
                ...result.profile,
                ai_summary: currentProfile?.ai_summary,
                ai_recommendations: currentProfile?.ai_recommendations
            };
            updateProfileUI(currentProfile);
            displayProfilePreview(currentProfile);
            showAlert('Profile published! Recruiters can now see you.', 'success');
            goToPage('confirmationPage');
        } else {
            showAlert(result.error || 'Failed to publish', 'danger');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'danger');
    }
}

async function shareProfileLink() {
    if (!currentProfile?.id) {
        showAlert('Save your profile before sharing it.', 'info');
        return;
    }

    if (!currentProfile.is_published) {
        showAlert('Publish your profile before sharing the public link.', 'info');
        return;
    }

    const shareUrl = `${window.location.origin}${window.location.pathname}?profile=${currentProfile.id}`;

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            showAlert('Public profile link copied to clipboard.', 'success');
        } else {
            window.prompt('Copy this profile link', shareUrl);
        }
    } catch (error) {
        window.prompt('Copy this profile link', shareUrl);
    }
}

function generateResumePdf() {
    if (!currentProfile) {
        showAlert('Load your profile first.', 'info');
        return;
    }

    const resumeWindow = window.open('', '_blank', 'width=900,height=700');
    if (!resumeWindow) {
        showAlert('Please allow pop-ups to export the resume.', 'danger');
        return;
    }

    const skills = (currentProfile.skills || []).map(skill => `${skill.name} (${skill.proficiency})`).join(', ');
    const experienceHtml = (currentProfile.experiences || []).map(exp => `
        <div style="margin-bottom:12px;">
            <strong>${exp.title || ''}</strong> ${exp.company ? `at ${exp.company}` : ''}
            <div>${exp.duration || ''}</div>
            <p>${exp.description || ''}</p>
        </div>
    `).join('');
    const projectHtml = (currentProfile.projects || []).map(project => `
        <div style="margin-bottom:12px;">
            <strong>${project.title || ''}</strong>
            <p>${project.description || ''}</p>
        </div>
    `).join('');
    const educationHtml = (currentProfile.education || []).map(edu => `
        <div style="margin-bottom:12px;">
            <strong>${edu.degree || ''}</strong> from ${edu.school || ''} (${edu.year || ''})
        </div>
    `).join('');

    resumeWindow.document.write(`
        <html>
        <head>
            <title>${currentProfile.headline || 'Candidate Resume'}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 32px; color: #111827; }
                h1, h2 { margin-bottom: 8px; }
                h2 { border-bottom: 1px solid #d1d5db; padding-bottom: 6px; margin-top: 24px; }
                p { line-height: 1.5; }
            </style>
        </head>
        <body>
            <h1>${currentUser?.full_name || currentProfile.full_name || 'Candidate'}</h1>
            <p>${currentProfile.headline || ''}</p>
            <p>${currentProfile.location || ''} ${currentProfile.phone ? `| ${currentProfile.phone}` : ''}</p>
            ${currentProfile.ai_summary ? `<h2>Summary</h2><p>${currentProfile.ai_summary}</p>` : currentProfile.bio ? `<h2>Summary</h2><p>${currentProfile.bio}</p>` : ''}
            ${experienceHtml ? `<h2>Experience</h2>${experienceHtml}` : ''}
            ${skills ? `<h2>Skills</h2><p>${skills}</p>` : ''}
            ${projectHtml ? `<h2>Projects</h2>${projectHtml}` : ''}
            ${educationHtml ? `<h2>Education</h2>${educationHtml}` : ''}
        </body>
        </html>
    `);
    resumeWindow.document.close();
    resumeWindow.focus();
    resumeWindow.print();
}

// ==================== RECRUITER - CANDIDATES ====================

async function loadCandidates() {
    const container = document.getElementById('candidatesList');
    container.innerHTML = '<p class="loading">Loading candidates</p>';

    try {
        const response = await fetch(`${API_URL}/recruiter/candidates`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (response.ok && data.candidates.length > 0) {
            let html = '';
            data.candidates.forEach(candidate => {
                const isSelected = selectedCompareCandidates.includes(candidate.id);
                html += `
                    <div class="candidate-card">
                        <div class="candidate-card-header">
                            <h3>${candidate.full_name || 'Candidate'}</h3>
                            <p>${candidate.headline || 'No Headline'}</p>
                            <p>${candidate.location || 'Location not specified'}</p>
                        </div>
                        <div class="candidate-compare-toggle">
                            <label>
                                <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleCompareCandidate('${candidate.id}', this.checked)">
                                Add to compare
                            </label>
                        </div>
                        <div class="candidate-card-body">
                            <p><strong>Email:</strong> ${candidate.email || 'Not provided'}</p>
                            <p>${candidate.location || 'Location not specified'}</p>
                            <p><strong>Skills:</strong> ${candidate.skills && candidate.skills.length > 0
                        ? candidate.skills.slice(0, 3).map(s => s.name).join(', ')
                        : 'Not specified'
                    }</p>
                            <p><strong>Experience:</strong> ${candidate.experiences && candidate.experiences.length > 0
                        ? candidate.experiences.length + ' position(s)'
                        : 'Not specified'
                    }</p>
                        </div>
                        <div class="candidate-card-footer">
                            <button class="btn btn-primary" onclick="viewCandidateDetail('${candidate.id}')">View Profile</button>
                            <button class="btn btn-secondary" onclick="shortlistCandidate('${candidate.id}')">Shortlist</button>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } else {
            container.innerHTML = '<p>No candidates available yet.</p>';
        }
        updateCompareSelectionSummary();
    } catch (error) {
        container.innerHTML = '<p>Error loading candidates: ' + error.message + '</p>';
        updateCompareSelectionSummary();
    }
}

async function viewCandidateDetail(candidateId) {
    try {
        const response = await fetch(`${API_URL}/recruiter/candidate/${candidateId}`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (response.ok) {
            displayCandidateDetail(data.profile, data.user);
            goToPage('recruiterCandidateDetail');
        }
    } catch (error) {
        showAlert('Error loading candidate: ' + error.message, 'danger');
    }
}

function displayCandidateDetail(profile, user) {
    const content = document.getElementById('candidateDetailContent');

    let html = `
        <div class="candidate-detail">
            <h2>${profile.headline || 'Candidate'}</h2>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Location:</strong> ${profile.location || 'Not specified'}</p>
            <p><strong>Phone:</strong> ${profile.phone || 'Not specified'}</p>
            
            <h3>About</h3>
            <p>${profile.bio || 'Not provided'}</p>
            
            <h3>Experience</h3>
    `;

    if (profile.experiences && profile.experiences.length > 0) {
        profile.experiences.forEach(exp => {
            html += `
                <div class="experience-item-full">
                    <strong>${exp.title}</strong> at ${exp.company}
                    <p>${exp.duration}</p>
                    <p>${exp.description}</p>
                </div>
            `;
        });
    } else {
        html += '<p>No experience provided</p>';
    }

    html += '<h3>Skills</h3>';
    if (profile.skills && profile.skills.length > 0) {
        html += '<div class="skills-tags">';
        profile.skills.forEach(skill => {
            html += `<span class="skill-tag">${skill.name} (${skill.proficiency})</span>`;
        });
        html += '</div>';
    } else {
        html += '<p>No skills specified</p>';
    }

    if (profile.projects && profile.projects.length > 0) {
        html += '<h3>Projects</h3>';
        profile.projects.forEach(project => {
            html += `
                <div class="project-item-full">
                    <strong>${project.title}</strong>
                    <p>${project.description}</p>
                    ${project.url ? `<p><a href="${project.url}" target="_blank">View Project</a></p>` : ''}
                </div>
            `;
        });
    }

    if (profile.education && profile.education.length > 0) {
        html += '<h3>Education</h3>';
        profile.education.forEach(edu => {
            html += `<p><strong>${edu.degree}</strong> from ${edu.school} (${edu.year})</p>`;
        });
    }

    html += `
        <div class="candidate-detail-actions">
            <button class="btn btn-primary" onclick="shortlistCandidate('${profile.id}')">Shortlist Candidate</button>
            <button class="btn btn-secondary" onclick="goToPage('recruiterDashboard')">← Back</button>
        </div>
    `;

    content.innerHTML = html;
}

async function shortlistCandidate(candidateId) {
    try {
        const response = await fetch(`${API_URL}/recruiter/shortlist`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ candidate_id: candidateId })
        });

        const data = await response.json();

        if (response.ok) {
            showAlert('Candidate shortlisted!', 'success');
            loadCandidates();
        } else {
            showAlert(data.error || 'Failed to shortlist', 'danger');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'danger');
    }
}

// ==================== RECRUITER - SHORTLIST ====================

async function loadShortlist() {
    const container = document.getElementById('shortlistContent');
    container.innerHTML = '<p class="loading">Loading shortlist</p>';

    try {
        const response = await fetch(`${API_URL}/recruiter/shortlist`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (response.ok && data.shortlists.length > 0) {
            let html = '';
            data.shortlists.forEach(item => {
                const profile = item.candidate;
                html += `
                    <div class="shortlist-item">
                        <div class="shortlist-header">
                            <div>
                                <h3>${profile.headline || 'Candidate'}</h3>
                                <p>${profile.location || 'Location not specified'}</p>
                            </div>
                            <span class="status-badge status-${item.shortlist.status}">${item.shortlist.status}</span>
                        </div>
                        
                        <p><strong>Email:</strong> ${profile.email || 'Not provided'}</p>
                        <p><strong>Phone:</strong> ${profile.phone || 'Not provided'}</p>
                        
                        ${profile.skills && profile.skills.length > 0 ? `
                            <div class="skills-tags">
                                ${profile.skills.slice(0, 5).map(s => `<span class="skill-tag">${s.name}</span>`).join('')}
                            </div>
                        ` : ''}
                        
                        <div class="shortlist-actions">
                            <select onchange="updateShortlistStatus('${item.shortlist.id}', this.value)">
                                <option value="shortlisted" ${item.shortlist.status === 'shortlisted' ? 'selected' : ''}>Shortlisted</option>
                                <option value="interviewed" ${item.shortlist.status === 'interviewed' ? 'selected' : ''}>Interviewed</option>
                                <option value="rejected" ${item.shortlist.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                            </select>
                            <button class="btn btn-secondary" onclick="removeShortlist('${item.shortlist.id}')">Remove</button>
                        </div>
                        
                        <div class="shortlist-notes">
                            <textarea placeholder="Add notes..." id="notes-${item.shortlist.id}">${item.shortlist.notes || ''}</textarea>
                            <button class="btn btn-primary" style="margin-top: 0.5rem;" onclick="updateShortlistNotes('${item.shortlist.id}')">Save Notes</button>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } else {
            container.innerHTML = '<p>No shortlisted candidates yet.</p>';
        }
    } catch (error) {
        container.innerHTML = '<p>Error loading shortlist: ' + error.message + '</p>';
    }
}

async function updateShortlistStatus(shortlistId, status) {
    try {
        const response = await fetch(`${API_URL}/recruiter/shortlist/${shortlistId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status: status })
        });

        if (response.ok) {
            showAlert('Status updated!', 'success');
            loadShortlist();
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'danger');
    }
}

async function updateShortlistNotes(shortlistId) {
    const notes = document.getElementById(`notes-${shortlistId}`).value;

    try {
        const response = await fetch(`${API_URL}/recruiter/shortlist/${shortlistId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ notes: notes })
        });

        if (response.ok) {
            showAlert('Notes saved!', 'success');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'danger');
    }
}

function toggleCompareCandidate(candidateId, isSelected) {
    if (isSelected) {
        if (!selectedCompareCandidates.includes(candidateId)) {
            selectedCompareCandidates.push(candidateId);
        }
    } else {
        selectedCompareCandidates = selectedCompareCandidates.filter(id => id !== candidateId);
    }

    updateCompareSelectionSummary();
}

async function loadComparisonPage() {
    const container = document.getElementById('compareCandidatesContent');
    if (!container) return;

    if (selectedCompareCandidates.length < 2) {
        container.innerHTML = '<p>Select at least 2 candidates from the recruiter dashboard to compare them here.</p>';
        return;
    }

    container.innerHTML = '<p class="loading">Preparing comparison</p>';

    try {
        const profiles = await Promise.all(selectedCompareCandidates.map(async candidateId => {
            const response = await fetch(`${API_URL}/recruiter/candidate/${candidateId}`, {
                method: 'GET',
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to load candidate');
            return data.profile;
        }));

        container.innerHTML = profiles.map(profile => `
            <div class="compare-card">
                <h3>${profile.full_name || 'Candidate'}</h3>
                <p><strong>${profile.headline || 'No headline yet'}</strong></p>
                <p>${profile.location || 'Location not specified'}</p>
                <p>${profile.email || 'No email available'}</p>
                <h4>Summary</h4>
                <p>${profile.bio || 'No bio provided.'}</p>
                <h4>Skills</h4>
                <p>${profile.skills?.length ? profile.skills.map(skill => skill.name).join(', ') : 'No skills listed'}</p>
                <h4>Experience</h4>
                <p>${profile.experiences?.length ? `${profile.experiences.length} role(s)` : 'No experience listed'}</p>
                <h4>Projects</h4>
                <p>${profile.projects?.length ? `${profile.projects.length} project(s)` : 'No projects listed'}</p>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = `<p>Error loading comparison: ${error.message}</p>`;
    }
}

async function loadPublicProfile(candidateId) {
    try {
        const response = await fetch(`${API_URL}/public/profile/${candidateId}`);
        const data = await response.json();

        if (response.ok) {
            const content = document.getElementById('publicProfileContent');
            content.innerHTML = `
                <div class="candidate-detail">
                    <h2>${data.profile.full_name || 'Candidate'}</h2>
                    <p><strong>${data.profile.headline || 'Professional Profile'}</strong></p>
                    <p><strong>Location:</strong> ${data.profile.location || 'Not specified'}</p>
                    <p><strong>Email:</strong> ${data.profile.email || 'Not provided'}</p>
                    <h3>About</h3>
                    <p>${data.profile.bio || 'Not provided'}</p>
                    <h3>Experience</h3>
                    ${(data.profile.experiences || []).map(exp => `
                        <div class="experience-item-full">
                            <strong>${exp.title}</strong> ${exp.company ? `at ${exp.company}` : ''}
                            <p>${exp.duration || ''}</p>
                            <p>${exp.description || ''}</p>
                        </div>
                    `).join('') || '<p>No experience provided</p>'}
                    <h3>Skills</h3>
                    <div class="skills-tags">
                        ${(data.profile.skills || []).map(skill => `<span class="skill-tag">${skill.name}</span>`).join('') || 'No skills listed'}
                    </div>
                    <h3>Projects</h3>
                    ${(data.profile.projects || []).map(project => `
                        <div class="project-item-full">
                            <strong>${project.title}</strong>
                            <p>${project.description || ''}</p>
                        </div>
                    `).join('') || '<p>No projects provided</p>'}
                </div>
            `;
            goToPage('publicProfilePage');
        } else {
            showAlert(data.error || 'Profile not found', 'danger');
            goToPage('landingPage');
        }
    } catch (error) {
        showAlert('Error loading shared profile: ' + error.message, 'danger');
        goToPage('landingPage');
    }
}

async function removeShortlist(shortlistId) {
    const confirmed = window.confirm('Remove this candidate from your shortlist?');
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_URL}/recruiter/shortlist/${shortlistId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (response.ok) {
            showAlert('Candidate removed from shortlist.', 'success');
            loadShortlist();
        } else {
            showAlert(data.error || 'Failed to remove candidate', 'danger');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'danger');
    }
}

// ==================== UTILITIES ====================

function showAlert(message, type = 'info') {
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => alert.remove());

    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;

    const content = document.getElementById('content');
    content.insertBefore(alert, content.firstChild);

    setTimeout(() => alert.remove(), 5000);
}

// Check if user is logged in on page load
window.addEventListener('load', async () => {
    initializeBasicInfoAutosave();
    updateCompareSelectionSummary();

    const sharedProfileId = new URLSearchParams(window.location.search).get('profile');
    if (sharedProfileId) {
        currentUser = null;
        authToken = null;
        localStorage.removeItem('authToken');
        updateUserInfo();
        await loadPublicProfile(sharedProfileId);
        return;
    }

    try {
        if (!authToken) {
            goToPage('landingPage');
            return;
        }

        const response = await fetch(`${API_URL}/auth/me`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            const user = await response.json();
            currentUser = user;
            updateUserInfo();

            if (user.user_type === 'candidate') {
                goToPage('candidateDashboard');
            } else {
                goToPage('recruiterDashboard');
            }
        } else {
            goToPage('landingPage');
        }
    } catch (error) {
        goToPage('landingPage');
    }
});
